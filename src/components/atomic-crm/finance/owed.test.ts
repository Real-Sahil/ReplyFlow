import { describe, expect, it } from "vitest";

import {
  byUrgency,
  daysLate,
  dueLabel,
  overdue,
  reminderText,
  total,
} from "./owed";

const today = new Date(2026, 10, 4); // 4 November 2026

describe("daysLate", () => {
  it("counts whole days past the due date", () => {
    expect(daysLate("2026-11-01", today)).toBe(3);
    expect(daysLate("2026-11-04", today)).toBe(0);
    expect(daysLate("2026-11-10", today)).toBe(-6);
  });
  it("is never late without a due date", () => {
    expect(daysLate(null, today)).toBe(0);
  });
});

describe("dueLabel", () => {
  it("says it in plain words", () => {
    expect(dueLabel("2026-11-03", today)).toBe("1 day late");
    expect(dueLabel("2026-10-30", today)).toBe("5 days late");
    expect(dueLabel("2026-11-04", today)).toBe("Due today");
    expect(dueLabel("2026-11-05", today)).toBe("Due tomorrow");
    expect(dueLabel("2026-11-09", today)).toBe("Due in 5 days");
    expect(dueLabel(null, today)).toBe("No due date");
  });
});

describe("totals and ordering", () => {
  const rows = [
    { owed_pence: 1000, due_date: "2026-11-10" },
    { owed_pence: 2500, due_date: "2026-10-20" },
    { owed_pence: 400, due_date: null },
  ];
  it("adds up what is owed", () => expect(total(rows)).toBe(3900));
  it("picks out what is late", () =>
    expect(overdue(rows, today).map((r) => r.owed_pence)).toEqual([2500]));
  it("puts the most late first and no-date last", () =>
    expect(byUrgency(rows).map((r) => r.owed_pence)).toEqual([
      2500, 1000, 400,
    ]));
});

describe("reminderText", () => {
  it("names the amount, the invoice and the due date, and never bank details", () => {
    const text = reminderText({
      customerName: "Anna Whitfield",
      invoiceNumber: "INV-0042",
      owedPence: 48000,
      dueDate: "2026-10-30",
      businessName: "Mere & Row",
      today,
    });
    expect(text).toContain("Hi Anna");
    expect(text).toContain("invoice INV-0042 for £480.00");
    expect(text).toContain("due on 30 October");
    expect(text).toContain("please ignore this message");
    expect(text).toMatch(/Mere & Row$/);
    expect(text.toLowerCase()).not.toContain("sort code");
  });
  it("copes with missing details and an invoice not yet due", () => {
    const text = reminderText({
      customerName: null,
      invoiceNumber: null,
      owedPence: 1250,
      dueDate: "2026-11-20",
      businessName: null,
      today,
    });
    expect(
      text.startsWith("Hi, a quick reminder that your invoice for £12.50"),
    ).toBe(true);
    expect(text).not.toContain("It was due");
  });
});
