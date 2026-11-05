// Repeating money entries and bills. The database adds the occurrences (see the recurring_items
// migration); these helpers describe them and preview the dates, using the same rule as the database.

export type RepeatKind = "money_in" | "money_out" | "bill";
export type Frequency =
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "quarterly"
  | "yearly";

export type RecurringItem = {
  id: number;
  kind: RepeatKind;
  title: string;
  frequency: Frequency;
  next_date: string;
  anchor_day: number;
  end_date: string | null;
  category: string;
  amount_pence: number;
  vat_pence: number;
  counterparty: string | null;
  payment_method: string | null;
  note: string | null;
  due_days: number;
  active: boolean;
  last_generated_on: string | null;
  last_error: string | null;
};

export const KIND_LABEL: Record<RepeatKind, string> = {
  money_in: "Money in",
  money_out: "Money out",
  bill: "Bill to pay",
};

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: "Every week",
  fortnightly: "Every 2 weeks",
  monthly: "Every month",
  quarterly: "Every 3 months",
  yearly: "Every year",
};

const iso = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const daysInMonth = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();

// The date after `from`. Months keep the day they started on: 31 Jan, 28 Feb, 31 Mar. The same rule
// as private.next_occurrence in the database.
export const nextOccurrence = (
  from: string,
  frequency: Frequency,
  anchorDay: number,
): string => {
  const [y, m, d] = from.split("-").map(Number);
  if (frequency === "weekly" || frequency === "fortnightly") {
    const date = new Date(
      Date.UTC(y, m - 1, d + (frequency === "weekly" ? 7 : 14)),
    );
    return iso(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
    );
  }
  const step = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  const total = y * 12 + (m - 1) + step;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return iso(ny, nm, Math.min(anchorDay, daysInMonth(ny, nm)));
};

// The next few dates an item will repeat on, from its next date, stopping at its end date.
export const upcoming = (
  item: Pick<
    RecurringItem,
    "next_date" | "frequency" | "anchor_day" | "end_date"
  >,
  count: number,
): string[] => {
  const out: string[] = [];
  let date = item.next_date;
  while (out.length < count && (!item.end_date || date <= item.end_date)) {
    out.push(date);
    date = nextOccurrence(date, item.frequency, item.anchor_day);
  }
  return out;
};

export type RepeatState = "running" | "paused" | "ended" | "problem";

export const repeatState = (
  item: RecurringItem,
  today: string,
): RepeatState => {
  if (item.last_error) return "problem";
  if (!item.active) return "paused";
  if (item.end_date && item.next_date > item.end_date) return "ended";
  if (item.end_date && item.end_date < today) return "ended";
  return "running";
};

// What one year of an item adds up to, to help someone judge what a repeat costs.
export const PER_YEAR: Record<Frequency, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};
export const perYearPence = (
  item: Pick<
    RecurringItem,
    "amount_pence" | "vat_pence" | "kind" | "frequency"
  >,
) =>
  (item.kind === "bill"
    ? item.amount_pence + item.vat_pence
    : item.amount_pence) * PER_YEAR[item.frequency];
