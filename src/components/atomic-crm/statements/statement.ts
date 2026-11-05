// Customer statements. Pure functions, so the rules can be tested. A statement lists what was invoiced,
// credited and paid, with a running balance, and says how much of what is owed is late.

export type StatementLine = {
  contact_id: number | null;
  line_date: string;
  kind: "invoice" | "credit_note" | "payment";
  reference: string | null;
  order_reference: string | null;
  due_date: string | null;
  debit_pence: number;
  credit_pence: number;
  sort_order: number;
  source_id: number;
};

export type StatementRow = StatementLine & { balance_pence: number };

export type OpenInvoice = {
  reference: string | null;
  order_reference: string | null;
  line_date: string;
  due_date: string | null;
  open_pence: number;
  days_late: number; // 0 when not yet due
};

export type Statement = {
  rows: StatementRow[];
  balancePence: number;
  openInvoices: OpenInvoice[];
  latePence: number;
  invoicedPence: number;
  paidAndCreditedPence: number;
};

const DAY = 86_400_000;
const dayNumber = (iso: string) =>
  Math.round(new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime() / DAY);

// Oldest first; on one day the invoice comes before the credit note and the payment.
export const byStatementOrder = (a: StatementLine, b: StatementLine) =>
  a.line_date.localeCompare(b.line_date) ||
  a.sort_order - b.sort_order ||
  a.source_id - b.source_id;

// Credits (payments and credit notes) are set against the oldest invoice first, which is how a
// customer's account is normally read. What is left on each invoice is what is still open.
export const buildStatement = (
  lines: StatementLine[],
  today: string,
): Statement => {
  const sorted = [...lines].sort(byStatementOrder);
  let balance = 0;
  const rows: StatementRow[] = sorted.map((l) => {
    balance += l.debit_pence - l.credit_pence;
    return { ...l, balance_pence: balance };
  });

  const invoices = sorted
    .filter((l) => l.kind === "invoice")
    .map((l) => ({ ...l, open: l.debit_pence }));
  let credit = sorted.reduce((sum, l) => sum + l.credit_pence, 0);
  for (const inv of invoices) {
    if (credit <= 0) break;
    const used = Math.min(inv.open, credit);
    inv.open -= used;
    credit -= used;
  }
  const openInvoices: OpenInvoice[] = invoices
    .filter((i) => i.open > 0)
    .map((i) => ({
      reference: i.reference,
      order_reference: i.order_reference,
      line_date: i.line_date,
      due_date: i.due_date,
      open_pence: i.open,
      days_late:
        i.due_date && i.due_date < today
          ? dayNumber(today) - dayNumber(i.due_date)
          : 0,
    }));
  return {
    rows,
    balancePence: balance,
    openInvoices,
    latePence: openInvoices
      .filter((i) => i.days_late > 0)
      .reduce((s, i) => s + i.open_pence, 0),
    invoicedPence: sorted.reduce((s, l) => s + l.debit_pence, 0),
    paidAndCreditedPence: sorted.reduce((s, l) => s + l.credit_pence, 0),
  };
};

// How much is owed, grouped by how late it is. The same buckets an accountant uses for debtors.
export type AgeBucket = "notDue" | "d1to30" | "d31to60" | "d61plus";
export const BUCKET_LABEL: Record<AgeBucket, string> = {
  notDue: "Not yet due",
  d1to30: "1 to 30 days late",
  d31to60: "31 to 60 days late",
  d61plus: "Over 60 days late",
};
export const bucketOf = (daysLate: number): AgeBucket =>
  daysLate <= 0
    ? "notDue"
    : daysLate <= 30
      ? "d1to30"
      : daysLate <= 60
        ? "d31to60"
        : "d61plus";

export const ageing = (open: OpenInvoice[]): Record<AgeBucket, number> => {
  const out: Record<AgeBucket, number> = {
    notDue: 0,
    d1to30: 0,
    d31to60: 0,
    d61plus: 0,
  };
  for (const i of open) out[bucketOf(i.days_late)] += i.open_pence;
  return out;
};

const pounds = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    pence / 100,
  );
const ukDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB");

// A message to send with the statement. It never includes bank details: those are shared another way.
export const statementMessage = ({
  customer,
  business,
  statement,
  today,
}: {
  customer: string;
  business: string;
  statement: Statement;
  today: string;
}) => {
  const lines = [
    `Hi ${customer}, here is your statement from ${business} as at ${ukDate(today)}.`,
    "",
  ];
  if (statement.openInvoices.length === 0) {
    lines.push("Nothing is outstanding. Thank you.");
    return lines.join("\n");
  }
  for (const i of statement.openInvoices) {
    const late =
      i.days_late > 0
        ? ` (${i.days_late} day${i.days_late === 1 ? "" : "s"} late)`
        : i.due_date
          ? ` (due ${ukDate(i.due_date)})`
          : "";
    lines.push(
      `${i.reference ?? "Invoice"} dated ${ukDate(i.line_date)}: ${pounds(i.open_pence)}${late}`,
    );
  }
  lines.push("", `Total outstanding: ${pounds(statement.balancePence)}`);
  if (statement.latePence > 0)
    lines.push(`Of which overdue: ${pounds(statement.latePence)}`);
  lines.push(
    "",
    "If you have already paid, thank you, and please ignore this. If anything looks wrong, just reply and we will sort it out.",
  );
  return lines.join("\n");
};
