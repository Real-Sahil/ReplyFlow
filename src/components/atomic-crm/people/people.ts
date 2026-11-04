// Records and reminders for staff and contractors. Pure helpers, so each rule can be tested. This is
// record keeping: it does not calculate pay and it does not file anything.

export type Person = {
  id: number;
  full_name: string;
  kind: "employee" | "contractor";
  role_title: string | null;
  phone: string | null;
  email: string | null;
  start_date: string | null;
  end_date: string | null;
  pay_rate_pence: number | null;
  pay_basis: "hour" | "day" | "week" | "month" | "year" | "job" | null;
  holiday_allowance_days: number;
  notes: string | null;
  active: boolean;
};

export type PersonDocument = {
  id: number;
  person_id: number;
  title: string;
  issued_on: string | null;
  expires_on: string | null;
  note: string | null;
  file_path: string | null;
  active: boolean;
};

export type Leave = {
  id: number;
  person_id: number;
  kind: "holiday" | "sick" | "other";
  from_date: string;
  to_date: string;
  days: number;
  note: string | null;
  voided_at: string | null;
};

const DAY = 86_400_000;
const parse = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
};
const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// Holiday taken in a calendar year, and what is left of the allowance. A holiday that crosses New
// Year counts in the year it starts. Voided entries and sickness do not use holiday.
export const holidayTaken = (leave: Leave[], year: number) =>
  leave
    .filter(
      (l) =>
        l.kind === "holiday" &&
        !l.voided_at &&
        new Date(parse(l.from_date)).getFullYear() === year,
    )
    .reduce((sum, l) => sum + Number(l.days), 0);

export const holidayRemaining = (
  allowance: number,
  leave: Leave[],
  year: number,
) => Math.round((Number(allowance) - holidayTaken(leave, year)) * 10) / 10;

// Weekdays from one date to another, both included: a starting suggestion for the days of leave.
export const workingDays = (from: string, to: string): number => {
  if (!from || !to || parse(to) < parse(from)) return 0;
  let n = 0;
  for (let t = parse(from); t <= parse(to); t += DAY) {
    const day = new Date(t).getDay();
    if (day !== 0 && day !== 6) n++;
  }
  return n;
};

export type ExpiryState = "none" | "ok" | "soon" | "expired";

export const SOON_DAYS = 30;

export const daysToExpiry = (
  expires: string | null,
  today: Date,
): number | null =>
  expires ? Math.round((parse(expires) - startOfDay(today)) / DAY) : null;

export const expiryState = (
  expires: string | null,
  today: Date,
): ExpiryState => {
  const d = daysToExpiry(expires, today);
  if (d === null) return "none";
  if (d < 0) return "expired";
  return d <= SOON_DAYS ? "soon" : "ok";
};

export const expiryLabel = (expires: string | null, today: Date): string => {
  const d = daysToExpiry(expires, today);
  if (d === null) return "No expiry";
  if (d < 0) return d === -1 ? "Expired yesterday" : `Expired ${-d} days ago`;
  if (d === 0) return "Expires today";
  if (d === 1) return "Expires tomorrow";
  return `Expires in ${d} days`;
};

// Current documents of people still working here that have expired or run out soon, soonest first.
export const needingAttention = (
  documents: PersonDocument[],
  people: Person[],
  today: Date,
) => {
  const working = new Set(people.filter((p) => p.active).map((p) => p.id));
  return documents
    .filter(
      (d) =>
        d.active &&
        working.has(d.person_id) &&
        ["expired", "soon"].includes(expiryState(d.expires_on, today)),
    )
    .sort((a, b) => (a.expires_on ?? "").localeCompare(b.expires_on ?? ""));
};

const BASIS_LABEL: Record<NonNullable<Person["pay_basis"]>, string> = {
  hour: "hour",
  day: "day",
  week: "week",
  month: "month",
  year: "year",
  job: "job",
};

export const payLabel = (
  person: Pick<Person, "pay_rate_pence" | "pay_basis">,
) =>
  person.pay_rate_pence == null
    ? "Pay not recorded"
    : `£${(person.pay_rate_pence / 100).toLocaleString("en-GB", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}${person.pay_basis ? ` per ${BASIS_LABEL[person.pay_basis]}` : ""}`;
