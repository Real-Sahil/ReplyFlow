import { beforeEach, describe, expect, it } from "vitest";

import { CURRENCIES, isSupportedCurrency, marketFor, MARKETS } from "./markets";
import {
  currencySymbol,
  formatMoney,
  formatMoneyPdf,
  setMoneyFormat,
} from "./moneyFormat";

describe("markets", () => {
  it("starts from the United Kingdom", () => {
    expect(marketFor(undefined).code).toBe("GB");
    expect(marketFor("ZZ").code).toBe("GB");
  });
  it("only the UK uses UK tax rules", () => {
    expect(MARKETS.filter((m) => m.ukTax).map((m) => m.code)).toEqual(["GB"]);
  });
  it("offers each market's usual currency", () => {
    for (const m of MARKETS) expect(isSupportedCurrency(m.currency)).toBe(true);
  });
  it("offers only two-decimal currencies", () => {
    for (const code of CURRENCIES) {
      const digits = new Intl.NumberFormat("en", {
        style: "currency",
        currency: code,
      }).resolvedOptions().maximumFractionDigits;
      expect(digits).toBe(2);
    }
  });
});

describe("money format", () => {
  beforeEach(() => setMoneyFormat("GBP", "GB"));
  it("writes pounds by default", () => {
    expect(formatMoney(123456)).toBe("£1,234.56");
    expect(currencySymbol()).toBe("£");
  });
  it("follows the business's currency and market", () => {
    setMoneyFormat("EUR", "DE");
    expect(formatMoney(123456).replace(/\s/g, " ")).toBe("1.234,56 €");
    setMoneyFormat("USD", "US");
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(currencySymbol()).toBe("$");
  });
  it("falls back to pounds for a currency it does not support", () => {
    setMoneyFormat("JPY", "GB");
    expect(formatMoney(100)).toBe("£1.00");
  });
  it("can drop the pence on whole amounts", () => {
    expect(formatMoney(1200, { whole: true })).toBe("£12");
    expect(formatMoney(1250, { whole: true })).toBe("£12.50");
  });
  it("writes a PDF amount the built-in font can draw", () => {
    setMoneyFormat("PLN", "GB");
    expect(formatMoneyPdf(100)).toContain("PLN");
    setMoneyFormat("EUR", "IE");
    expect(formatMoneyPdf(100)).toContain("€");
  });
});
