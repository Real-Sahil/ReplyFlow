import { describe, expect, it } from "vitest";
import { isLow, qty, valueOf, type StockLevel } from "./stockTypes";

const level = (o: Partial<StockLevel> = {}): StockLevel => ({
  id: 1,
  name: "Oak board",
  sku: null,
  unit: "m",
  reorder_level: 5,
  notes: null,
  active: true,
  on_hand: 26,
  average_cost_pence: 1466.6667,
  last_moved_on: null,
  ...o,
});

describe("stock helpers", () => {
  it("values what is held at the average price paid", () => {
    expect(valueOf(level())).toBe(38133);
    expect(valueOf(level({ on_hand: 0 }))).toBe(0);
  });
  it("flags stock at or below its reorder level, but only for active items with a level", () => {
    expect(isLow(level({ on_hand: 5 }))).toBe(true);
    expect(isLow(level({ on_hand: 6 }))).toBe(false);
    expect(isLow(level({ reorder_level: null, on_hand: 0 }))).toBe(false);
    expect(isLow(level({ active: false, on_hand: 0 }))).toBe(false);
  });
  it("shows quantities without trailing zeros", () => {
    expect(qty(20)).toBe("20");
    expect(qty(2.5)).toBe("2.5");
    expect(qty(0.125)).toBe("0.125");
  });
});
