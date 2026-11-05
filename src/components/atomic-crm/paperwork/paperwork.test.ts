import { describe, expect, it } from "vitest";

import {
  addMonths,
  assetsNeedingAttention,
  docsNeedingAttention,
  dueLabel,
  markServiced,
  totalCost,
  type Asset,
  type BusinessDocument,
} from "./paperwork";

const TODAY = new Date(2026, 10, 5); // 5 Nov 2026
const doc = (over: Partial<BusinessDocument>): BusinessDocument => ({
  id: 1,
  title: "Van insurance",
  category: "insurance",
  asset_id: null,
  provider: null,
  reference: null,
  issued_on: null,
  expires_on: null,
  note: null,
  file_path: null,
  active: true,
  ...over,
});
const asset = (over: Partial<Asset>): Asset => ({
  id: 1,
  name: "Van",
  kind: "vehicle",
  identifier: null,
  holder_person_id: null,
  purchase_date: null,
  cost_pence: null,
  last_service_date: null,
  next_service_date: null,
  service_every_months: null,
  notes: null,
  active: true,
  ...over,
});

describe("what needs attention", () => {
  it("lists current documents that are expired or expire within a month, soonest first", () => {
    const list = docsNeedingAttention(
      [
        doc({ id: 1, expires_on: "2026-12-01" }),
        doc({ id: 2, expires_on: "2026-10-30" }),
        doc({ id: 3, expires_on: "2027-03-01" }),
        doc({ id: 4, expires_on: "2026-11-10", active: false }),
        doc({ id: 5, expires_on: null }),
      ],
      TODAY,
    );
    expect(list.map((d) => d.id)).toEqual([2, 1]);
  });
  it("lists equipment whose service is due, ignoring items no longer in use", () => {
    const list = assetsNeedingAttention(
      [
        asset({ id: 1, next_service_date: "2026-11-20" }),
        asset({ id: 2, next_service_date: "2026-11-20", active: false }),
        asset({ id: 3, next_service_date: "2027-06-01" }),
      ],
      TODAY,
    );
    expect(list.map((a) => a.id)).toEqual([1]);
  });
});

describe("dates", () => {
  it("words how far off a date is", () => {
    expect(dueLabel("2026-11-02", TODAY)).toBe("Overdue by 3 days");
    expect(dueLabel("2026-11-05", TODAY)).toBe("Due today");
    expect(dueLabel("2026-11-17", TODAY)).toBe("Due in 12 days");
    expect(dueLabel(null, TODAY)).toBe("No date set");
  });
  it("adds months without running over the end of a short month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-05", 12)).toBe("2027-11-05");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });
});

describe("serviced and cost", () => {
  it("records the service and sets the next one from how often it is done", () => {
    expect(markServiced({ service_every_months: 12 }, "2026-11-05")).toEqual({
      last_service_date: "2026-11-05",
      next_service_date: "2027-11-05",
    });
    expect(
      markServiced({ service_every_months: null }, "2026-11-05")
        .next_service_date,
    ).toBeNull();
  });
  it("adds up the cost of what is in use", () => {
    expect(
      totalCost([
        asset({ cost_pence: 1000 }),
        asset({ cost_pence: 2500 }),
        asset({ cost_pence: 9999, active: false }),
        asset({ cost_pence: null }),
      ]),
    ).toBe(3500);
  });
});
