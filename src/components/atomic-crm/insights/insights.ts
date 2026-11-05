// Business insights over figures the app already holds. Pure functions, so every rule can be tested. The
// wording states what the figures show and no more: it does not predict, and it does not advise.

import type { Line, Pnl } from "../finance/reports";
import { moneyFormat } from "../markets/moneyFormat";

export type MonthRow = Pnl["months"][number];

const pounds = (pence: number) =>
  new Intl.NumberFormat(moneyFormat().locale, {
    style: "currency",
    currency: moneyFormat().currency,
    maximumFractionDigits: 0,
  }).format(pence / 100);
const monthName = (m: string) =>
  new Date(`${m}-01T12:00:00`).toLocaleDateString("en-GB", { month: "long" });

export type CustomerSales = { name: string; pence: number };

// Invoiced sales per customer (credit notes are negative, so they reduce it), largest first.
export const topCustomers = (
  rows: { customer_name: string | null; net_pence: number }[],
  limit = 8,
): CustomerSales[] => {
  const map = new Map<string, number>();
  for (const r of rows) {
    const name = r.customer_name?.trim() || "Not named";
    map.set(name, (map.get(name) ?? 0) + r.net_pence);
  }
  return [...map]
    .filter(([, pence]) => pence > 0)
    .map(([name, pence]) => ({ name, pence }))
    .sort((a, b) => b.pence - a.pence)
    .slice(0, limit);
};

// The largest items plus one "Everything else", so a chart stays readable.
export const costMix = (costs: Line[], keep = 6): Line[] => {
  const live = costs
    .filter((c) => c.pence > 0)
    .sort((a, b) => b.pence - a.pence);
  if (live.length <= keep) return live;
  const rest = live.slice(keep).reduce((s, c) => s + c.pence, 0);
  return [...live.slice(0, keep), { label: "Everything else", pence: rest }];
};

// Months with something in them, oldest first, filling any month with nothing so the chart has no gaps.
export const fillMonths = (
  months: MonthRow[],
  from: string,
  to: string,
): MonthRow[] => {
  const by = new Map(months.map((m) => [m.month, m]));
  const out: MonthRow[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(by.get(key) ?? { month: key, income: 0, costs: 0, profit: 0 });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// A few plain sentences about what stands out. Each one is only said when the figures support it.
export const observations = ({
  months,
  costs,
  customers,
  incomeTotal,
  latePence,
  owedPence,
}: {
  months: MonthRow[];
  costs: Line[];
  customers: CustomerSales[];
  incomeTotal: number;
  latePence: number;
  owedPence: number;
}): string[] => {
  const out: string[] = [];

  // The last three full months against the three before them.
  const withData = months.filter((m) => m.income !== 0 || m.costs !== 0);
  if (withData.length >= 6) {
    const last3 = withData.slice(-3);
    const prev3 = withData.slice(-6, -3);
    const inNow = sum(last3.map((m) => m.income));
    const inBefore = sum(prev3.map((m) => m.income));
    const outNow = sum(last3.map((m) => m.costs));
    const outBefore = sum(prev3.map((m) => m.costs));
    if (inBefore > 0) {
      const change = Math.round(((inNow - inBefore) / inBefore) * 100);
      if (Math.abs(change) >= 10)
        out.push(
          `Income over the last three months is ${Math.abs(change)}% ${change > 0 ? "higher" : "lower"} than the three months before.`,
        );
    }
    if (outBefore > 0) {
      const change = Math.round(((outNow - outBefore) / outBefore) * 100);
      if (Math.abs(change) >= 10)
        out.push(
          `Costs over the last three months are ${Math.abs(change)}% ${change > 0 ? "higher" : "lower"} than the three months before.`,
        );
    }
  }

  const best = [...withData].sort((a, b) => b.profit - a.profit)[0];
  if (best && withData.length >= 3 && best.profit > 0)
    out.push(
      `${monthName(best.month)} was the most profitable month, at ${pounds(best.profit)}.`,
    );
  const losses = withData.filter((m) => m.profit < 0);
  if (losses.length > 0)
    out.push(
      `${losses.length} ${losses.length === 1 ? "month" : "months"} made a loss: ${losses.map((m) => monthName(m.month)).join(", ")}.`,
    );

  if (customers.length > 0 && incomeTotal > 0) {
    const share = Math.round((customers[0].pence / incomeTotal) * 100);
    if (share >= 30)
      out.push(
        `${customers[0].name} is ${share}% of your income. Losing one customer that size would be felt.`,
      );
  }

  const totalCosts = sum(costs.filter((c) => c.pence > 0).map((c) => c.pence));
  const topCost = [...costs].sort((a, b) => b.pence - a.pence)[0];
  if (topCost && totalCosts > 0) {
    const share = Math.round((topCost.pence / totalCosts) * 100);
    if (share >= 25)
      out.push(
        `${topCost.label} is your largest cost, at ${share}% of all costs.`,
      );
  }

  if (owedPence > 0 && latePence > 0) {
    const share = Math.round((latePence / owedPence) * 100);
    out.push(
      `${pounds(latePence)} of the ${pounds(owedPence)} customers owe you is late (${share}%).`,
    );
  }
  return out;
};

export type RangeChoice = "12" | "6" | "year";

// The first and last month (YYYY-MM) and the first day to fetch, for a choice of period.
export const rangeFor = (choice: RangeChoice, today: Date) => {
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-based
  const to = `${y}-${String(m + 1).padStart(2, "0")}`;
  let start: Date;
  if (choice === "year") start = new Date(y, 0, 1);
  else start = new Date(y, m - (Number(choice) - 1), 1);
  const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  return { fromMonth: from, toMonth: to, fromDate: `${from}-01` };
};
