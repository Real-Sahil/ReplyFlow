import { describe, expect, it } from "vitest";

import {
  analyticsUrl,
  buildRows,
  campaignIdFromUrn,
  dateRangeParam,
  totals,
  validRange,
} from "./adsRules.ts";

describe("dateRangeParam", () => {
  it("writes LinkedIn's range syntax without leading zeros", () => {
    expect(dateRangeParam("2026-10-09", "2026-11-09")).toBe(
      "(start:(year:2026,month:10,day:9),end:(year:2026,month:11,day:9))",
    );
  });
});

describe("analyticsUrl", () => {
  it("leaves LinkedIn's list and range syntax alone and encodes only the urn", () => {
    const url = analyticsUrl("123", "2026-10-09", "2026-11-09");
    expect(url).toContain("accounts=List(urn%3Ali%3AsponsoredAccount%3A123)");
    expect(url).toContain("dateRange=(start:(year:2026");
    expect(url).toContain("pivot=CAMPAIGN");
  });
});

describe("buildRows", () => {
  const campaigns = [
    { id: "1", name: "Spring", status: "ACTIVE" },
    { id: "2", name: "Quiet one", status: "PAUSED" },
    { id: "3", name: "Autumn", status: "ACTIVE" },
  ];
  const analytics = {
    elements: [
      {
        pivotValues: ["urn:li:sponsoredCampaign:3"],
        impressions: 2000,
        clicks: 40,
        costInLocalCurrency: "80.00",
      },
      {
        pivotValues: ["urn:li:sponsoredCampaign:1"],
        impressions: 1000,
        clicks: 10,
        costInLocalCurrency: "20.50",
      },
    ],
  };
  const rows = buildRows(campaigns, analytics);

  it("puts the biggest spender first and keeps campaigns with no activity", () => {
    expect(rows.map((r) => r.name)).toEqual(["Autumn", "Spring", "Quiet one"]);
    expect(rows[2].spend).toBe(0);
  });
  it("works out click rate and cost per click, and leaves them empty with no data", () => {
    expect(rows[0].ctr).toBeCloseTo(0.02);
    expect(rows[0].costPerClick).toBeCloseTo(2);
    expect(rows[2].ctr).toBeNull();
    expect(rows[2].costPerClick).toBeNull();
  });
  it("copes with no analytics at all", () => {
    expect(buildRows(campaigns, null).every((r) => r.spend === 0)).toBe(true);
  });
  it("adds up the totals", () => {
    const t = totals(rows);
    expect(t.spend).toBeCloseTo(100.5);
    expect(t.clicks).toBe(50);
    expect(t.impressions).toBe(3000);
  });
});

describe("campaignIdFromUrn", () => {
  it("takes the number off the end", () => {
    expect(campaignIdFromUrn("urn:li:sponsoredCampaign:456")).toBe("456");
  });
});

describe("validRange", () => {
  it("accepts a sensible range and refuses the rest", () => {
    expect(validRange("2026-10-01", "2026-11-01")).toBe(true);
    expect(validRange("2026-11-02", "2026-11-01")).toBe(false);
    expect(validRange("2024-01-01", "2026-01-01")).toBe(false);
    expect(validRange("nope", "2026-01-01")).toBe(false);
  });
});
