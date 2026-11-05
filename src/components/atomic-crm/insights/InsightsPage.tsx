import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChartColumn } from "lucide-react";
import { useGetIdentity } from "ra-core";

import { cn } from "@/lib/utils";

import { fetchAllRows } from "../exports/exportPaging";
import type { BillRow, EntryRow, SalesRow } from "../finance/accountantPack";
import { profitAndLoss } from "../finance/reports";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPence } from "../quotes/quoteMath";
import {
  BUCKET_LABEL,
  ageing,
  buildStatement,
  type AgeBucket,
  type StatementLine,
} from "../statements/statement";
import { useStatementData } from "../statements/useStatements";
import { todayIso } from "../importer/engine";
import {
  costMix,
  fillMonths,
  observations,
  rangeFor,
  topCustomers,
  type RangeChoice,
} from "./insights";

const Charts = {
  MonthlyBars: lazy(() =>
    import("./InsightCharts").then((m) => ({ default: m.MonthlyBars })),
  ),
  CostDonut: lazy(() =>
    import("./InsightCharts").then((m) => ({ default: m.CostDonut })),
  ),
  HorizontalBars: lazy(() =>
    import("./InsightCharts").then((m) => ({ default: m.HorizontalBars })),
  ),
};

const fetchRows = <T,>(table: string, dateColumn: string, from: string) =>
  fetchAllRows<T>(async (start, end) => {
    const response = await getSupabaseClient()
      .from(table)
      .select("*")
      .gte(dateColumn, from)
      .order(dateColumn, { ascending: true })
      .range(start, end);
    return {
      data: (response.data ?? null) as unknown as T[] | null,
      error: response.error,
    };
  });

const Card = ({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) => (
  <section className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
    <h2 className="font-medium">{title}</h2>
    {note ? (
      <p className="mb-3 text-xs text-muted-foreground">{note}</p>
    ) : (
      <div className="mb-3" />
    )}
    <Suspense fallback={<div className="h-52" />}>{children}</Suspense>
  </section>
);

const Tile = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bad";
}) => (
  <div className="rounded-xl bg-card p-3 shadow-[var(--shadow-card)]">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p
      className={cn(
        "mt-1 text-xl font-semibold tabular-nums",
        tone === "bad" && "text-destructive",
      )}
    >
      {value}
    </p>
  </div>
);

const AGE_COLORS = [
  "oklch(0.7 0.02 60)",
  "oklch(0.78 0.12 85)",
  "oklch(0.68 0.15 50)",
  "oklch(0.55 0.2 27)",
];

