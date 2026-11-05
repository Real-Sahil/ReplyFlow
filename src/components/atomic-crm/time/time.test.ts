import { describe, expect, it } from "vitest";

import {
  clashes,
  hoursLabel,
  parseHours,
  waitingByPerson,
  weekStart,
  weeklyTotals,
  type HolidayRequest,
  type TimeEntry,
} from "./time";

const entry = (over: Partial<TimeEntry>): TimeEntry => ({
  id: 1,
  staff_id: 1,
  work_date: "2026-11-03",
  hours: 8,
  note: null,
  status: "approved",
  decision_note: null,
  created_at: "2026-11-03T10:00:00Z",
  staff: { first_name: "Sam", last_name: "Jones" },
  ...over,
});

describe("parseHours", () => {
  it("reads decimals, commas, clock times and 7h30", () => {
    expect(parseHours("7.5")).toBe(7.5);
    expect(parseHours("7,5")).toBe(7.5);
    expect(parseHours("7:30")).toBe(7.5);
    expect(parseHours("7h30")).toBe(7.5);
    expect(parseHours("8")).toBe(8);
    expect(parseHours("0.25")).toBe(0.25);
  });
  it("refuses nonsense, nothing and more than a day", () => {
    expect(parseHours("")).toBeNull();
    expect(parseHours("abc")).toBeNull();
    expect(parseHours("0")).toBeNull();
    expect(parseHours("25")).toBeNull();
    expect(parseHours("7:75")).toBeNull();
    expect(parseHours("-3")).toBeNull();
  });
  it("words hours", () => {
    expect(hoursLabel(7.5)).toBe("7h 30m");
    expect(hoursLabel(8)).toBe("8h");
  });
});

describe("weeks", () => {
  it("finds the Monday of a week, including a Sunday", () => {
    expect(weekStart("2026-11-05")).toBe("2026-11-02");
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
  });
  it("adds up approved hours only, newest week first", () => {
    const totals = weeklyTotals([
      entry({ id: 1, work_date: "2026-11-02", hours: 8 }),
      entry({ id: 2, work_date: "2026-11-04", hours: 7.5 }),
      entry({ id: 3, work_date: "2026-11-04", hours: 3, status: "pending" }),
      entry({ id: 4, work_date: "2026-10-27", hours: 6, status: "rejected" }),
      entry({ id: 5, work_date: "2026-10-28", hours: 4 }),
    ]);
    expect(totals).toEqual([
      { week: "2026-11-02", hours: 15.5, entries: 2 },
      { week: "2026-10-26", hours: 4, entries: 1 },
    ]);
  });
});

describe("waitingByPerson", () => {
  it("groups what is waiting for approval by person", () => {
    const groups = waitingByPerson([
      entry({
        id: 1,
        staff_id: 2,
        status: "pending",
        hours: 4,
        staff: { first_name: "Zed", last_name: "A" },
      }),
      entry({ id: 2, staff_id: 1, status: "pending", hours: 8 }),
      entry({ id: 3, staff_id: 1, status: "pending", hours: 2 }),
      entry({ id: 4, staff_id: 1, status: "approved" }),
    ]);
    expect(groups.map((g) => [g.name, g.hours, g.entries.length])).toEqual([
      ["Sam Jones", 10, 2],
      ["Zed A", 4, 1],
    ]);
  });
});

describe("clashes", () => {
  const req = (
    id: number,
    from: string,
    to: string,
    status: HolidayRequest["status"],
    staff = "A",
  ): HolidayRequest => ({
    id,
    staff_id: id,
    from_date: from,
    to_date: to,
    days: 3,
    note: null,
    status,
    decision_note: null,
    created_at: "x",
    staff: { first_name: staff, last_name: "" },
  });
  it("lists approved holiday that overlaps a request", () => {
    const all = [
      req(1, "2026-12-01", "2026-12-05", "pending"),
      req(2, "2026-12-04", "2026-12-10", "approved", "B"),
      req(3, "2026-12-04", "2026-12-10", "pending"),
      req(4, "2027-01-01", "2027-01-03", "approved"),
    ];
    expect(clashes(all[0], all).map((c) => c.id)).toEqual([2]);
  });
});
