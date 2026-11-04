import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCanAccess, useGetList, useNotify } from "ra-core";

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

import { ATTACHMENTS_BUCKET } from "../providers/commons/attachments";
import { storagePath } from "../providers/supabase/organisationFolder";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { CHANNEL_LABEL, MONEY_KEY, type MoneyEntry } from "./moneyTypes";
import { useMoneyCategories } from "./useMoney";

const toPence = (pounds: string) => Math.round(Number(pounds || 0) * 100);
const today = () => new Date().toLocaleDateString("en-CA");

// Adds or edits one entry in the money book. Any amount, any date, any time: there is no
// schedule. The note is required, because it is what tells a reader of the report what the entry
// was and why.
export const MoneyDialog = ({
  entry,
  initialDirection = "out",
  onClose,
}: {
  entry?: MoneyEntry;
  initialDirection?: "in" | "out";
  onClose: () => void;
}) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { canAccess: isAdmin } = useCanAccess({
    resource: "configuration",
    action: "edit",
  });
  const { data: categories = [] } = useMoneyCategories();
  const { data: orders = [] } = useGetList("orders", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "id", order: "DESC" },
  });

  const [direction, setDirection] = useState<"in" | "out">(
    entry?.direction ?? initialDirection,
  );
  const [category, setCategory] = useState(
    entry?.category ?? (initialDirection === "in" ? "sales_other" : "stock"),
  );
  const [planned, setPlanned] = useState(entry?.status === "planned");
  const [date, setDate] = useState(entry?.entry_date ?? today());
  const [periodFrom, setPeriodFrom] = useState(entry?.period_from ?? "");
  const [periodTo, setPeriodTo] = useState(entry?.period_to ?? "");
  const [amount, setAmount] = useState(
    entry ? (entry.amount_pence / 100).toFixed(2) : "",
  );
  const [who, setWho] = useState(entry?.counterparty ?? "");
  const [method, setMethod] = useState<string>(
    entry?.payment_method ?? "bank_transfer",
  );
  const [reference, setReference] = useState(entry?.reference ?? "");
  const [channel, setChannel] = useState<string>(entry?.channel ?? "");
  const [order, setOrder] = useState(String(entry?.order_id ?? ""));
  const [regulated, setRegulated] = useState(entry?.regulated ?? false);
  const [note, setNote] = useState(entry?.note ?? "");
  const [file, setFile] = useState<File | null>(null);

  const choices = categories.filter(
    (c) => c.direction === direction && (isAdmin || !c.admin_only),
  );
  const chosen = categories.find((c) => c.code === category);

  const pickDirection = (next: "in" | "out") => {
    setDirection(next);
    const first = categories.find(
      (c) => c.direction === next && (isAdmin || !c.admin_only),
    );
    setCategory(first?.code ?? "");
    setRegulated(first?.regulated ?? false);
    if (next === "out") setChannel("");
  };

  const pickCategory = (code: string) => {
    setCategory(code);
    setRegulated(categories.find((c) => c.code === code)?.regulated ?? false);
  };

  const pence = toPence(amount);
  const issues: string[] = [];
  if (!(pence > 0)) issues.push("Enter the amount.");
  if (note.trim().length < 3)
    issues.push(
      "Add a note saying what this was and why. It appears in the report.",
    );
  if (periodFrom && periodTo && periodTo < periodFrom)
    issues.push("The period ends before it starts.");
  if (!category) issues.push("Choose a category.");

  const save = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      let receipt_path = entry?.receipt_path ?? null;
      if (file) {
        const ext = file.name.includes(".")
          ? `.${file.name.split(".").pop()}`
          : "";
        const path = await storagePath(`${crypto.randomUUID()}${ext}`);
        const { error: uploadError } = await client.storage
          .from(ATTACHMENTS_BUCKET)
          .upload(path, file);
        if (uploadError) throw new Error("The receipt could not be uploaded.");
        receipt_path = path;
      }
      const row = {
        direction,
        category,
        status: planned ? "planned" : "done",
        entry_date: date,
        period_from: periodFrom || null,
        period_to: periodTo || null,
        amount_pence: pence,
        counterparty: who.trim() || null,
        payment_method: planned ? null : method,
        reference: reference.trim() || null,
        channel: direction === "in" && channel ? channel : null,
        order_id: order ? Number(order) : null,
        regulated,
        receipt_path,
        note: note.trim(),
      };
      const { error } = entry
        ? await client.from("money_entries").update(row).eq("id", entry.id)
        : await client.from("money_entries").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      notify(entry ? "Entry updated" : "Entry added", { type: "success" });
      queryClient.invalidateQueries({ queryKey: MONEY_KEY });
      onClose();
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });

  const whoLabel =
    category === "wages" || category === "contractors"
      ? "Person paid"
      : direction === "in"
        ? "Who paid you"
        : "Who you paid";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-5 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {entry ? "Edit entry" : "Add to the money book"}
          </DialogTitle>
          <DialogDescription>
            Record money in or out whenever it happens, or plan it for later.
            Changes are kept in the history.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div
            className="flex gap-2 sm:col-span-2"
            role="group"
            aria-label="Direction"
          >
            {(["in", "out"] as const).map((d) => (
              <Button
                key={d}
                type="button"
                variant={direction === d ? "default" : "outline"}
                aria-pressed={direction === d}
                onClick={() => pickDirection(d)}
              >
                {d === "in" ? "Money in" : "Money out"}
              </Button>
            ))}
          </div>

          <Field id="m-cat" label="Category">
            <select
              id="m-cat"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={category}
              onChange={(e) => pickCategory(e.target.value)}
            >
              {[...new Set(choices.map((c) => c.grp))].map((g) => (
                <optgroup key={g} label={g}>
                  {choices
                    .filter((c) => c.grp === g)
                    .map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field id="m-amount" label="Amount (£)">
            <Input
              id="m-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={planned}
              onChange={(e) => setPlanned(e.target.checked)}
            />
            Planned: this has not happened yet
          </label>

          <Field id="m-date" label={planned ? "Expected on" : "Date"}>
            <Input
              id="m-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          {!planned && (
            <Field id="m-method" label="How">
              <select
                id="m-method"
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="bank_transfer">Bank transfer</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </Field>
          )}

          <Field id="m-who" label={`${whoLabel} (optional)`}>
            <Input
              id="m-who"
              value={who}
              onChange={(e) => setWho(e.target.value)}
            />
          </Field>
          <Field id="m-ref" label="Reference (optional)">
            <Input
              id="m-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>

          {(category === "wages" ||
            category === "contractors" ||
            category === "pension") && (
            <>
              <Field id="m-pf" label="Covers from (optional)">
                <Input
                  id="m-pf"
                  type="date"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                />
              </Field>
              <Field id="m-pt" label="Covers to (optional)">
                <Input
                  id="m-pt"
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                />
              </Field>
            </>
          )}

          {direction === "in" && (
            <Field id="m-channel" label="Where the sale came from (optional)">
              <select
                id="m-channel"
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="">Not stated</option>
                {Object.entries(CHANNEL_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field id="m-order" label="Linked order (optional)">
            <select
              id="m-order"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            >
              <option value="">Not linked to an order</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.reference}
                  {o.product_summary ? ` · ${o.product_summary}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={regulated}
              onChange={(e) => setRegulated(e.target.checked)}
            />
            Regulated payment (tax, National Insurance, pension, licence)
            {chosen?.regulated ? (
              <span className="text-muted-foreground">
                · suggested for this category
              </span>
            ) : null}
          </label>

          <div className="sm:col-span-2">
            <Field id="m-note" label="Note (required)">
              <Input
                id="m-note"
                placeholder="What it was and why, for the report"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field
              id="m-file"
              label={
                entry?.receipt_path
                  ? "Replace the receipt (optional)"
                  : "Receipt or document (optional)"
              }
            >
              <Input
                id="m-file"
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
          </div>
        </div>

        {issues.length > 0 && (pence > 0 || note.length > 0) && (
          <ul role="alert" className="list-disc pl-5 text-sm text-destructive">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={issues.length > 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Field = ({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1">
    <Label htmlFor={id}>{label}</Label>
    {children}
  </div>
);
