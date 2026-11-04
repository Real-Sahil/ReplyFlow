import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardCopy, Plus, Store } from "lucide-react";
import { useNotify } from "ra-core";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { useBusinessSettings } from "../finance/useBusinessSettings";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPence } from "../quotes/quoteMath";
import {
  orderMessage,
  shoppingList,
  type ShoppingGroup,
  type SupplierInfo,
} from "./shopping";
import { qty } from "./stockTypes";
import { SUPPLIERS_KEY, useItemExtras, useSuppliers } from "./useSuppliers";
import { useStockLevels } from "./useStock";

type Supplier = SupplierInfo & { notes: string | null };

const Field = ({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    {children}
  </div>
);

const CopyOrder = ({
  group,
  businessName,
}: {
  group: ShoppingGroup;
  businessName: string | null;
}) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = orderMessage(group, businessName);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this message", text);
    }
  };
  return (
    <Button type="button" size="sm" variant="outline" onClick={copy}>
      {copied ? <Check /> : <ClipboardCopy />}
      {copied ? "Copied" : "Copy order message"}
    </Button>
  );
};

const SupplierDialog = ({
  supplier,
  onClose,
}: {
  supplier?: Supplier;
  onClose: () => void;
}) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [name, setName] = useState(supplier?.name ?? "");
  const [contact, setContact] = useState(supplier?.contact_name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [terms, setTerms] = useState(supplier?.terms ?? "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const [active, setActive] = useState(supplier?.active ?? true);

  const save = useMutation({
    mutationFn: async () => {
      const row = {
        name: name.trim(),
        contact_name: contact.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        terms: terms.trim() || null,
        notes: notes.trim() || null,
        active,
      };
      const client = getSupabaseClient();
      const { error } = supplier
        ? await client.from("suppliers").update(row).eq("id", supplier.id)
        : await client.from("suppliers").insert(row);
      if (error)
        throw new Error(
          error.code === "23505"
            ? "You already have a supplier with that name."
            : error.message,
        );
    },
    onSuccess: () => {
      notify(supplier ? "Supplier updated" : "Supplier added", {
        type: "success",
      });
      void queryClient.invalidateQueries({ queryKey: SUPPLIERS_KEY });
      onClose();
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {supplier ? "Edit supplier" : "New supplier"}
          </DialogTitle>
          <DialogDescription>
            Who you buy from. Set a supplier on a stock item and low stock turns
            into a shopping list for them.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field id="sp-name" label="Name">
              <Input
                id="sp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </div>
          <Field id="sp-contact" label="Contact (optional)">
            <Input
              id="sp-contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </Field>
          <Field id="sp-phone" label="Phone (optional)">
            <Input
              id="sp-phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field id="sp-email" label="Email (optional)">
              <Input
                id="sp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          </div>
          <Field id="sp-terms" label="Terms (for example 30 days)">
            <Input
              id="sp-terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Still buy from them
          </label>
          <div className="sm:col-span-2">
            <Field id="sp-notes" label="Notes (optional)">
              <Input
                id="sp-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={name.trim().length === 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

type Tab = "shopping" | "suppliers";

// Low stock as a shopping list for each supplier, and the suppliers themselves.
export const SuppliersPage = () => {
  const [tab, setTab] = useState<Tab>("shopping");
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const { data: levels = [] } = useStockLevels();
  const { data: extras = [] } = useItemExtras();
  const { data: suppliers = [], isPending } = useSuppliers();
  const { data: settings } = useBusinessSettings();
  const businessName = settings?.trading_name || settings?.legal_name || null;

  const groups = shoppingList(
    levels,
    extras,
    suppliers.filter((s) => s.active),
  );
  const lineCount = groups.reduce((n, g) => n + g.lines.length, 0);

  return (
    <div className="mt-2 flex flex-col gap-5 px-4 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex min-w-0 flex-1 items-center gap-2 text-2xl font-semibold tracking-tight">
          <Store className="size-6 text-muted-foreground" /> Suppliers and
          shopping
        </h1>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> Add a supplier
        </Button>
      </div>

      <div className="flex gap-2" role="tablist">
        {(
          [
            ["shopping", `Shopping list (${lineCount})`],
            ["suppliers", `Suppliers (${suppliers.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium",
              tab === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "shopping" ? (
        groups.length === 0 ? (
          <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
            Nothing to reorder. An item appears here when what you hold falls to
            its warning level. Set the level, the supplier and how much to buy
            when you edit the item on the Stock page.
          </p>
        ) : (
          groups.map((g) => (
            <section
              key={g.supplier?.id ?? "none"}
              className="flex flex-col gap-2"
              aria-label={g.supplier?.name ?? "No supplier set"}
            >
              <div className="flex flex-wrap items-center gap-3 px-1">
                <h2 className="min-w-0 flex-1 text-base font-semibold">
                  {g.supplier?.name ?? "No supplier set"}
                  {g.supplier?.phone ? (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {g.supplier.phone}
                    </span>
                  ) : null}
                </h2>
                {g.estimated_pence !== null ? (
                  <span className="text-sm text-muted-foreground tabular-nums">
                    about {formatPence(g.estimated_pence)}
                  </span>
                ) : null}
                {g.supplier ? (
                  <CopyOrder group={g} businessName={businessName} />
                ) : null}
              </div>
              <div className="divide-y overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)]">
                {g.lines.map((l) => (
                  <div
                    key={l.item_id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
                  >
                    <span className="min-w-0 flex-1 basis-40 text-[15px] font-medium">
                      {l.name}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {qty(l.on_hand)} left, warn at {qty(l.reorder_level)}
                    </span>
                    <span className="w-28 text-right text-[15px] font-semibold tabular-nums">
                      Buy {qty(l.quantity)} {l.unit}
                    </span>
                  </div>
                ))}
              </div>
              {!g.supplier ? (
                <p className="px-1 text-xs text-muted-foreground">
                  Set a supplier on these items (Stock, then edit the item) to
                  get an order message for them.
                </p>
              ) : null}
            </section>
          ))
        )
      ) : (
        <div className="divide-y overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)]">
          {isPending ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : suppliers.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No suppliers yet. Add the people you buy from.
            </p>
          ) : (
            suppliers.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setEditing(s)}
                className="press flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block text-[15px] font-medium">
                    {s.name}
                    {!s.active ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (not used now)
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {[s.contact_name, s.phone, s.email, s.terms]
                      .filter(Boolean)
                      .join(" · ") || "No details yet"}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {editing ? (
        <SupplierDialog
          supplier={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
};
