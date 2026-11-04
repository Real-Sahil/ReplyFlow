import { describe, expect, it } from "vitest";
import {
  flatRateVatOwed,
  invoiceTotals,
  isValidUkVatNumber,
  normaliseVatNumber,
  splitGross,
  vatOnNet,
} from "./vatMath";

describe("vatOnNet", () => {
  it("works out 20% and rounds half up", () => {
    expect(vatOnNet(10000, 20)).toBe(2000);
    expect(vatOnNet(1999, 20)).toBe(400); // 399.8
    expect(vatOnNet(125, 20)).toBe(25);
    expect(vatOnNet(2250, 5)).toBe(113); // 112.5 rounds up
  });
});

describe("splitGross", () => {
  it("splits a VAT-inclusive price", () => {
    expect(splitGross(12000, 20)).toEqual({ netPence: 10000, vatPence: 2000 });
    expect(splitGross(9999, 20)).toEqual({ netPence: 8333, vatPence: 1666 });
  });
  it("always adds back to the gross", () => {
    for (const gross of [1, 99, 100, 101, 12345, 99999]) {
      const { netPence, vatPence } = splitGross(gross, 20);
      expect(netPence + vatPence).toBe(gross);
    }
  });
});

describe("invoiceTotals", () => {
  it("charges no VAT when the business is not registered", () => {
    const t = invoiceTotals([{ amountPence: 153000, vatCode: "S" }], {
      vatRegistered: false,
      pricesIncludeVat: true,
    });
    expect(t).toMatchObject({
      netPence: 153000,
      vatPence: 0,
      grossPence: 153000,
    });
  });

  it("adds VAT to prices entered without it (business to business)", () => {
    const t = invoiceTotals(
      [
        { amountPence: 100000, vatCode: "S" },
        { amountPence: 20000, vatCode: "Z" },
      ],
      { vatRegistered: true, pricesIncludeVat: false },
    );
    expect(t.netPence).toBe(120000);
    expect(t.vatPence).toBe(20000);
    expect(t.grossPence).toBe(140000);
  });

  it("finds the VAT inside prices entered with it (consumer)", () => {
    const t = invoiceTotals([{ amountPence: 120000, vatCode: "S" }], {
      vatRegistered: true,
      pricesIncludeVat: true,
    });
    expect(t).toMatchObject({
      netPence: 100000,
      vatPence: 20000,
      grossPence: 120000,
    });
  });

  it("rounds once per rate on the total, not per line", () => {
    // Three lines of 33p net at 20%: 99p net, 19.8p VAT = 20p. Per line it would be 3 x 7p = 21p.
    const t = invoiceTotals(
      [
        { amountPence: 33, vatCode: "S" },
        { amountPence: 33, vatCode: "S" },
        { amountPence: 33, vatCode: "S" },
      ],
      { vatRegistered: true, pricesIncludeVat: false },
    );
    expect(t.vatPence).toBe(20);
  });

  it("treats exempt and outside scope as no VAT", () => {
    const t = invoiceTotals(
      [
        { amountPence: 5000, vatCode: "E" },
        { amountPence: 7000, vatCode: "O" },
      ],
      { vatRegistered: true, pricesIncludeVat: false },
    );
    expect(t.vatPence).toBe(0);
    expect(t.grossPence).toBe(12000);
  });
});

describe("flatRateVatOwed", () => {
  it("applies the flat percentage to VAT-inclusive turnover", () => {
    expect(flatRateVatOwed(120000, 8.5)).toBe(10200);
  });
});

describe("VAT numbers", () => {
  it("accepts the UK forms", () => {
    expect(isValidUkVatNumber("GB123456789")).toBe(true);
    expect(isValidUkVatNumber("GB123456789012")).toBe(true);
    expect(isValidUkVatNumber("GBGD123")).toBe(true);
    expect(isValidUkVatNumber("GBHA599")).toBe(true);
  });
  it("rejects the rest", () => {
    expect(isValidUkVatNumber("123456789")).toBe(false);
    expect(isValidUkVatNumber("GB12345678")).toBe(false);
    expect(isValidUkVatNumber("FR123456789")).toBe(false);
  });
  it("tidies what was typed", () => {
    expect(normaliseVatNumber("gb 123 456 789")).toBe("GB123456789");
    expect(normaliseVatNumber("123456789")).toBe("GB123456789");
  });
});
