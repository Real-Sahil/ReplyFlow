// Reading a bank's CSV and suggesting which invoice or bill each line is. Pure functions, so the
// rules can be tested. Nothing here talks to a bank: the person downloads a statement and drops the
// file in. Banks differ, so columns are found by their headings, and dates are read day first.

import Papa from "papaparse";

import type { OwedByCustomer, OwedToSupplier } from "./owed";

export type BankRow = {
  line_date: string; // YYYY-MM-DD
  description: string;
  amount_pence: number; // positive in, negative out
  line_hash: string;
};

export type ParseResult = {
  rows: BankRow[];
  skipped: number;
  problem: string | null;
};

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const iso = (y: number, m: number, d: number): string | null => {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  )
    return null;
  return date.toISOString().slice(0, 10);
};

// 04/11/2026, 4-11-26, 2026-11-04, 4 Nov 2026, 04-Nov-26. Day first, as UK banks write it.
export const parseBankDate = (raw: string): string | null => {
  const text = raw.trim();
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = text.match(/^(\d{1,2})[/.\-\s]+(\d{1,2})[/.\-\s]+(\d{2,4})/);
  if (m) {
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(year, Number(m[2]), Number(m[1]));
  }
  m = text.match(/^(\d{1,2})[\s\-/]+([A-Za-z]{3})[A-Za-z]*[\s\-/,]+(\d{2,4})/);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) return null;
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(year, month, Number(m[1]));
  }
  return null;
};

