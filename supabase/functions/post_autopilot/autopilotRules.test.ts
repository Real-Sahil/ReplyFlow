import { describe, expect, it } from "vitest";

import {
  buildUserPrompt,
  checkDraft,
  nextFreeSlots,
  parseDraft,
  type ProductFacts,
  validSlotTimes,
  zonedToUtc,
} from "./autopilotRules";

const sofa: ProductFacts = {
  title: "Orla 3 Seater Sofa",
  collection: "Orla",
  product_type: "Sofa",
  colour: "Oatmeal",
  price_pence: 79900,
  original_price_pence: 89900,
  source_url: "https://www.mereandrow.com/products/orla",
};

describe("zonedToUtc", () => {
  it("uses GMT in winter and BST in summer for London", () => {
    expect(zonedToUtc(2026, 1, 15, 12, 0, "Europe/London").toISOString()).toBe(
      "2026-01-15T12:00:00.000Z",
    );
    expect(zonedToUtc(2026, 7, 15, 12, 0, "Europe/London").toISOString()).toBe(
      "2026-07-15T11:00:00.000Z",
    );
  });
});

describe("validSlotTimes", () => {
  it("keeps only well-formed HH:MM values, sorted and unique", () => {
    expect(
      validSlotTimes(["18:00", "12:00", "12:00", "25:00", "9:00", 4]),
    ).toEqual(["12:00", "18:00"]);
    expect(validSlotTimes("12:00")).toEqual([]);
  });
});

describe("nextFreeSlots", () => {
  const now = new Date("2026-10-22T09:00:00Z"); // 10:00 BST

  it("starts at the next slot at least an hour ahead, in UK time", () => {
    const [first, second] = nextFreeSlots({
      now,
      slotTimes: ["12:00", "18:00"],
      taken: [],
      count: 2,
      timeZone: "Europe/London",
    });
    expect(first.toISOString()).toBe("2026-10-22T11:00:00.000Z");
    expect(second.toISOString()).toBe("2026-10-22T17:00:00.000Z");
  });

  it("skips slots already taken, including nearby ones", () => {
    const slots = nextFreeSlots({
      now,
      slotTimes: ["12:00", "18:00"],
      taken: [new Date("2026-10-22T11:15:00Z")],
      count: 2,
      timeZone: "Europe/London",
    });
    expect(slots.map((s) => s.toISOString())).toEqual([
      "2026-10-22T17:00:00.000Z",
      "2026-10-23T11:00:00.000Z",
    ]);
  });

  it("never returns the same slot twice in one call", () => {
    const slots = nextFreeSlots({
      now,
      slotTimes: ["12:00"],
      taken: [],
      count: 3,
      timeZone: "Europe/London",
    });
    expect(new Set(slots.map((s) => s.getTime())).size).toBe(3);
  });

  it("returns nothing when no slot times are configured", () => {
    expect(
      nextFreeSlots({
        now,
        slotTimes: [],
        taken: [],
        count: 2,
        timeZone: "Europe/London",
      }),
    ).toEqual([]);
  });
});

describe("parseDraft", () => {
  it("reads the message from a JSON reply", () => {
    expect(parseDraft('{"message":"  Cosy evenings start here.  "}')).toBe(
      "Cosy evenings start here.",
    );
  });

  it("rejects replies that are not usable", () => {
    expect(parseDraft("not json")).toBeNull();
    expect(parseDraft('{"message":""}')).toBeNull();
    expect(parseDraft('{"text":"wrong key"}')).toBeNull();
    expect(
      parseDraft(JSON.stringify({ message: "x".repeat(2001) })),
    ).toBeNull();
  });
});

describe("buildUserPrompt", () => {
  it("passes the product facts and formats prices in pounds", () => {
    const facts = JSON.parse(buildUserPrompt(sofa));
    expect(facts).toEqual({
      name: "Orla 3 Seater Sofa",
      collection: "Orla",
      type: "Sofa",
      colour: "Oatmeal",
      price: "£799",
      was_price: "£899",
    });
  });
});

describe("checkDraft", () => {
  it("accepts a caption that quotes the product's own prices", () => {
    expect(checkDraft("The Orla is £799, down from £899.", sofa)).toEqual({
      ok: true,
    });
    expect(checkDraft("Yours for £799.", sofa)).toEqual({ ok: true });
  });

  it("rejects a price that is not the product's", () => {
    const result = checkDraft("Only £649 this week!", sofa);
    expect(result.ok).toBe(false);
  });

  it("rejects links, which are attached separately", () => {
    expect(checkDraft("See https://example.com for more", sofa).ok).toBe(false);
  });

  it("allows captions with no price at all", () => {
    const { price_pence: _p, original_price_pence: _o, ...rest } = sofa;
    expect(
      checkDraft("A sofa made to be sat in.", {
        ...rest,
        price_pence: null,
        original_price_pence: null,
      }),
    ).toEqual({ ok: true });
  });
});
