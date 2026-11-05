import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ClipboardCopy,
  Download,
  FileText,
  Check,
} from "lucide-react";
import { useNotify } from "ra-core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { todayIso } from "../importer/engine";
import { formatPence } from "../quotes/quoteMath";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { useBusinessSettings } from "../finance/useBusinessSettings";
import {
  BUCKET_LABEL,
  ageing,
  buildStatement,
  statementMessage,
  type AgeBucket,
  type Statement,
  type StatementLine,
} from "./statement";
import { downloadStatementPdf } from "./statementPdf";
import { useStatementData } from "./useStatements";

const day = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const label = (l: StatementLine) =>
  l.kind === "payment"
    ? "Payment received"
    : l.kind === "credit_note"
      ? `Credit note ${l.reference ?? ""}`
      : `Invoice ${l.reference ?? ""}`;

const StatementView = ({
  name,
  statement,
  onBack,
}: {
  name: string;
  statement: Statement;
  onBack: () => void;
}) => {
  const notify = useNotify();
  const { title } = useConfigurationContext();
  const { data: settings } = useBusinessSettings();
  const business = settings?.trading_name || settings?.legal_name || title;
  const today = todayIso();
  const [copied, setCopied] = useState(false);
  const [making, setMaking] = useState(false);
  const a = ageing(statement.openInvoices);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        statementMessage({ customer: name, business, statement, today }),
      );
      setCopied(true);
    } catch {
      notify("It could not be copied. Select the text and copy it by hand.", {
        type: "warning",
      });
    }
  };
  const pdf = async () => {
    setMaking(true);
    try {
      await downloadStatementPdf({
        business,
        customer: name,
        today,
        statement,
      });
    } catch {
      notify("The PDF could not be made.", { type: "error" });
    } finally {
      setMaking(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" /> All customers
        </Button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? (
              <Check className="size-4" />
            ) : (
              <ClipboardCopy className="size-4" />
            )}
            {copied ? "Copied" : "Copy as a message"}
          </Button>
          <Button size="sm" variant="outline" disabled={making} onClick={pdf}>
            <Download className="size-4" />
            {making ? "Making…" : "PDF"}
          </Button>
        </div>
      </div>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{name}</h2>
        <p className="text-sm text-muted-foreground">
          Statement as at {day(today)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl bg-card p-3 shadow-[var(--shadow-card)]">
          <p className="text-xs text-muted-foreground">Owes you</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {formatPence(statement.balancePence)}
          </p>
        </div>
        <div className="rounded-xl bg-card p-3 shadow-[var(--shadow-card)]">
          <p className="text-xs text-muted-foreground">Of which late</p>
          <p
            className={cn(
              "mt-1 text-xl font-semibold tabular-nums",
              statement.latePence > 0 && "text-destructive",
            )}
          >
            {formatPence(statement.latePence)}
          </p>
        </div>
        <div className="rounded-xl bg-card p-3 shadow-[var(--shadow-card)]">
          <p className="text-xs text-muted-foreground">Invoiced in all</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {formatPence(statement.invoicedPence)}
          </p>
        </div>
        <div className="rounded-xl bg-card p-3 shadow-[var(--shadow-card)]">
          <p className="text-xs text-muted-foreground">Paid or credited</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {formatPence(statement.paidAndCreditedPence)}
          </p>
        </div>
      </div>
      {statement.openInvoices.length > 0 ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {(Object.keys(a) as AgeBucket[])
            .filter((k) => a[k] > 0)
            .map((k) => (
              <span
                key={k}
                className={cn(
                  "rounded-md px-2 py-1",
                  k === "notDue"
                    ? "bg-muted text-muted-foreground"
                    : "bg-warning-soft text-warning",
                )}
              >
                {BUCKET_LABEL[k]}: {formatPence(a[k])}
              </span>
            ))}
        </div>
      ) : null}
      <ul className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
        {statement.rows.map((r) => (
          <li
            key={`${r.kind}-${r.source_id}`}
            className="flex items-start justify-between gap-3 border-b px-4 py-3 text-sm last:border-b-0"
          >
            <div className="min-w-0">
              <p>{label(r)}</p>
              <p className="text-xs text-muted-foreground">
                {day(r.line_date)}
                {r.order_reference ? ` · ${r.order_reference}` : ""}
                {r.due_date && r.kind === "invoice"
                  ? ` · due ${day(r.due_date)}`
                  : ""}
              </p>
            </div>
            <div className="shrink-0 text-right tabular-nums">
              <p className={cn(r.credit_pence > 0 && "text-primary")}>
                {r.debit_pence
                  ? formatPence(r.debit_pence)
                  : `-${formatPence(r.credit_pence)}`}
              </p>
              <p className="text-xs text-muted-foreground">
                Balance {formatPence(r.balance_pence)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const StatementsPage = () => {
  const { data, isPending, isError } = useStatementData();
  const [search, setSearch] = useState("");
  const [showSettled, setShowSettled] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const today = todayIso();

  const customers = useMemo(() => {
    if (!data) return [];
    const byContact = new Map<number, StatementLine[]>();
    for (const l of data.lines) {
      if (l.contact_id == null) continue;
      byContact.set(l.contact_id, [...(byContact.get(l.contact_id) ?? []), l]);
    }
    return [...byContact.entries()]
      .map(([id, lines]) => ({
        id,
        name: data.names[id] ?? `Customer ${id}`,
        statement: buildStatement(lines, today),
      }))
      .sort(
        (a, b) =>
          b.statement.latePence - a.statement.latePence ||
          b.statement.balancePence - a.statement.balancePence ||
          a.name.localeCompare(b.name),
      );
  }, [data, today]);

  const shown = customers.filter(
    (c) =>
      (showSettled || c.statement.balancePence !== 0) &&
      c.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const current = customers.find((c) => c.id === selected);

  return (
    <div className="mx-auto mt-2 flex max-w-3xl flex-col gap-4 px-4 md:px-0">
      {current ? (
        <StatementView
          name={current.name}
          statement={current.statement}
          onBack={() => setSelected(null)}
        />
      ) : (
        <>
          <h1 className="page-title flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FileText className="size-6 text-muted-foreground" /> Customer
            statements
          </h1>
          <p className="text-sm text-muted-foreground">
            Everything a customer has been invoiced, credited and has paid, with
            what is still owed and how late it is. Read from the invoices and
            payments already recorded. Pick a customer to copy a message or make
            a PDF to send.
          </p>
          {isError ? (
            <p className="text-sm text-muted-foreground">
              This could not be loaded. Please try again.
            </p>
          ) : isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : customers.length === 0 ? (
            <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground shadow-[var(--shadow-card)]">
              No invoices yet, so there is nothing to put on a statement.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  aria-label="Search customers"
                  placeholder="Search customers"
                  className="max-w-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showSettled}
                    onChange={(e) => setShowSettled(e.target.checked)}
                  />{" "}
                  Include customers who owe nothing
                </label>
              </div>
              {shown.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No customers to show.
                </p>
              ) : (
                <ul className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
                  {shown.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(c.id)}
                        className="flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/40"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {c.name}
                          </span>
                          {c.statement.latePence > 0 ? (
                            <span className="text-xs text-destructive">
                              {formatPence(c.statement.latePence)} late
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {c.statement.openInvoices.length} open
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {formatPence(c.statement.balancePence)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};
