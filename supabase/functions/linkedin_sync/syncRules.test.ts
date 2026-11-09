import { describe, expect, it } from "vitest";

import {
  dailyAnalyticsUrl,
  dailyTotals,
  expiringSoon,
  findSpikes,
  parseDaily,
} from "./syncRules.ts";

const el = (
  campaign: string,
  y: number,
  m: number,
  d: number,
  cost: string,
  imp = 100,
  clicks = 5,
) => ({
  pivotValues: [`urn:li:sponsoredCampaign:${campaign}`],
  dateRange: { start: { year: y, month: m, day: d } },
  costInLocalCurrency: cost,
  impressions: imp,
  clicks,
});

describe("dailyAnalyticsUrl", () => {
  it("asks for daily results per campaign for the account", () => {
    const url = dailyAnalyticsUrl("12", "2026-10-01", "2026-10-30");
    expect(url).toContain("timeGranularity=DAILY");
    expect(url).toContain("pivot=CAMPAIGN");
    expect(url).toContain("dateRange");
    expect(url).toContain("urn%3Ali%3AsponsoredAccount%3A12");
  });
});

describe("parseDaily and dailyTotals", () => {
  const rows = parseDaily({
    elements: [
      el("1", 2026, 10, 2, "10.5"),
      el("2", 2026, 10, 2, "4.5", 50, 1),
      el("1", 2026, 10, 3, "7"),
      { pivotValues: ["urn:li:sponsoredCampaign:9"] },
    ],
  });
  it("reads each campaign and day, and skips rows without a date", () => {
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      campaignId: "1",
      day: "2026-10-02",
      spend: 10.5,
    });
  });
  it("adds the campaigns up per day, oldest first", () => {
    const totals = dailyTotals(rows);
    expect(totals.map((t) => t.day)).toEqual(["2026-10-02", "2026-10-03"]);
    expect(totals[0].spend).toBeCloseTo(15);
    expect(totals[0].impressions).toBe(150);
  });
});

describe("findSpikes", () => {
  const history = (campaign: string, spends: number[], lastDay = 10) =>
    spends.map((spend, i) => ({
      campaignId: campaign,
      day: `2026-10-${String(lastDay - spends.length + 1 + i).padStart(2, "0")}`,
      spend,
      impressions: 0,
      clicks: 0,
    }));
  it("flags a campaign that spent double its usual yesterday", () => {
    const spikes = findSpikes(
      history("1", [10, 10, 10, 10, 10, 10, 10, 30]),
      "2026-10-10",
    );
    expect(spikes).toHaveLength(1);
    expect(spikes[0].times).toBeCloseTo(3);
  });
  it("ignores small amounts, a normal day, and a campaign with too little history", () => {
    expect(
      findSpikes(history("1", [1, 1, 1, 1, 4]), "2026-10-10"),
    ).toHaveLength(0);
    expect(
      findSpikes(history("1", [10, 10, 10, 10, 12]), "2026-10-10"),
    ).toHaveLength(0);
    expect(findSpikes(history("1", [10, 30]), "2026-10-10")).toHaveLength(0);
  });
});

describe("expiringSoon", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  it("lists connections ending within three days, not later ones or ones already gone", () => {
    const found = expiringSoon(
      [
        {
          kind: "page",
          id: "1",
          name: "A",
          expires_at: "2026-11-11T12:00:00Z",
        },
        {
          kind: "profile",
          id: "2",
          name: "B",
          expires_at: "2026-11-30T12:00:00Z",
        },
        {
          kind: "page",
          id: "3",
          name: "C",
          expires_at: "2026-11-01T12:00:00Z",
        },
      ],
      now,
    );
    expect(found).toEqual([{ kind: "page", id: "1", name: "A", days: 2 }]);
  });
});
