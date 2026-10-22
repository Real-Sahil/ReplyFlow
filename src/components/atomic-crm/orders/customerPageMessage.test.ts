import { describe, expect, it } from "vitest";
import {
  MESSENGER_TEXT_LIMIT,
  orderPageMessage,
  trackingLink,
} from "./customerPageMessage";

const link =
  "https://example.supabase.co/functions/v1/order_tracking?token=6f1c2a3e-9b7d-4c1e-8a2f-1d2e3f4a5b6c";

describe("orderPageMessage", () => {
  it("greets the customer by first name and includes the link", () => {
    const text = orderPageMessage({
      firstName: "Amy",
      reference: "MR-1042",
      link,
    });
    expect(
      text.startsWith("Hi Amy, here is the page for your order MR-1042"),
    ).toBe(true);
    expect(text).toContain(link);
  });

  it("falls back to a neutral greeting without a name", () => {
    expect(
      orderPageMessage({ firstName: "  ", reference: "MR-1", link }),
    ).toMatch(/^Hi there,/);
    expect(
      orderPageMessage({ firstName: null, reference: "MR-1", link }),
    ).toMatch(/^Hi there,/);
  });

  it("stays well inside Messenger's text limit", () => {
    expect(
      orderPageMessage({ firstName: "A".repeat(100), reference: "MR-1", link })
        .length,
    ).toBeLessThan(MESSENGER_TEXT_LIMIT);
  });
});

describe("trackingLink", () => {
  it("builds the function address with the token", () => {
    expect(trackingLink("https://p.supabase.co", "6f1c")).toBe(
      "https://p.supabase.co/functions/v1/order_tracking?token=6f1c",
    );
  });
});
