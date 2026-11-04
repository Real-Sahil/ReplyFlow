// Money owed to the business by customers, and by the business to suppliers. Pure helpers over the
// rows the two views return, so each rule can be tested.

export type OwedByCustomer = {
  order_id: number;
  order_reference: string | null;
  contact_id: number | null;
  customer_name: string | null;
  invoiced_pence: number;
  paid_pence: number;
  owed_pence: number;
  due_date: string | null;
  latest_invoice_number: string | null;
};

export type OwedToSupplier = {
  id: number;
  supplier_name: string;
  reference: string | null;
  description: string | null;
  bill_date: string;
  due_date: string | null;
  owed_pence: number;
  order_id: number | null;
};

const DAY = 86_400_000;
const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const parseDay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
};

// Whole days past the due date: positive when late, zero on the day, negative before it.
// Without a due date nothing is late.
export const daysLate = (due: string | null, today: Date): number =>
  due ? Math.round((startOfDay(today) - parseDay(due)) / DAY) : 0;

export const dueLabel = (due: string | null, today: Date): string => {
  if (!due) return "No due date";
  const late = daysLate(due, today);
  if (late > 0) return late === 1 ? "1 day late" : `${late} days late`;
  if (late === 0) return "Due today";
  return late === -1 ? "Due tomorrow" : `Due in ${-late} days`;
};

export const total = (rows: { owed_pence: number }[]) =>
  rows.reduce((sum, r) => sum + r.owed_pence, 0);

export const overdue = <T extends { due_date: string | null }>(
  rows: T[],
  today: Date,
) => rows.filter((r) => daysLate(r.due_date, today) > 0);

// Most late first, then nearest due date, then the ones with no due date.
export const byUrgency = <T extends { due_date: string | null }>(
  rows: T[],
): T[] =>
  [...rows].sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });

const pounds = (pence: number) =>
  `£${(pence / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// A short, polite reminder to copy into Messenger, a text or an email. It names the amount and the
// invoice, says what was due when, and makes it easy to ignore if it has already been paid. It never
// includes bank details: those belong on the invoice.
export const reminderText = ({
  customerName,
  invoiceNumber,
  owedPence,
  dueDate,
  businessName,
  today,
}: {
  customerName: string | null;
  invoiceNumber: string | null;
  owedPence: number;
  dueDate: string | null;
  businessName: string | null;
  today: Date;
}): string => {
  const first = customerName?.trim().split(/\s+/)[0];
  const late = daysLate(dueDate, today);
  const invoice = invoiceNumber ? `invoice ${invoiceNumber}` : "your invoice";
  const status =
    dueDate && late > 0
      ? ` It was due on ${new Date(parseDay(dueDate)).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.`
      : "";
  const sign = businessName?.trim() ? `\n${businessName.trim()}` : "";
  return (
    `Hi${first ? ` ${first}` : ""}, a quick reminder that ${invoice} for ${pounds(owedPence)} is still open.${status} ` +
    `If you have already paid, thank you, and please ignore this message.\n\nThanks,${sign}`
  ).trim();
};
