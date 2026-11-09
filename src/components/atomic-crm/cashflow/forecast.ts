// A simple look ahead at the bank balance. Pure functions, so the rules can be tested.
//
// Start from the balance an administrator typed in. Money comes in when planned entries and customers'
// invoices are due, and goes out when planned entries and unpaid bills are due. Late items are not left
// out: late bills are counted today, and late customer payments are counted after a delay the person
// chooses (or not at all). This is a guide to when money is tight, not a promise.

export type PlannedEntry = {
  id?: number;
  // The repeating item that made this entry, if one did.
  recurring_item_id?: number | null;
  entry_date: string;
  direction: "in" | "out";
  amount_pence: number;
  counterparty: string | null;
  note: string;
};
export type UnpaidBill = {
  id?: number;
  supplier_name: string;
  bill_date: string;
  due_date: string | null;
  gross_pence: number;
  description: string;
};
export type CustomerOwes = {
  order_id?: number;
  customer_name: string | null;
  order_reference: string | null;
  due_date: string | null;
  owed_pence: number;
};

export type FlowSource = "planned" | "bill" | "customer" | "ads";
export type Flow = {
  // "planned:12", "bill:5" or "customer:7" (an order), so a line can be left out and put back.
  key?: string;
  date: string;
  pence: number; // positive in, negative out
  label: string;
  source: FlowSource;
  late: boolean;
};
export type SkipReason = "left_out" | "invoiced";
export type Skipped = Flow & { reason: SkipReason };

export type Day = {
  date: string;
  inPence: number;
  outPence: number;
  balance: number;
};

export type ForecastInput = {
  openingPence: number;
  today: string;
  days: number;
  planned: PlannedEntry[];
  bills: UnpaidBill[];
  owed: CustomerOwes[];
  // After how many days a customer who is already late is assumed to pay. Null: do not count them.
  lateCustomerDays: number | null;
  // Customer invoices with no due date are assumed to be paid after this many days.
  noDueDateDays?: number;
  // Lines the person chose to leave out, by key.
  leftOut?: Set<string>;
  // "<repeating item id>:<YYYY-MM>" for each month an invoice has been issued for a repeating retainer, so
  // that month's planned entry is not counted as well as the invoice.
  invoiced?: Set<string>;
  // What LinkedIn advertising costs in a typical week, worked out from recent real spend. When given, that
  // amount goes out every seven days. It is an estimate of money not yet committed, and the person can switch
  // it off.
  adsWeeklyPence?: number | null;
};

