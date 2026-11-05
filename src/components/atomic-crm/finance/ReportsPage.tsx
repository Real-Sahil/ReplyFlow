import { useMemo, useState } from "react";
import { currencySymbol } from "../markets/moneyFormat";
import { useQuery } from "@tanstack/react-query";
import { ChartColumn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";

import { downloadCsv, toCsv } from "../exports/csv";
import { fetchAllRows } from "../exports/exportPaging";
import { periodBounds, type PeriodPreset } from "../exports/periods";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPence } from "../quotes/quoteMath";
import type { BillRow, EntryRow, SalesRow } from "./accountantPack";
import { CHANNEL_LABEL } from "./moneyTypes";
import {
  cashForecast,
  profitAndLoss,
  salesByChannel,
  type Expected,
} from "./reports";

type Tab = "pnl" | "channels" | "forecast";

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last three months" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom dates" },
  { value: "all", label: "All dates" },
];

const fetchRows = <T,>(
  table: string,
  dateColumn: string,
  range: { from: string | null; to: string | null } | null,
  select = "*",
) =>
  fetchAllRows<T>(async (start, end) => {
    let query = getSupabaseClient().from(table).select(select);
    if (range?.from) query = query.gte(dateColumn, range.from);
    if (range?.to) query = query.lte(dateColumn, range.to);
    const response = await query
      .order(dateColumn, { ascending: true })
      .range(start, end);
    return {
      data: (response.data ?? null) as unknown as T[] | null,
      error: response.error,
    };
  });

const channelName = (c: string) =>
  c === "not_stated"
    ? "Not stated"
    : (CHANNEL_LABEL[c as keyof typeof CHANNEL_LABEL] ?? c);

const monthName = (m: string) =>
  new Date(`${m}-01T12:00:00`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

const day = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

// How the business is doing: profit and loss, which sales channels earn, and what is expected in
// and out over the next weeks. Every figure comes from records entered in the app.
export const ReportsPage = () => {
  const [tab, setTab] = useState<Tab>("pnl");
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 md:px-0">
      <h1 className="page-title flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <ChartColumn className="size-6 text-muted-foreground" /> Reports
      </h1>
      <Segmented
        label="Report"
        value={tab}
        onChange={setTab}
        className="w-full max-w-md"
        options={[
          ["pnl", "Profit and loss"],
          ["channels", "Sales channels"],
          ["forecast", "Cash forecast"],
        ]}
      />
      {tab === "forecast" ? <Forecast /> : <PeriodReport tab={tab} />}
    </div>
  );
};

