import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pause, Pencil, Play, Plus, Repeat } from "lucide-react";
import { useGetIdentity, useNotify } from "ra-core";

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

import { MONEY_KEY } from "../finance/moneyTypes";
import { BILLS_KEY } from "../finance/billTypes";
import { useExpenseCategories } from "../finance/useBills";
import { useMoneyCategories } from "../finance/useMoney";
import { parseDate, parsePence, todayIso } from "../importer/engine";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPence } from "../quotes/quoteMath";
import {
  FREQUENCY_LABEL,
  KIND_LABEL,
  perYearPence,
  repeatState,
  upcoming,
  type Frequency,
  type RecurringItem,
  type RepeatKind,
} from "./recurring";
import { InvoiceRepeatsSection } from "./InvoiceRepeats";
import { RECURRING_KEY, useRecurring } from "./useRecurring";

const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const poundsText = (pence: number) => (pence / 100).toFixed(2);

const useRefresh = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: RECURRING_KEY });
    queryClient.invalidateQueries({ queryKey: MONEY_KEY });
    queryClient.invalidateQueries({ queryKey: BILLS_KEY });
    queryClient.invalidateQueries({ queryKey: ["owed"] });
  };
};

const RepeatDialog = ({
  item,
  onClose,
}: {
  item?: RecurringItem;
  onClose: () => void;
}) => {
  const notify = useNotify();
  const refresh = useRefresh();
  const { identity } = useGetIdentity();
  const { data: moneyCategories = [] } = useMoneyCategories();
  const { data: billCategories = [] } = useExpenseCategories();
  const editing = !!item;

  const [kind, setKind] = useState<RepeatKind>(item?.kind ?? "money_out");
  const [title, setTitle] = useState(item?.title ?? "");
  const [amount, setAmount] = useState(
    item ? poundsText(item.amount_pence) : "",
  );
  const [vat, setVat] = useState(
    item && item.vat_pence ? poundsText(item.vat_pence) : "",
  );
  const [frequency, setFrequency] = useState<Frequency>(
    item?.frequency ?? "monthly",
  );
  const [first, setFirst] = useState(item?.next_date ?? todayIso());
  const [ends, setEnds] = useState(item?.end_date ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [who, setWho] = useState(item?.counterparty ?? "");
  const [method, setMethod] = useState(item?.payment_method ?? "bank_transfer");
  const [dueDays, setDueDays] = useState(String(item?.due_days ?? 14));

  const categories =
    kind === "bill"
      ? billCategories.map((c) => ({ code: c.code, label: c.label }))
      : moneyCategories
          .filter(
            (c) =>
              c.direction === (kind === "money_in" ? "in" : "out") &&
              (!c.admin_only || identity?.administrator),
          )
          .map((c) => ({ code: c.code, label: c.label }));
  const chosen =
    category && categories.some((c) => c.code === category)
      ? category
      : (categories[0]?.code ?? "");

  const pence = parsePence(amount, { max: 100_000_000_000 });
  const vatPence =
    vat.trim() === ""
      ? 0
      : parsePence(vat, { max: 100_000_000_000, allowZero: true });
  const firstDate = parseDate(first);
  const endDate = ends.trim() === "" ? null : parseDate(ends);
  const problems: string[] = [];
  if (!title.trim()) problems.push("Give it a name.");
  if (pence === null) problems.push("Enter the amount, like 850.00.");
  if (vatPence === null) problems.push("The VAT must be like 20.00.");
  else if (pence !== null && vatPence > pence)
    problems.push("The VAT cannot be more than the amount.");
  if (!editing && !firstDate) problems.push("Enter the first date.");
  if (ends.trim() !== "" && !endDate)
    problems.push("The end date is not a date.");
  if (!editing && firstDate && endDate && endDate < firstDate)
    problems.push("The end date is before the first date.");
  if (!chosen) problems.push("Choose a category.");

  const preview =
    firstDate && !editing
      ? upcoming(
          {
            next_date: firstDate,
            frequency,
            anchor_day: Number(firstDate.slice(8)),
            end_date: endDate,
          },
          3,
        )
      : [];

  const save = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      if (editing) {
        const { error } = await client
          .from("recurring_items")
          .update({
            title: title.trim(),
            amount_pence: pence,
            vat_pence: kind === "bill" ? vatPence : 0,
            counterparty: who.trim() || null,
            payment_method: kind === "bill" ? null : method,
            due_days: Number(dueDays) || 14,
            end_date: endDate,
          })
          .eq("id", item!.id);
        if (error) throw error;
        return;
      }
      const { error } = await client.from("recurring_items").insert({
        kind,
        title: title.trim(),
        frequency,
        next_date: firstDate,
        end_date: endDate,
        category: chosen,
        amount_pence: pence,
        vat_pence: kind === "bill" ? vatPence : 0,
        counterparty: who.trim() || null,
        payment_method: kind === "bill" ? null : method,
        due_days: Number(dueDays) || 14,
      });
      if (error) throw error;
      // Add the coming dates straight away, so they show without waiting for the nightly run.
      await client.rpc("generate_my_recurring");
    },
    onSuccess: () => {
      notify(editing ? "Saved." : "Saved. The coming dates have been added.");
      refresh();
      onClose();
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });

  const select = "h-9 rounded-md border bg-transparent px-2 text-sm";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Change this repeat" : "Repeat something"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes apply to dates not yet added. What repeats and how often cannot be changed: end it and start a new one."
              : "It is added to the money book as planned, or to bills as unpaid, ahead of each date."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="rp-kind">What</Label>
            <select
              id="rp-kind"
              className={select}
              disabled={editing}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as RepeatKind);
                setCategory("");
              }}
            >
              {(Object.keys(KIND_LABEL) as RepeatKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="rp-title">Name</Label>
            <Input
              id="rp-title"
              autoFocus={!editing}
              placeholder="Unit rent"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp-amount">
              {kind === "bill" ? "Amount before VAT (£)" : "Amount (£)"}
            </Label>
            <Input
              id="rp-amount"
              inputMode="decimal"
              placeholder="850.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          {kind === "bill" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rp-vat">VAT (£)</Label>
              <Input
                id="rp-vat"
                inputMode="decimal"
                placeholder="0.00"
                value={vat}
                onChange={(e) => setVat(e.target.value)}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rp-method">How paid</Label>
              <select
                id="rp-method"
                className={select}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="bank_transfer">Bank transfer</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp-freq">Repeats</Label>
            <select
              id="rp-freq"
              className={select}
              disabled={editing}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
            >
              {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABEL[f]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp-first">First date</Label>
            <Input
              id="rp-first"
              type="date"
              disabled={editing}
              value={first}
              onChange={(e) => setFirst(e.target.value)}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="rp-cat">Category</Label>
            <select
              id="rp-cat"
              className={select}
              disabled={editing}
              value={chosen}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp-who">
              {kind === "money_in"
                ? "From"
                : kind === "bill"
                  ? "Supplier"
                  : "Paid to"}
            </Label>
            <Input
              id="rp-who"
              value={who}
              onChange={(e) => setWho(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp-end">Ends (optional)</Label>
            <Input
              id="rp-end"
              type="date"
              value={ends}
              onChange={(e) => setEnds(e.target.value)}
            />
          </div>
          {kind === "bill" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rp-due">Due after (days)</Label>
              <Input
                id="rp-due"
                inputMode="numeric"
                value={dueDays}
                onChange={(e) => setDueDays(e.target.value)}
              />
            </div>
          ) : null}
        </div>
        {preview.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Next dates: {preview.map(day).join(", ")}
            {pence !== null
              ? `. About ${formatPence(perYearPence({ kind, frequency, amount_pence: pence, vat_pence: vatPence ?? 0 }))} a year.`
              : ""}
          </p>
        ) : null}
        {problems.length > 0 && (title || amount) ? (
          <p role="alert" className="text-sm text-destructive">
            {problems[0]}
          </p>
        ) : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={problems.length > 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Row = ({ item, onEdit }: { item: RecurringItem; onEdit: () => void }) => {
  const notify = useNotify();
  const refresh = useRefresh();
  const state = repeatState(item, todayIso());
  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseClient()
        .from("recurring_items")
        .update({ active: !item.active })
        .eq("id", item.id);
      if (error) throw error;
      if (!item.active) await getSupabaseClient().rpc("generate_my_recurring");
    },
    onSuccess: refresh,
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });
  return (
    <li className="flex flex-col gap-1.5 border-b p-4 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{item.title}</p>
          <p className="text-xs text-muted-foreground">
            {KIND_LABEL[item.kind]} · {FREQUENCY_LABEL[item.frequency]}
            {item.counterparty ? ` · ${item.counterparty}` : ""}
          </p>
        </div>
        <p className="shrink-0 font-semibold tabular-nums">
          {formatPence(
            item.kind === "bill"
              ? item.amount_pence + item.vat_pence
              : item.amount_pence,
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-xs",
            state === "running" && "bg-primary/10 text-primary",
            state === "problem" && "bg-destructive/10 text-destructive",
            (state === "paused" || state === "ended") &&
              "text-muted-foreground",
          )}
        >
          {state === "running"
            ? `Next ${day(item.next_date)}`
            : state === "paused"
              ? "Paused"
              : state === "ended"
                ? "Ended"
                : "Needs attention"}
        </span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil className="size-4" /> Change
          </Button>
          {state !== "ended" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate()}
            >
              {item.active ? (
                <>
                  <Pause className="size-4" /> Pause
                </>
              ) : (
                <>
                  <Play className="size-4" /> Resume
                </>
              )}
            </Button>
          ) : null}
        </div>
      </div>
      {item.last_error ? (
        <p className="text-xs text-destructive">{item.last_error}</p>
      ) : null}
    </li>
  );
};

