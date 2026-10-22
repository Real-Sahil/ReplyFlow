import { describe, expect, it } from "vitest";

import {
  formatProductMessage,
  isWithinReplyWindow,
  validateReplyText,
} from "./replyWindow";

const now = Date.parse("2026-10-22T12:00:00Z");
const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();

describe("isWithinReplyWindow", () => {
  it("allows replies inside 24 hours", () => {
    expect(isWithinReplyWindow(hoursAgo(1), now)).toBe(true);
    expect(isWithinReplyWindow(hoursAgo(23.9), now)).toBe(true);
  });
  it("blocks replies after 24 hours or with no inbound message", () => {
    expect(isWithinReplyWindow(hoursAgo(24.1), now)).toBe(false);
    expect(isWithinReplyWindow(null, now)).toBe(false);
    expect(isWithinReplyWindow("not a date", now)).toBe(false);
  });
  it("rejects timestamps in the future", () => {
    expect(isWithinReplyWindow(hoursAgo(-1), now)).toBe(false);
  });
});

describe("validateReplyText", () => {
  it("trims and accepts normal text", () => {
    expect(validateReplyText("  Hello  ")).toBe("Hello");
  });
  it("rejects empty, non-string and over-long text", () => {
    expect(validateReplyText("   ")).toBeNull();
    expect(validateReplyText(42)).toBeNull();
    expect(validateReplyText("x".repeat(2001))).toBeNull();
    expect(validateReplyText("x".repeat(2000))).not.toBeNull();
  });
});

describe("formatProductMessage", () => {
  it("includes name, price with the old price, and link", () => {
    expect(
      formatProductMessage({
        title: "Marilyn Corner Sofa",
        price_pence: 49900,
        original_price_pence: 62500,
        source_url: "https://example.test/sofas",
      }),
    ).toBe("Marilyn Corner Sofa\n£499 (was £625)\nhttps://example.test/sofas");
  });
  it("leaves out what is missing", () => {
    expect(
      formatProductMessage({
        title: "Chair",
        price_pence: 29950,
        original_price_pence: null,
        source_url: null,
      }),
    ).toBe("Chair\n£299.50");
    expect(
      formatProductMessage({
        title: "Chair",
        price_pence: null,
        original_price_pence: null,
        source_url: null,
      }),
    ).toBe("Chair");
  });
});
