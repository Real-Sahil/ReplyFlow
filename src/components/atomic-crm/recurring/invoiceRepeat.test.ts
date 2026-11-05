import { describe, expect, it } from "vitest";

import { cleanLines, lineAmountPence, linesValid } from "./invoiceRepeat";

const line = (over = {}) => ({
  description: "Retainer",
  quantity: 1,
  unit_amount_pence: 50000,
  vat_code: "S",
  ...over,
});

describe("repeat invoice lines", () => {
  it("works out a line", () => {
    expect(
      lineAmountPence(line({ quantity: "2.5", unit_amount_pence: 1999 })),
    ).toBe(4998);
  });
  it("drops emptied lines and trims", () => {
    expect(
      cleanLines([line({ description: "  Fee " }), line({ description: " " })]),
    ).toEqual([
      {
        description: "Fee",
        quantity: 1,
        unit_amount_pence: 50000,
        vat_code: "S",
      },
    ]);
  });
  it("needs a line, a quantity above zero and a price", () => {
    expect(linesValid([])).toBe(false);
    expect(linesValid([line({ quantity: 0 })])).toBe(false);
    expect(linesValid([line({ unit_amount_pence: -1 })])).toBe(false);
    expect(linesValid([line()])).toBe(true);
  });
});
