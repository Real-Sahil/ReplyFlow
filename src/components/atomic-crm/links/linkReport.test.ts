import { describe, expect, it } from "vitest";
import { summariseLinks, trackedLinkUrl } from "./linkReport";

describe("summariseLinks", () => {
  it("counts clicks per link and enquiries per campaign", () => {
    const { rows, totals } = summariseLinks(
      [
        { code: "aaaaaaaa", utm_campaign: "post-42" },
        { code: "bbbbbbbb", utm_campaign: "post-43" },
      ],
      [{ code: "aaaaaaaa" }, { code: "aaaaaaaa" }, { code: "bbbbbbbb" }],
      [
        { campaign: "post-42", amount: 1200 },
        { campaign: "post-42", amount: 800 },
        { campaign: null, amount: 500 },
      ],
    );
    expect(rows).toEqual([
      {
        code: "aaaaaaaa",
        campaign: "post-42",
        clicks: 2,
        enquiries: 2,
        value: 2000,
      },
      {
        code: "bbbbbbbb",
        campaign: "post-43",
        clicks: 1,
        enquiries: 0,
        value: 0,
      },
    ]);
    expect(totals).toEqual({ clicks: 3, enquiries: 2, value: 2000 });
  });

  it("leaves out enquiries that came without a campaign from the totals", () => {
    const { totals } = summariseLinks(
      [],
      [],
      [{ campaign: null, amount: 900 }],
    );
    expect(totals).toEqual({ clicks: 0, enquiries: 0, value: 0 });
  });
});

describe("trackedLinkUrl", () => {
  it("builds the address of the redirect function", () => {
    expect(trackedLinkUrl("https://p.supabase.co", "a1b2c3d4")).toBe(
      "https://p.supabase.co/functions/v1/go?c=a1b2c3d4",
    );
  });
});
