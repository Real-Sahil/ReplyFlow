import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetIdentity,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";
import { Banknote, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { poundsToPence, formatPence } from "../quotes/quoteMath";
import {
  KIND_LABELS,
  METHOD_LABELS,
  paymentProblem,
  summarisePayments,
  type PaymentKind,
  type PaymentMethod,
  type RecordedPayment,
} from "./orderPayments";

type Row = RecordedPayment & {
  id: number;
  method: PaymentMethod;
  received_at: string;
  note: string | null;
};

type OrderRecord = {
  id: number;
  agreed_price_pence: number | null;
  payment_terms: "cash_on_delivery" | "deposit_first";
  security_deposit_pence: number;
};

const KIND_CHOICES: PaymentKind[] = [
  "balance",
  "deposit",
  "security_deposit",
  "security_refund",
];

// Every payment on the order, newest last, with the totals worked out from them. Payments
// are added here and never edited or deleted; a mistake is put right with a refund row.
export const OrderPayments = () => {
  const order = useRecordContext<OrderRecord>();
  if (!order) return null;
  return (
    <section className="flex flex-col gap-4">
      <Separator />
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <Banknote className="size-4 text-muted-foreground" /> Payments
      </h3>
      <PaymentsBody order={order} />
    </section>
  );
};

const PaymentsBody = ({ order }: { order: OrderRecord }) => {
  const { data: rows = [], isPending } = useQuery({
    queryKey: ["order_payments", order.id],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("order_payments")
        .select("id, kind, amount_pence, method, received_at, note")
        .eq("order_id", order.id)
        .order("received_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const agreed = order.agreed_price_pence ?? 0;
  const summary = summarisePayments(agreed, rows);
  const cod = order.payment_terms === "cash_on_delivery";

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {cod
          ? "Cash on delivery: the balance is collected when the sofa is delivered."
          : "Deposit first: the balance is collected on delivery."}
        {order.security_deposit_pence > 0 &&
          ` A security deposit of ${formatPence(order.security_deposit_pence)} is requested and returned on completion.`}
      </p>

      <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <Figure label="Agreed" value={formatPence(agreed)} />
        <Figure label="Paid" value={formatPence(summary.paid_pence)} />
        <Figure
          label="Balance due"
          value={formatPence(summary.balance_pence)}
          strong
        />
        <Figure
          label="Security held"
          value={formatPence(summary.security_held_pence)}
        />
      </dl>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading payments…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No payments recorded yet.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3"
            >
              <span className="font-medium">{KIND_LABELS[row.kind]}</span>
              <span className="text-muted-foreground">
                {METHOD_LABELS[row.method]} ·{" "}
                {new Date(row.received_at).toLocaleDateString("en-GB")}
              </span>
              <span className="ml-auto tabular-nums">
                {formatPence(row.amount_pence)}
              </span>
              {row.note && (
                <span className="w-full text-xs text-muted-foreground">
                  {row.note}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <RecordPayment order={order} summary={summary} />
    </>
  );
};

const Figure = ({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) => (
  <div className="flex flex-col">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>
      {value}
    </dd>
  </div>
);

const RecordPayment = ({
  order,
  summary,
}: {
  order: OrderRecord;
  summary: { balance_pence: number; security_held_pence: number };
}) => {
  const notify = useNotify();
  const refresh = useRefresh();
  const queryClient = useQueryClient();
  const { identity } = useGetIdentity();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<PaymentKind>(
    order.payment_terms === "deposit_first" ? "deposit" : "balance",
  );
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");

  const amountPence = amount.trim() === "" ? null : poundsToPence(amount);
  const problem = paymentProblem(kind, amountPence, summary);

  const save = async () => {
    if (problem || amountPence === null) return;
    setSaving(true);
    const { error } = await getSupabaseClient()
      .from("order_payments")
      .insert({
        order_id: order.id,
        kind,
        amount_pence: amountPence,
        method,
        note: note.trim() || null,
        sales_id: Number(identity?.id) || null,
      });
    setSaving(false);
    if (error) {
      notify("The payment could not be recorded", { type: "error" });
      return;
    }
    notify(`${KIND_LABELS[kind]} recorded`);
    setAmount("");
    setNote("");
    setOpen(false);
    void queryClient.invalidateQueries({
      queryKey: ["order_payments", order.id],
    });
    refresh();
  };

  if (!open) {
    return (
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <Plus /> Record a payment
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="payment-kind">Type</Label>
          <select
            id="payment-kind"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as PaymentKind)}
          >
            {KIND_CHOICES.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="payment-amount">Amount (£)</Label>
          <Input
            id="payment-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="payment-method">Method</Label>
          <select
            id="payment-method"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          >
            {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="payment-note">Note</Label>
          <Input
            id="payment-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
      {amount.trim() !== "" && problem && (
        <p className="text-sm text-destructive">{problem}</p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={!!problem || saving}>
          {saving ? "Saving…" : "Record payment"}
        </Button>
      </div>
    </div>
  );
};