// How the business is doing at a glance: income and costs by month, where the costs go, who pays most and
// how late the money owed is. Every figure comes from records entered in the app; the sentences say what
// the figures show and nothing more.
export const InsightsPage = () => {
  const { identity } = useGetIdentity();
  const isAdmin = !!identity?.administrator;
  const [choice, setChoice] = useState<RangeChoice>("12");
  const range = useMemo(() => rangeFor(choice, new Date()), [choice]);

  const { data, isPending, isError } = useQuery({
    queryKey: ["insights", range.fromDate],
    enabled: isAdmin,
    retry: false,
    queryFn: async () => {
      const [sales, bills, entries] = await Promise.all([
        fetchRows<SalesRow & { order_id: number }>(
          "invoice_ledger",
          "tax_point",
          range.fromDate,
        ),
        fetchRows<BillRow>("bill_ledger", "bill_date", range.fromDate),
        fetchRows<EntryRow>("money_ledger", "entry_date", range.fromDate),
      ]);
      return { sales, bills, entries };
    },
  });
  const statements = useStatementData();

  const view = useMemo(() => {
    if (!data) return null;
    const pnl = profitAndLoss(data.sales, data.bills, data.entries);
    const months = fillMonths(pnl.months, range.fromMonth, range.toMonth);
    const customers = topCustomers(data.sales);
    const mix = costMix(pnl.costs);
    // What is owed now, across every customer, set against the oldest invoices first.
    const today = todayIso();
    const byContact = new Map<number, StatementLine[]>();
    for (const l of statements.data?.lines ?? []) {
      if (l.contact_id == null) continue;
      byContact.set(l.contact_id, [...(byContact.get(l.contact_id) ?? []), l]);
    }
    const buckets: Record<AgeBucket, number> = {
      notDue: 0,
      d1to30: 0,
      d31to60: 0,
      d61plus: 0,
    };
    let owed = 0;
    let late = 0;
    for (const lines of byContact.values()) {
      const s = buildStatement(lines, today);
      const a = ageing(s.openInvoices);
      (Object.keys(a) as AgeBucket[]).forEach((k) => (buckets[k] += a[k]));
      owed += s.openInvoices.reduce((sum, i) => sum + i.open_pence, 0);
      late += s.latePence;
    }
    return {
      pnl,
      months,
      customers,
      mix,
      buckets,
      owed,
      late,
      notes: observations({
        months,
        costs: pnl.costs,
        customers,
        incomeTotal: pnl.incomeTotal,
        latePence: late,
        owedPence: owed,
      }),
    };
  }, [data, range, statements.data]);

  if (!identity) return null;
  if (!isAdmin)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Only administrators can see this page.
      </p>
    );
  const select = "h-9 rounded-md border bg-transparent px-2 text-sm";
  const hasData =
    !!view && (view.pnl.incomeTotal !== 0 || view.pnl.costsTotal !== 0);

  return (
    <div className="mx-auto mt-2 flex max-w-4xl flex-col gap-4 px-4 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title flex min-w-0 basis-full items-center gap-2 text-2xl font-semibold tracking-tight sm:basis-0 sm:flex-1">
          <ChartColumn className="size-6 text-muted-foreground" /> Insights
        </h1>
        <select
          aria-label="Period"
          className={select}
          value={choice}
          onChange={(e) => setChoice(e.target.value as RangeChoice)}
        >
          <option value="12">Last 12 months</option>
          <option value="6">Last 6 months</option>
          <option value="year">This year</option>
        </select>
      </div>

      {isError ? (
        <p className="text-sm text-muted-foreground">
          This could not be loaded. Please try again.
        </p>
      ) : isPending || !view ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !hasData ? (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          Nothing to chart yet. Insights appear once there are invoices, bills
          or money-book entries in this period.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Income" value={formatPence(view.pnl.incomeTotal)} />
            <Tile label="Costs" value={formatPence(view.pnl.costsTotal)} />
            <Tile
              label={
                view.pnl.marginPercent !== null
                  ? `Profit (${view.pnl.marginPercent}% of income)`
                  : "Profit"
              }
              value={formatPence(view.pnl.profit)}
              tone={view.pnl.profit < 0 ? "bad" : undefined}
            />
            <Tile
              label="Customers owe you"
              value={formatPence(view.owed)}
              tone={view.late > 0 ? "bad" : undefined}
            />
          </div>

          {view.notes.length > 0 ? (
            <section
              aria-label="What stands out"
              className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]"
            >
              <h2 className="mb-2 font-medium">What stands out</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {view.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <Card
            title="Income and costs, month by month"
            note="Income when invoiced, costs when billed, money-book entries when they happen. VAT and tax are left out."
          >
            <Charts.MonthlyBars months={view.months} />
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                Show the figures
              </summary>
              <table className="mt-2 w-full text-left">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 font-medium">Month</th>
                    <th className="py-1 text-right font-medium">Income</th>
                    <th className="py-1 text-right font-medium">Costs</th>
                    <th className="py-1 text-right font-medium">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {view.months.map((m) => (
                    <tr key={m.month} className="border-t">
                      <td className="py-1">
                        {new Date(`${m.month}-01T12:00:00`).toLocaleDateString(
                          "en-GB",
                          { month: "short", year: "numeric" },
                        )}
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {formatPence(m.income)}
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {formatPence(m.costs)}
                      </td>
                      <td
                        className={cn(
                          "py-1 text-right tabular-nums",
                          m.profit < 0 && "text-destructive",
                        )}
                      >
                        {formatPence(m.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Where the costs go">
              {view.mix.length > 0 ? (
                <Charts.CostDonut lines={view.mix} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No costs in this period.
                </p>
              )}
            </Card>
            <Card
              title="Who pays you most"
              note="Invoiced sales in this period, after credit notes."
            >
              {view.customers.length > 0 ? (
                <Charts.HorizontalBars
                  rows={view.customers}
                  label="Sales by customer"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No invoiced sales in this period.
                </p>
              )}
            </Card>
          </div>

          <Card
            title="How late the money owed to you is"
            note="Everything customers owe now, set against their oldest invoices first."
          >
            {view.owed > 0 ? (
              <Charts.HorizontalBars
                rows={(Object.keys(view.buckets) as AgeBucket[]).map((k) => ({
                  name: BUCKET_LABEL[k],
                  pence: view.buckets[k],
                }))}
                label="Money owed by how late it is"
                colors={AGE_COLORS}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Nobody owes you anything.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
