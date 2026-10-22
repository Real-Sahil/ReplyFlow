import { describe, expect, it } from "vitest";
import { formatPence, poundsToPence, quoteTotals } from "./quoteMath";

describe("quoteTotals", () => {
  it("takes the discount off the subtotal, with no VAT", () => {
    const totals = quoteTotals(
      [
        { description: "Sofa", quantity: 1, unit_price_pence: 120000 },
        { description: "Footstool", quantity: 2, unit_price_pence: 25000 },
      ],
      10,
    );
    expect(totals).toEqual({
      subtotal_pence: 170000,
      discount_pence: 17000,
      total_pence: 153000,
    });
  });

  it("rounds each step to the penny", () => {
    const totals = quoteTotals(
      [{ description: "Cushion", quantity: 3, unit_price_pence: 333 }],
      7.5,
    );
    // 999 * 7.5% = 74.925 -> 75; total 924
    expect(totals.discount_pence).toBe(75);
    expect(totals.total_pence).toBe(924);
  });

  it("is zero for an empty quote", () => {
    expect(quoteTotals([], 0).total_pence).toBe(0);
  });
});

describe("poundsToPence", () => {
  it("reads pounds and pence", () => {
    expect(poundsToPence("1250")).toBe(125000);
    expect(poundsToPence(" 99.5 ")).toBe(9950);
    expect(poundsToPence("0.05")).toBe(5);
  });

  it("rejects text that is not a money amount", () => {
    expect(poundsToPence("")).toBeNull();
    expect(poundsToPence("12.345")).toBeNull();
    expect(poundsToPence("-4")).toBeNull();
    expect(poundsToPence("£12")).toBeNull();
  });
});

describe("formatPence", () => {
  it("formats in pounds", () => {
    expect(formatPence(153000)).toContain("1,530");
  });
});
