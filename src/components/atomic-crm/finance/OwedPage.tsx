import { useState } from "react";
import { Link } from "react-router";
import { Check, ClipboardCopy, HandCoins, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatPence } from "../quotes/quoteMath";
import {
  byUrgency,
  daysLate,
  dueLabel,
  overdue,
  reminderText,
  total,
  type OwedByCustomer,
} from "./owed";
import { useBusinessSettings } from "./useBusinessSettings";
import { useOwedByCustomers, useOwedToSuppliers } from "./useOwed";

const LateChip = ({ due, today }: { due: string | null; today: Date }) => {
  const late = daysLate(due, today) > 0;
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 text-xs",
        late ? "bg-warning-soft text-warning" : "text-muted-foreground",
      )}
    >
      {dueLabel(due, today)}
    </span>
  );
};

const CopyReminder = ({
  row,
  businessName,
  today,
}: {
  row: OwedByCustomer;
  businessName: string | null;
  today: Date;
}) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = reminderText({
      customerName: row.customer_name,
      invoiceNumber: row.latest_invoice_number,
      owedPence: row.owed_pence,
      dueDate: row.due_date,
      businessName,
      today,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this reminder", text);
    }
  };
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {copied ? <Check /> : <ClipboardCopy />}
      {copied ? "Copied" : "Copy reminder"}
    </Button>
  );
};

// Everything customers owe the business, and everything the business owes suppliers, most urgent
// first. A payment is recorded on the order, so this page never asks for one twice.
export const OwedPage = () => {
  const today = new Date();
  const {
    data: customers = [],
    isPending: loadingC,
    error: errC,
  } = useOwedByCustomers();
  const {
    data: suppliers = [],
    isPending: loadingS,
    error: errS,
  } = useOwedToSuppliers();
  const { data: settings } = useBusinessSettings();
  const businessName = settings?.trading_name || settings?.legal_name || null;

  const owedToYou = byUrgency(customers);
  const youOwe = byUrgency(suppliers);

  return (
    <div className="mt-2 flex flex-col gap-6 px-4 md:px-0">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <HandCoins className="size-6 text-muted-foreground" /> Owed and owing
      </h1>

      <section className="flex flex-col gap-2" aria-label="Owed to you">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Owed to you
          </h2>
          <p className="text-sm">
            <span className="text-lg font-semibold tabular-nums">
              {formatPence(total(customers))}
            </span>
            {overdue(customers, today).length > 0 ? (
              <span className="ml-2 text-warning">
                {overdue(customers, today).length} late (
                {formatPence(total(overdue(customers, today)))})
              </span>
            ) : null}
          </p>
        </div>
        <div className="divide-y overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)]">
          {errC ? (
            <p className="p-4 text-sm text-destructive">
              This could not be loaded.
            </p>
          ) : loadingC ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : owedToYou.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Nobody owes you anything on an invoice.
            </p>
          ) : (
            owedToYou.map((r) => (
              <div
                key={r.order_id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
              >
                <Link
                  to={`/orders/${r.order_id}`}
                  className="min-w-0 flex-1 basis-48"
                >
                  <div className="truncate text-[15px] font-medium">
                    {r.customer_name ?? "Customer"}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {r.latest_invoice_number ?? "Invoice"}
                    {r.order_reference ? `, order ${r.order_reference}` : ""}
                    {r.paid_pence > 0
                      ? `, ${formatPence(r.paid_pence)} paid of ${formatPence(r.invoiced_pence)}`
                      : ""}
                  </div>
                </Link>
                <LateChip due={r.due_date} today={today} />
                <span className="w-24 text-right text-[15px] font-semibold tabular-nums">
                  {formatPence(r.owed_pence)}
                </span>
                <CopyReminder
                  row={r}
                  businessName={businessName}
                  today={today}
                />
              </div>
            ))
          )}
        </div>
        <p className="px-1 text-xs text-muted-foreground">
          To record a payment, open the order. It then drops off this list.
        </p>
      </section>

      <section className="flex flex-col gap-2" aria-label="You owe">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold text-muted-foreground">
            You owe suppliers
          </h2>
          <p className="text-sm">
            <span className="text-lg font-semibold tabular-nums">
              {formatPence(total(suppliers))}
            </span>
            {overdue(suppliers, today).length > 0 ? (
              <span className="ml-2 text-warning">
                {overdue(suppliers, today).length} late
              </span>
            ) : null}
          </p>
        </div>
        <div className="divide-y overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)]">
          {errS ? (
            <p className="p-4 text-sm text-destructive">
              This could not be loaded.
            </p>
          ) : loadingS ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : youOwe.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No unpaid supplier bills.
            </p>
          ) : (
            youOwe.map((b) => (
              <Link
                key={b.id}
                to="/bills"
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1 basis-48">
                  <div className="truncate text-[15px] font-medium">
                    {b.supplier_name}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {b.description ?? b.reference ?? "Bill"}
                  </div>
                </div>
                <LateChip due={b.due_date} today={today} />
                <span className="w-24 text-right text-[15px] font-semibold tabular-nums">
                  {formatPence(b.owed_pence)}
                </span>
              </Link>
            ))
          )}
        </div>
        <p className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
          <Wallet className="size-3.5" /> Mark a bill as paid on the Bills page.
        </p>
      </section>
    </div>
  );
};
