import { describe, expect, it } from "vitest";

import {
  nextOccurrence,
  perYearPence,
  repeatState,
  upcoming,
  type RecurringItem,
} from "./recurring";

const item = (over: Partial<RecurringItem> = {}): RecurringItem => ({
  id: 1,
  kind: "money_out",
  title: "Rent",
  frequency: "monthly",
  next_date: "2026-11-16",
  anchor_day: 16,
  end_date: null,
  category: "rent",
  amount_pence: 85000,
  vat_pence: 0,
  counterparty: null,
  payment_method: null,
  note: null,
  due_days: 14,
  active: true,
  last_generated_on: null,
  last_error: null,
  ...over,
});

describe("nextOccurrence", () => {
  it("keeps month-end days from drifting", () => {
    expect(nextOccurrence("2026-01-31", "monthly", 31)).toBe("2026-02-28");
    expect(nextOccurrence("2026-02-28", "monthly", 31)).toBe("2026-03-31");
    expect(nextOccurrence("2027-01-31", "monthly", 31)).toBe("2027-02-28");
    expect(nextOccurrence("2028-01-31", "monthly", 31)).toBe("2028-02-29");
  });
  it("moves a quarter, a year, a week and a fortnight", () => {
    expect(nextOccurrence("2026-11-15", "quarterly", 15)).toBe("2027-02-15");
    expect(nextOccurrence("2027-02-28", "yearly", 29)).toBe("2028-02-29");
    expect(nextOccurrence("2026-11-04", "weekly", 4)).toBe("2026-11-11");
    expect(nextOccurrence("2026-12-28", "fortnightly", 28)).toBe("2027-01-11");
  });
  it("rolls over a year end", () => {
    expect(nextOccurrence("2026-12-20", "monthly", 20)).toBe("2027-01-20");
  });
});

describe("upcoming", () => {
  it("lists the next dates and stops at the end date", () => {
    expect(upcoming(item({ end_date: "2027-01-20" }), 6)).toEqual([
      "2026-11-16",
      "2026-12-16",
      "2027-01-16",
    ]);
    expect(upcoming(item(), 3)).toHaveLength(3);
  });
});

describe("repeatState", () => {
  it("tells running, paused, ended and problem apart", () => {
    expect(repeatState(item(), "2026-11-05")).toBe("running");
    expect(repeatState(item({ active: false }), "2026-11-05")).toBe("paused");
    expect(repeatState(item({ end_date: "2026-10-01" }), "2026-11-05")).toBe(
      "ended",
    );
    expect(repeatState(item({ last_error: "x" }), "2026-11-05")).toBe(
      "problem",
    );
  });
});

describe("perYearPence", () => {
  it("adds a year up, with VAT for a bill", () => {
    expect(perYearPence(item())).toBe(85000 * 12);
    expect(
      perYearPence(
        item({
          kind: "bill",
          amount_pence: 4900,
          vat_pence: 980,
          frequency: "quarterly",
        }),
      ),
    ).toBe(5880 * 4);
  });
});
