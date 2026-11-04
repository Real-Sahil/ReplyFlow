// Profit and loss, sales by channel and the cash forecast. Pure functions over rows the screens
// already load, so each rule can be tested.
//
// Basis, stated on the report: income is counted when invoiced, costs when billed, and money-book
// entries when they happen. Stock is counted when it is bought. VAT is never income or cost.
// Things that are not profit (VAT and tax payments, loans, the owner putting money in or taking it
// out, transfers) are listed apart, so the figure can be compared with the bank without them
// disturbing it.

import type { BillRow, EntryRow, SalesRow } from "./accountantPack";

// Money-book categories that are not income or a cost of running the business.
export const NOT_PROFIT = new Set([
  "tax_vat",
  "tax_paye_ni",
  "ni_self_employed",
  "tax_corporation",
  "tax_income",
  "loan_received",
  "loan_repaid",
  "owner_invested",
  "drawings",
  "transfer_in",
  "transfer_out",
]);

export type Line = { label: string; pence: number };

export type Pnl = {
  income: Line[];
  incomeTotal: number;
  costs: Line[];
  costsTotal: number;
  profit: number;
  marginPercent: number | null;
  excluded: Line[];
  months: { month: string; income: number; costs: number; profit: number }[];
};

const add = (map: Map<string, number>, label: string, pence: number) =>
  map.set(label, (map.get(label) ?? 0) + pence);
const lines = (map: Map<string, number>): Line[] =>
  [...map]
    .filter(([, pence]) => pence !== 0)
    .map(([label, pence]) => ({ label, pence }))
    .sort((a, b) => Math.abs(b.pence) - Math.abs(a.pence));

// What a cost really cost: VAT that cannot be reclaimed is part of the cost.
const billCost = (b: BillRow) =>
  b.vat_reclaimable ? b.net_pence : b.gross_pence;

export const profitAndLoss = (
  sales: SalesRow[],
  bills: BillRow[],
  entries: EntryRow[],
): Pnl => {
  const income = new Map<string, number>();
  const costs = new Map<string, number>();
  const excluded = new Map<string, number>();
  const monthly = new Map<string, { income: number; costs: number }>();
  const bump = (iso: string, key: "income" | "costs", pence: number) => {
    const month = iso.slice(0, 7);
    const m = monthly.get(month) ?? { income: 0, costs: 0 };
    m[key] += pence;
    monthly.set(month, m);
  };

  for (const s of sales) {
    // Credit notes are already negative in invoice_ledger.
    add(
      income,
      s.kind === "credit_note" ? "Credit notes" : "Invoiced sales",
      s.net_pence,
    );
    bump(s.tax_point, "income", s.net_pence);
  }
  for (const b of bills.filter((x) => x.status !== "void")) {
    add(costs, b.category_label, billCost(b));
    bump(b.bill_date, "costs", billCost(b));
  }
  for (const e of entries.filter((x) => x.state === "done")) {
    const net = e.amount_pence - e.vat_pence;
    if (NOT_PROFIT.has(e.category)) {
      add(
        excluded,
        e.category_label,
        e.direction === "in" ? e.amount_pence : -e.amount_pence,
      );
    } else if (e.direction === "in") {
      add(income, e.category_label, net);
      bump(e.entry_date, "income", net);
    } else {
      add(costs, e.category_label, net);
      bump(e.entry_date, "costs", net);
    }
  }

  const incomeLines = lines(income);
  const costLines = lines(costs);
  const incomeTotal = incomeLines.reduce((a, l) => a + l.pence, 0);
  const costsTotal = costLines.reduce((a, l) => a + l.pence, 0);
  return {
    income: incomeLines,
    incomeTotal,
    costs: costLines,
    costsTotal,
    profit: incomeTotal - costsTotal,
    marginPercent:
      incomeTotal > 0
        ? Math.round(((incomeTotal - costsTotal) / incomeTotal) * 100)
        : null,
    excluded: lines(excluded),
    months: [...monthly]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, m]) => ({
        month,
        income: m.income,
        costs: m.costs,
        profit: m.income - m.costs,
      })),
  };
};

// ---- Sales by channel ------------------------------------------------------------------

export type ChannelRow = {
  channel: string;
  invoiced: number;
  outsideInvoices: number;
  total: number;
  orders: number;
};

export const CHANNELS = [
  "ecommerce",
  "facebook",
  "email",
  "phone",
  "in_person",
  "other",
] as const;

// Invoiced sales take the channel of their order; money-book sales carry their own.
export const salesByChannel = <S extends SalesRow, E extends EntryRow>(
  sales: S[],
  entries: E[],
  orderChannels: Map<string, string | null>,
  orderIdOf: (s: S) => string,
  channelOf: (e: E) => string | null,
): ChannelRow[] => {
  const map = new Map<
    string,
    { invoiced: number; outside: number; orders: Set<string> }
  >();
  const slot = (c: string) => {
    const v = map.get(c) ?? {
      invoiced: 0,
      outside: 0,
      orders: new Set<string>(),
    };
    map.set(c, v);
    return v;
  };
  for (const s of sales) {
    const id = orderIdOf(s);
    const c = orderChannels.get(id) ?? "not_stated";
    const v = slot(c);
    v.invoiced += s.net_pence;
    v.orders.add(id);
  }
  for (const e of entries.filter(
    (x) =>
      x.state === "done" &&
      x.direction === "in" &&
      x.category === "sales_other",
  )) {
    slot(channelOf(e) ?? "not_stated").outside += e.amount_pence - e.vat_pence;
  }
  return [...map]
    .map(([channel, v]) => ({
      channel,
      invoiced: v.invoiced,
      outsideInvoices: v.outside,
      total: v.invoiced + v.outside,
      orders: v.orders.size,
    }))
    .sort((a, b) => b.total - a.total);
};

// ---- Cash forecast ---------------------------------------------------------------------

export type Expected = {
  date: string; // YYYY-MM-DD
  direction: "in" | "out";
  pence: number;
  label: string;
  source: "planned" | "bill" | "balance";
};

export type Week = {
  start: string;
  end: string;
  inPence: number;
  outPence: number;
  net: number;
  running: number | null;
  overdue: boolean;
  items: Expected[];
};

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Weekly buckets from today. Anything already past its date lands in the first week and is marked
// overdue. The running balance starts from the opening balance only if one was given.
export const cashForecast = (
  expected: Expected[],
  today: string,
  weeks: number,
  openingPence: number | null,
): Week[] => {
  const out: Week[] = [];
  let running = openingPence;
  for (let i = 0; i < weeks; i++) {
    const start = addDays(today, i * 7);
    const end = addDays(today, i * 7 + 6);
    const items = expected.filter((e) =>
      i === 0 ? e.date <= end : e.date >= start && e.date <= end,
    );
    const inPence = items
      .filter((e) => e.direction === "in")
      .reduce((a, e) => a + e.pence, 0);
    const outPence = items
      .filter((e) => e.direction === "out")
      .reduce((a, e) => a + e.pence, 0);
    if (running !== null) running += inPence - outPence;
    out.push({
      start,
      end,
      inPence,
      outPence,
      net: inPence - outPence,
      running,
      overdue: i === 0 && items.some((e) => e.date < today),
      items: items.sort((a, b) => a.date.localeCompare(b.date)),
    });
  }
  return out;
};