export type Forecast = {
  days: Day[];
  flows: Flow[];
  totalIn: number;
  totalOut: number;
  endBalance: number;
  lowest: { date: string; balance: number };
  firstBelowZero: string | null;
  // Late customer money left out of the forecast, because the person chose not to count it.
  leftOutPence: number;
  // Lines not counted, with why, so they can be shown and put back.
  skipped: Skipped[];
};

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const buildForecast = (input: ForecastInput): Forecast => {
  const { openingPence, today, days, lateCustomerDays } = input;
  const end = addDays(today, days);
  const flows: Flow[] = [];
  let leftOut = 0;
  const skipped: Skipped[] = [];
  const mine = input.leftOut ?? new Set<string>();
  const invoiced = input.invoiced ?? new Set<string>();
  // Adds a flow, or sets it aside when it is covered by an invoice or the person left it out.
  const add = (f: Flow, covered = false) => {
    if (covered) skipped.push({ ...f, reason: "invoiced" });
    else if (f.key && mine.has(f.key))
      skipped.push({ ...f, reason: "left_out" });
    else flows.push(f);
  };

  for (const e of input.planned) {
    const late = e.entry_date < today;
    const date = late ? today : e.entry_date;
    if (date > end) continue;
    const covered =
      e.recurring_item_id != null &&
      e.direction === "in" &&
      invoiced.has(`${e.recurring_item_id}:${e.entry_date.slice(0, 7)}`);
    add(
      {
        key: e.id === undefined ? undefined : `planned:${e.id}`,
        date,
        pence: e.direction === "in" ? e.amount_pence : -e.amount_pence,
        label: e.counterparty ? `${e.note} (${e.counterparty})` : e.note,
        source: "planned",
        late,
      },
      covered,
    );
  }
  for (const b of input.bills) {
    const due = b.due_date ?? b.bill_date;
    const late = due < today;
    const date = late ? today : due;
    if (date > end) continue;
    add({
      key: b.id === undefined ? undefined : `bill:${b.id}`,
      date,
      pence: -b.gross_pence,
      label: `${b.supplier_name}: ${b.description}`,
      source: "bill",
      late,
    });
  }
  for (const o of input.owed) {
    const name = o.customer_name ?? "A customer";
    const label = o.order_reference ? `${name} (${o.order_reference})` : name;
    const key = o.order_id === undefined ? undefined : `customer:${o.order_id}`;
    if (!o.due_date) {
      const date = addDays(today, input.noDueDateDays ?? 14);
      if (date <= end)
        add({
          key,
          date,
          pence: o.owed_pence,
          label,
          source: "customer",
          late: false,
        });
      continue;
    }
    if (o.due_date < today) {
      if (lateCustomerDays === null) {
        leftOut += o.owed_pence;
        continue;
      }
      const date = addDays(today, lateCustomerDays);
      if (date <= end)
        add({
          key,
          date,
          pence: o.owed_pence,
          label,
          source: "customer",
          late: true,
        });
      continue;
    }
    if (o.due_date <= end)
      add({
        key,
        date: o.due_date,
        pence: o.owed_pence,
        label,
        source: "customer",
        late: false,
      });
  }
  if (input.adsWeeklyPence && input.adsWeeklyPence > 0) {
    for (let n = 7; n <= days; n += 7) {
      flows.push({
        date: addDays(today, n),
        pence: -input.adsWeeklyPence,
        label: "LinkedIn ads (estimate from recent spend)",
        source: "ads",
        late: false,
      });
    }
  }
  flows.sort((a, b) => a.date.localeCompare(b.date) || b.pence - a.pence);

  const out: Day[] = [];
  let balance = openingPence;
  let totalIn = 0;
  let totalOut = 0;
  let lowest = { date: today, balance: openingPence };
  let firstBelowZero: string | null = null;
  for (let i = 0; i <= days; i += 1) {
    const date = addDays(today, i);
    let inPence = 0;
    let outPence = 0;
    for (const f of flows) {
      if (f.date !== date) continue;
      if (f.pence >= 0) inPence += f.pence;
      else outPence += -f.pence;
    }
    balance += inPence - outPence;
    totalIn += inPence;
    totalOut += outPence;
    out.push({ date, inPence, outPence, balance });
    if (balance < lowest.balance || i === 0) lowest = { date, balance };
    if (balance < 0 && firstBelowZero === null) firstBelowZero = date;
  }
  // The lowest point is the lowest end-of-day balance in the window.
  lowest = out.reduce(
    (low, d) =>
      d.balance < low.balance ? { date: d.date, balance: d.balance } : low,
    { date: out[0].date, balance: out[0].balance },
  );
  return {
    days: out,
    flows,
    totalIn,
    totalOut,
    endBalance: balance,
    lowest,
    firstBelowZero,
    leftOutPence: leftOut,
    skipped,
  };
};

// How old the typed-in balance is, in days, so the page can say when it is out of date.
export const balanceAgeDays = (asAt: string, today: string) =>
  Math.round(
    (new Date(`${today}T00:00:00Z`).getTime() -
      new Date(`${asAt}T00:00:00Z`).getTime()) /
      86_400_000,
  );

// A typical week of LinkedIn ad spend, from the daily figures of the fourteen days before today, in pence.
// Returns null when there is too little to go on (under seven days of figures) or when any figure is in a
// different currency from the business's, because adding those would be wrong.
export const adsWeeklyEstimate = (
  rows: { day: string; spend: number; currency: string }[],
  businessCurrency: string,
  today: string,
): number | null => {
  const from = addDays(today, -14);
  const recent = rows.filter((r) => r.day >= from && r.day < today);
  const days = new Set(recent.map((r) => r.day));
  if (days.size < 7) return null;
  if (recent.some((r) => r.currency && r.currency !== businessCurrency)) {
    return null;
  }
  const total = recent.reduce((t, r) => t + r.spend, 0);
  const pence = Math.round((total / 14) * 7 * 100);
  return pence > 0 ? pence : null;
};
