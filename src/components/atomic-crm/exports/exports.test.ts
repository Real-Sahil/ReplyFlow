import { describe, expect, it } from "vitest";
import { fetchAllRows, PAGE_SIZE } from "./exportPaging";
import { periodBounds } from "./periods";
import { toCsv } from "./csv";

describe("periodBounds", () => {
  const now = new Date(2026, 9, 22); // 22 October 2026, local time

  it("gives the whole calendar month, including its last day", () => {
    expect(periodBounds("this_month", {}, now)).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(periodBounds("last_month", {}, now)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("handles a chosen month, including February in a leap year", () => {
    expect(periodBounds("month", { month: "2028-02" }, now)).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
    expect(periodBounds("month", { month: "2026-02" }, now)).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  it("wraps the year correctly for last month and the last three months", () => {
    const january = new Date(2026, 0, 15);
    expect(periodBounds("last_month", {}, january)).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(periodBounds("last_3_months", {}, january)).toEqual({
      from: "2025-11-01",
      to: "2026-01-31",
    });
  });

  it("uses the custom dates as given, and no dates for all time", () => {
    expect(
      periodBounds("custom", { from: "2026-03-01", to: "2026-03-15" }, now),
    ).toEqual({ from: "2026-03-01", to: "2026-03-15" });
    expect(periodBounds("all", {}, now)).toEqual({ from: null, to: null });
  });

  it("gives no range for a month that has not been chosen", () => {
    expect(periodBounds("month", {}, now)).toEqual({ from: null, to: null });
  });
});

describe("toCsv (browser)", () => {
  it("uses the column labels and keeps the pound sign readable", () => {
    const csv = toCsv(
      [{ name: "Amy, Hobbs", amount: "£250.00" }],
      [
        { key: "name", label: "Customer" },
        { key: "amount", label: "Amount" },
      ],
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('Customer,Amount\r\n"Amy, Hobbs",£250.00\r\n');
  });

  it("neutralises spreadsheet formulas", () => {
    expect(toCsv([{ v: "=1+1" }], [{ key: "v", label: "v" }])).toContain(
      "'=1+1",
    );
  });
});

describe("fetchAllRows", () => {
  it("reads several pages until a short page ends the list", async () => {
    const total = PAGE_SIZE * 2 + 5;
    const all = Array.from({ length: total }, (_, i) => i);
    const calls: Array<[number, number]> = [];
    const rows = await fetchAllRows(async (from, to) => {
      calls.push([from, to]);
      return { data: all.slice(from, to + 1), error: null };
    });
    expect(rows).toHaveLength(total);
    expect(calls).toHaveLength(3);
  });

  it("throws the database error instead of returning a partial export", async () => {
    await expect(
      fetchAllRows(async () => ({ data: null, error: { message: "boom" } })),
    ).rejects.toThrow("boom");
  });
});