export const RecurringPage = () => {
  const { identity } = useGetIdentity();
  const isAdmin = !!identity?.administrator;
  const { data: items = [], isPending, isError } = useRecurring(isAdmin);
  const [dialog, setDialog] = useState<"new" | RecurringItem | null>(null);

  if (!identity) return null;
  if (!isAdmin) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Only administrators can see this page.
      </p>
    );
  }
  const running = items.filter((i) => repeatState(i, todayIso()) !== "ended");
  const ended = items.filter((i) => repeatState(i, todayIso()) === "ended");
  return (
    <div className="mx-auto mt-2 flex max-w-3xl flex-col gap-4 px-4 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title flex min-w-0 basis-full items-center gap-2 text-2xl font-semibold tracking-tight sm:basis-0 sm:flex-1">
          <Repeat className="size-6 text-muted-foreground" /> Repeating
        </h1>
        <Button size="sm" onClick={() => setDialog("new")}>
          <Plus /> Repeat something
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Rent, subscriptions, insurance, retainers and loan payments that come
        round again. The next dates are added to the money book as planned, or
        to bills as unpaid, so they show in what is coming up. Mark them done or
        paid when they happen.
      </p>
      <InvoiceRepeatsSection />
      {isError ? (
        <p className="text-sm text-muted-foreground">
          This could not be loaded. Please try again.
        </p>
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          Nothing repeats yet. Start with your rent or a subscription.
        </p>
      ) : (
        <>
          <ul className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
            {running.map((i) => (
              <Row key={i.id} item={i} onEdit={() => setDialog(i)} />
            ))}
          </ul>
          {ended.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                Ended ({ended.length})
              </summary>
              <ul className="mt-2 overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
                {ended.map((i) => (
                  <Row key={i.id} item={i} onEdit={() => setDialog(i)} />
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
      {dialog ? (
        <RepeatDialog
          item={dialog === "new" ? undefined : dialog}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
};