// £1,234.50, -12.00, (12.00), 12.00 DR. Returns pence, or null when it is not a number. The sign
// is kept: a bracketed or negative amount is money out.
export const parseBankAmount = (raw: string): number | null => {
  let text = raw.trim();
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (/\b(dr|debit)\b/i.test(text)) negative = true;
  text = text.replace(/\b(cr|dr|credit|debit)\b/gi, "").replace(/[£,\s]/g, "");
  if (text.startsWith("-")) {
    negative = !negative ? true : negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const pence = Math.round(Number(text) * 100);
  return negative ? -pence : pence;
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const find = (headers: string[], test: RegExp) =>
  headers.findIndex((h) => test.test(h));

export const parseBankCsv = (text: string): ParseResult => {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const parsed = Papa.parse<string[]>(clean, {
    skipEmptyLines: "greedy",
  });
  const table = parsed.data.filter((r) => Array.isArray(r) && r.length > 1);
  // The heading row is the first one that names a date and some money.
  const headerAt = table.findIndex((r) => {
    const h = r.map((c) => norm(String(c)));
    return (
      find(h, /date/) >= 0 &&
      find(h, /amount|paid in|paid out|credit|debit|money/) >= 0
    );
  });
  if (headerAt < 0) {
    return {
      rows: [],
      skipped: 0,
      problem:
        "That file has no heading row with a date and an amount. Download the statement as CSV from your bank and try again.",
    };
  }
  const headers = table[headerAt].map((c) => norm(String(c)));
  const dateCol = find(
    headers,
    /^(transaction |posting |posted |booking )?date/,
  );
  const amountCol = find(headers, /^amount( \(.*\))?$|^value$/);
  const inCol = find(headers, /paid in|money in|credit|deposit/);
  const outCol = find(headers, /paid out|money out|debit|withdrawal/);
  const descCols = headers
    .map((h, i) =>
      /description|details|narrative|memo|payee|reference|name|merchant/.test(h)
        ? i
        : -1,
    )
    .filter((i) => i >= 0)
    .slice(0, 3);
  if (
    dateCol < 0 ||
    (amountCol < 0 && inCol < 0 && outCol < 0) ||
    descCols.length === 0
  ) {
    return {
      rows: [],
      skipped: 0,
      problem:
        "I could not find the date, description and amount columns in that file. Check it is a bank statement in CSV form.",
    };
  }

  const seen = new Map<string, number>();
  const rows: BankRow[] = [];
  let skipped = 0;
  for (const r of table.slice(headerAt + 1)) {
    const date = parseBankDate(String(r[dateCol] ?? ""));
    let pence: number | null = null;
    if (amountCol >= 0) {
      pence = parseBankAmount(String(r[amountCol] ?? ""));
    } else {
      const moneyIn =
        inCol >= 0 ? parseBankAmount(String(r[inCol] ?? "")) : null;
      const moneyOut =
        outCol >= 0 ? parseBankAmount(String(r[outCol] ?? "")) : null;
      if (moneyIn) pence = Math.abs(moneyIn);
      else if (moneyOut) pence = -Math.abs(moneyOut);
    }
    const description = descCols
      .map((i) => String(r[i] ?? "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .slice(0, 300);
    if (!date || !pence || !description) {
      skipped++;
      continue;
    }
    // Two identical lines on one day are two real payments, so they are numbered.
    const base = `${date}|${pence}|${norm(description)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    rows.push({
      line_date: date,
      description,
      amount_pence: pence,
      line_hash: n === 1 ? base : `${base}#${n}`,
    });
  }
  return {
    rows,
    skipped,
    problem:
      rows.length === 0 ? "No usable lines were found in that file." : null,
  };
};

export type Suggestion =
  | {
      kind: "customer";
      order_id: number;
      label: string;
      owed_pence: number;
      strong: boolean;
    }
  | {
      kind: "bill";
      bill_id: number;
      label: string;
      owed_pence: number;
      strong: boolean;
    };

const tokens = (name: string | null) =>
  norm(name ?? "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);

const overlap = (name: string | null, description: string) => {
  const d = norm(description);
  return tokens(name).filter((t) => d.includes(t)).length;
};

type Line = { id: number; amount_pence: number; description: string };

// One suggestion per line, and each invoice or bill suggested to at most one line. Money in is
// matched to what a customer owes by the exact amount, money out to an unpaid bill by the exact
// amount; a name in the description makes a match strong and breaks ties.
export const suggestAll = (
  lines: Line[],
  owed: OwedByCustomer[],
  bills: OwedToSupplier[],
): Map<number, Suggestion> => {
  const out = new Map<number, Suggestion>();
  const usedOrders = new Set<number>();
  const usedBills = new Set<number>();

  type Cand = {
    line: Line;
    score: number;
    make: () => Suggestion;
    take: () => void;
    unique: boolean;
  };
  const cands: Cand[] = [];

  for (const line of lines) {
    if (line.amount_pence > 0) {
      const exact = owed.filter((o) => o.owed_pence === line.amount_pence);
      for (const o of exact) {
        const score = overlap(o.customer_name, line.description);
        cands.push({
          line,
          score,
          unique: exact.length === 1,
          take: () => usedOrders.add(o.order_id),
          make: () => ({
            kind: "customer",
            order_id: o.order_id,
            label: `${o.latest_invoice_number ?? "Invoice"}, ${o.customer_name ?? "customer"}`,
            owed_pence: o.owed_pence,
            strong: score > 0 || exact.length === 1,
          }),
        });
      }
    } else {
      const amount = -line.amount_pence;
      const exact = bills.filter((b) => b.owed_pence === amount);
      for (const b of exact) {
        const score = overlap(b.supplier_name, line.description);
        cands.push({
          line,
          score,
          unique: exact.length === 1,
          take: () => usedBills.add(b.id),
          make: () => ({
            kind: "bill",
            bill_id: b.id,
            label: `${b.supplier_name}${b.reference ? `, ${b.reference}` : ""}`,
            owed_pence: b.owed_pence,
            strong: score > 0 || exact.length === 1,
          }),
        });
      }
    }
  }
  // Best matches first: a name in the description, then a lone exact amount.
  cands.sort(
    (a, b) => b.score - a.score || Number(b.unique) - Number(a.unique),
  );
  for (const c of cands) {
    if (out.has(c.line.id)) continue;
    const s = c.make();
    if (s.kind === "customer" && usedOrders.has(s.order_id)) continue;
    if (s.kind === "bill" && usedBills.has(s.bill_id)) continue;
    out.set(c.line.id, s);
    c.take();
  }
  return out;
};
