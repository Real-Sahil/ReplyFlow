import { describe, expect, it } from "vitest";

import { formatMoney, moneyFormatFor } from "./moneyFormat.ts";
import { claimsMessage } from "../claims_notify/message.ts";
import { formatProductMessage } from "../messenger_send/replyWindow.ts";

describe("money format", () => {
  it("is pounds unless the business chose", () => {
    expect(formatMoney(1250)).toBe("£12.50");
    expect(moneyFormatFor(undefined, undefined)).toEqual({
      currency: "GBP",
      locale: "en-GB",
    });
  });
  it("follows the business's currency and market", () => {
    expect(formatMoney(123456, moneyFormatFor("USD", "US"))).toBe("$1,234.56");
    expect(formatMoney(123456, moneyFormatFor("EUR", "IE"))).toBe("€1,234.56");
  });
  it("ignores a currency that is not a three-letter code", () => {
    expect(moneyFormatFor("pounds", "GB").currency).toBe("GBP");
  });
  it("words a claim in the business's currency", () => {
    const m = claimsMessage({
      name: "Sam Jones",
      count: 1,
      totalPence: 1250,
      flagged: 0,
      format: moneyFormatFor("USD", "US"),
    });
    expect(m.body).toBe("Sam Jones sent a claim for $12.50.");
  });
  it("words a product message in the business's currency", () => {
    const text = formatProductMessage(
      {
        title: "Candle",
        price_pence: 1200,
        original_price_pence: null,
        source_url: null,
      } as never,
      moneyFormatFor("EUR", "IE"),
    );
    expect(text).toContain("€12");
  });
});
