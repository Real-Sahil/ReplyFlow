// Date ranges for exports. Dates are YYYY-MM-DD and both ends are included. Built from
// the local calendar, so "this month" means the month the person is looking at.

export type PeriodPreset =
  | "this_month"
  | "month"
  | "last_month"
  | "last_3_months"
  | "this_year"
  | "custom"
  | "all";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lastDay = (year: number, monthIndex: number) =>
  new Date(year, monthIndex + 1, 0).getDate();

export const periodBounds = (
  preset: PeriodPreset,
  options: { month?: string; from?: string; to?: string },
  now: Date = new Date(),
): { from: string | null; to: string | null } => {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "this_month":
      return {
        from: `${y}-${pad(m + 1)}-01`,
        to: `${y}-${pad(m + 1)}-${pad(lastDay(y, m))}`,
      };
    case "month": {
      const [my, mm] = (options.month ?? "").split("-").map(Number);
      if (!my || !mm) return { from: null, to: null };
      return {
        from: `${my}-${pad(mm)}-01`,
        to: `${my}-${pad(mm)}-${pad(lastDay(my, mm - 1))}`,
      };
    }
    case "last_month": {
      const start = new Date(y, m - 1, 1);
      return {
        from: ymd(start),
        to: ymd(new Date(y, m, 0)),
      };
    }
    case "last_3_months":
      return {
        from: ymd(new Date(y, m - 2, 1)),
        to: ymd(new Date(y, m + 1, 0)),
      };
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "custom":
      return { from: options.from || null, to: options.to || null };
    case "all":
      return { from: null, to: null };
  }
};