const PeriodReport = ({ tab }: { tab: "pnl" | "channels" }) => {
  const [preset, setPreset] = useState<PeriodPreset>("this_year");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range = periodBounds(preset, { from, to });

  const { data, isPending, error } = useQuery({
    queryKey: ["report_period", range],
    queryFn: async () => {
      const [sales, bills, entries, orders] = await Promise.all([
        fetchRows<SalesRow & { order_id: number }>(
          "invoice_ledger",
          "tax_point",
          range,
        ),
        fetchRows<BillRow>("bill_ledger", "bill_date", range),
        fetchRows<EntryRow & { channel: string | null }>(
          "money_ledger",
          "entry_date",
          range,
        ),
        fetchRows<{ id: number; sales_channel: string | null }>(
          "orders",
          "id",
          null,
          "id, sales_channel",
        ),
      ]);
      return { sales, bills, entries, orders };
    },
  });

  const label = range.from
    ? `${range.from} to ${range.to ?? range.from}`
    : "All dates";
  const pnl = useMemo(
    () => (data ? profitAndLoss(data.sales, data.bills, data.entries) : null),
    [data],
  );
  const channels = useMemo(() => {
    if (!data) return null;
    const map = new Map(
      data.orders.map((o) => [String(o.id), o.sales_channel]),
    );
    return salesByChannel(
      data.sales,
      data.entries,
      map,
      (s) => String(s.order_id),
      (e) => e.channel,
    );
  }, [data]);

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="rp-period">Period</Label>
          <select
            id="rp-period"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            value={preset}
            onChange={(e) => setPreset(e.target.value as PeriodPreset)}
          >
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {preset === "custom" && (
          <>
            <div className="flex flex-col gap-1">
              <Label htmlFor="rp-from">From</Label>
              <Input
                id="rp-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="rp-to">To</Label>
              <Input
                id="rp-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-destructive">Could not load the report.</p>
      )}

      {pnl && tab === "pnl" && (
        <>
          <section className="flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
            <h2 className="text-base font-semibold">
              Profit and loss, {label}
            </h2>
            <Block title="Income" lines={pnl.income} total={pnl.incomeTotal} />
            <Block title="Costs" lines={pnl.costs} total={pnl.costsTotal} />
            <div className="flex items-baseline justify-between border-t pt-3 text-base font-semibold">
              <span>
                Profit
                {pnl.marginPercent !== null ? (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {pnl.marginPercent}% of income
                  </span>
                ) : null}
              </span>
              <span className="tabular-nums">{formatPence(pnl.profit)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Income is counted when invoiced, costs when billed, and money-book
              entries when they happen. Stock is counted when it is bought. VAT
              is never income or a cost.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() =>
                downloadCsv(
                  `profit-and-loss-${label.replaceAll(" ", "_")}.csv`,
                  toCsv(
                    [
                      ...pnl.income.map((l) => ({
                        section: "Income",
                        label: l.label,
                        amount: (l.pence / 100).toFixed(2),
                      })),
                      {
                        section: "Income",
                        label: "Total income",
                        amount: (pnl.incomeTotal / 100).toFixed(2),
                      },
                      ...pnl.costs.map((l) => ({
                        section: "Costs",
                        label: l.label,
                        amount: (l.pence / 100).toFixed(2),
                      })),
                      {
                        section: "Costs",
                        label: "Total costs",
                        amount: (pnl.costsTotal / 100).toFixed(2),
                      },
                      {
                        section: "Result",
                        label: "Profit",
                        amount: (pnl.profit / 100).toFixed(2),
                      },
                      ...pnl.excluded.map((l) => ({
                        section: "Not part of profit",
                        label: l.label,
                        amount: (l.pence / 100).toFixed(2),
                      })),
                    ],
                    [
                      { key: "section", label: "Section" },
                      { key: "label", label: "Line" },
                      { key: "amount", label: `Amount (${currencySymbol()})` },
                    ],
                  ),
                )
              }
            >
              Download CSV
            </Button>
          </section>

          {pnl.excluded.length > 0 && (
            <section className="flex flex-col gap-2 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-base font-semibold">
                Money moved that is not profit
              </h2>
              <p className="text-sm text-muted-foreground">
                Tax and VAT payments, loans, money the owner put in or took out,
                and transfers. They change the bank balance but not the profit.
              </p>
              {pnl.excluded.map((l) => (
                <Row key={l.label} label={l.label} pence={l.pence} signed />
              ))}
            </section>
          )}

          {pnl.months.length > 1 && (
            <section className="flex flex-col gap-2 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-base font-semibold">Month by month</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 font-medium">Month</th>
                      <th className="py-1 text-right font-medium">Income</th>
                      <th className="py-1 text-right font-medium">Costs</th>
                      <th className="py-1 text-right font-medium">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pnl.months.map((m) => (
                      <tr key={m.month}>
                        <td className="py-1.5">{monthName(m.month)}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatPence(m.income)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatPence(m.costs)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatPence(m.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {channels && tab === "channels" && (
        <section className="flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-base font-semibold">Sales by channel, {label}</h2>
          {channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sales in this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 font-medium">Channel</th>
                    <th className="py-1 text-right font-medium">
                      Orders invoiced
                    </th>
                    <th className="py-1 text-right font-medium">Invoiced</th>
                    <th className="py-1 text-right font-medium">
                      Outside invoices
                    </th>
                    <th className="py-1 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {channels.map((c) => (
                    <tr key={c.channel}>
                      <td className="py-1.5">{channelName(c.channel)}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {c.orders}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatPence(c.invoiced)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatPence(c.outsideInvoices)}
                      </td>
                      <td className="py-1.5 text-right font-medium tabular-nums">
                        {formatPence(c.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Before VAT. An invoice takes the channel of its order, which you set
            on the order. Sales typed into the money book carry the channel
            chosen there.
          </p>
        </section>
      )}
    </>
  );
};

const Forecast = () => {
  const [weeks, setWeeks] = useState(5);
  const [opening, setOpening] = useState("");
  const today = new Date().toLocaleDateString("en-CA");

  const { data, isPending, error } = useQuery({
    queryKey: ["report_forecast"],
    queryFn: async () => {
      const client = getSupabaseClient();
      const [planned, bills, orders] = await Promise.all([
        fetchRows<EntryRow>("money_ledger", "entry_date", null).then((r) =>
          r.filter((e) => e.state === "planned"),
        ),
        fetchRows<BillRow>("bill_ledger", "bill_date", null).then((r) =>
          r.filter((b) => b.status === "unpaid"),
        ),
        client
          .from("orders")
          .select(
            "id, reference, status, balance_pence, delivery_window_start, delivery_window_end, product_summary",
          )
          .gt("balance_pence", 0)
          .not("status", "in", "(quoted,cancelled)")
          .limit(500)
          .then((r) => r.data ?? []),
      ]);
      const expected: Expected[] = [
        ...planned.map((e) => ({
          date: e.entry_date,
          direction: e.direction,
          pence: e.amount_pence,
          label: `${e.category_label}: ${e.note}`,
          source: "planned" as const,
        })),
        ...bills.map((b) => ({
          date: b.due_date ?? b.bill_date,
          direction: "out" as const,
          pence: b.gross_pence,
          label: `Bill from ${b.supplier_name}: ${b.description}`,
          source: "bill" as const,
        })),
        ...orders.map((o) => ({
          date: (o.delivery_window_end ??
            o.delivery_window_start ??
            today) as string,
          direction: "in" as const,
          pence: Number(o.balance_pence),
          label: `Balance on ${o.reference}${o.product_summary ? `, ${o.product_summary}` : ""}`,
          source: "balance" as const,
        })),
      ];
      return expected;
    },
  });

  const openingPence =
    opening.trim() === "" ? null : Math.round(Number(opening) * 100);
  const forecast = useMemo(
    () =>
      data
        ? cashForecast(
            data,
            today,
            weeks,
            Number.isNaN(openingPence) ? null : openingPence,
          )
        : null,
    [data, today, weeks, openingPence],
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="fc-weeks">Look ahead</Label>
          <select
            id="fc-weeks"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
          >
            <option value={5}>30 days</option>
            <option value={9}>60 days</option>
            <option value={13}>90 days</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="fc-open">
            Bank balance today ({currencySymbol()}, optional)
          </Label>
          <Input
            id="fc-open"
            inputMode="decimal"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
          />
        </div>
      </div>

      {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-destructive">Could not load the forecast.</p>
      )}

      {forecast && (
        <section className="flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-base font-semibold">
            What is expected, week by week
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Week</th>
                  <th className="py-1 text-right font-medium">In</th>
                  <th className="py-1 text-right font-medium">Out</th>
                  <th className="py-1 text-right font-medium">Net</th>
                  {openingPence !== null && (
                    <th className="py-1 text-right font-medium">Balance</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {forecast.map((w) => (
                  <tr key={w.start} className="align-top">
                    <td className="py-1.5">
                      {day(w.start)} to {day(w.end)}
                      {w.overdue ? (
                        <span className="ml-2 rounded bg-warning-soft px-1.5 text-xs text-warning">
                          Includes overdue
                        </span>
                      ) : null}
                      {w.items.length > 0 && (
                        <ul className="mt-1 text-xs text-muted-foreground">
                          {w.items.map((it, i) => (
                            <li key={i}>
                              {day(it.date)} ·{" "}
                              {it.direction === "in" ? "+" : "-"}
                              {formatPence(it.pence)} · {it.label}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatPence(w.inPence)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatPence(w.outPence)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatPence(w.net)}
                    </td>
                    {openingPence !== null && (
                      <td
                        className={`py-1.5 text-right tabular-nums ${(w.running ?? 0) < 0 ? "font-semibold text-destructive" : ""}`}
                      >
                        {formatPence(w.running ?? 0)}
                        {(w.running ?? 0) < 0 ? " (short)" : ""}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Built from planned money-book entries, unpaid supplier bills on
            their due dates, and what customers still owe on orders, expected at
            delivery. Overdue items land in the first week. It is only as
            complete as what has been entered.
          </p>
        </section>
      )}
    </>
  );
};

const Row = ({
  label,
  pence,
  signed = false,
}: {
  label: string;
  pence: number;
  signed?: boolean;
}) => (
  <div className="flex items-baseline justify-between gap-3 text-sm">
    <span>{label}</span>
    <span className="tabular-nums">
      {signed && pence > 0 ? "+" : ""}
      {formatPence(pence)}
    </span>
  </div>
);

const Block = ({
  title,
  lines,
  total,
}: {
  title: string;
  lines: { label: string; pence: number }[];
  total: number;
}) => (
  <div className="flex flex-col gap-1.5">
    <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
    {lines.length === 0 ? (
      <p className="text-sm text-muted-foreground">None in this period.</p>
    ) : (
      lines.map((l) => <Row key={l.label} label={l.label} pence={l.pence} />)
    )}
    <div className="flex items-baseline justify-between border-t pt-1.5 text-sm font-medium">
      <span>Total {title.toLowerCase()}</span>
      <span className="tabular-nums">{formatPence(total)}</span>
    </div>
  </div>
);
