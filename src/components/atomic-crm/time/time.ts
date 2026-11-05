// Hours and holiday from the staff sign-in. Pure helpers, so the rules can be tested. This is records only:
// it adds up hours and holiday and does not work out pay.

export type TimeStatus = "pending" | "approved" | "rejected";

export type TimeEntry = {
  id: number;
  staff_id: number;
  work_date: string;
  hours: number;
  note: string | null;
  status: TimeStatus;
  decision_note: string | null;
  created_at: string;
  staff?: { first_name: string; last_name: string } | null;
};

export type HolidayRequest = {
  id: number;
  staff_id: number;
  from_date: string;
  to_date: string;
  days: number;
  note: string | null;
  status: TimeStatus;
  decision_note: string | null;
  created_at: string;
  staff?: { first_name: string; last_name: string } | null;
};

export const STATUS_LABEL: Record<TimeStatus, string> = {
  pending: "Waiting",
  approved: "Approved",
  rejected: "Not approved",
};

// "7.5", "7,5", "7:30" or "7h30" -> 7.5. Quarter hours and up to 24 hours; anything else -> null.
export const parseHours = (text: string): number | null => {
  const t = text.trim().toLowerCase().replace(",", ".");
  let hours: number;
  const clock = t.match(/^(\d{1,2})(?::|h)(\d{1,2})$/);
  if (clock) {
    const minutes = Number(clock[2]);
    if (minutes >= 60) return null;
    hours = Number(clock[1]) + minutes / 60;
  } else if (/^\d{1,2}(\.\d{1,2})?$/.test(t)) {
    hours = Number(t);
  } else {
    return null;
  }
  const rounded = Math.round(hours * 100) / 100;
  return rounded >= 0.25 && rounded <= 24 ? rounded : null;
};

export const hoursLabel = (hours: number) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
};

// The Monday of the week a date falls in, as YYYY-MM-DD.
export const weekStart = (iso: string): string => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
};

export type WeekTotal = { week: string; hours: number; entries: number };

// Approved hours per week, newest first. Only approved hours count.
export const weeklyTotals = (entries: TimeEntry[]): WeekTotal[] => {
  const map = new Map<string, WeekTotal>();
  for (const e of entries) {
    if (e.status !== "approved") continue;
    const week = weekStart(e.work_date);
    const row = map.get(week) ?? { week, hours: 0, entries: 0 };
    row.hours += Number(e.hours);
    row.entries += 1;
    map.set(week, row);
  }
  return [...map.values()].sort((a, b) => b.week.localeCompare(a.week));
};

export const staffName = (r: {
  staff?: { first_name: string; last_name: string } | null;
}) => (r.staff ? `${r.staff.first_name} ${r.staff.last_name}`.trim() : "");

// Waiting entries grouped by person, so an administrator can approve a person's week in one go.
export const waitingByPerson = (entries: TimeEntry[]) => {
  const groups = new Map<
    number,
    { staffId: number; name: string; entries: TimeEntry[]; hours: number }
  >();
  for (const e of entries) {
    if (e.status !== "pending") continue;
    const g = groups.get(e.staff_id) ?? {
      staffId: e.staff_id,
      name: staffName(e),
      entries: [],
      hours: 0,
    };
    g.entries.push(e);
    g.hours += Number(e.hours);
    groups.set(e.staff_id, g);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
};

// Whether two holiday requests from the same person overlap, so the administrator is warned.
export const overlaps = (
  a: Pick<HolidayRequest, "from_date" | "to_date">,
  b: Pick<HolidayRequest, "from_date" | "to_date">,
) => a.from_date <= b.to_date && b.from_date <= a.to_date;

// People already booked off on any day of a request (approved only), for the administrator's decision.
export const clashes = (request: HolidayRequest, all: HolidayRequest[]) =>
  all.filter(
    (o) =>
      o.id !== request.id && o.status === "approved" && overlaps(request, o),
  );
