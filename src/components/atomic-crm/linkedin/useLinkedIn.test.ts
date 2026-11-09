import { describe, expect, it } from "vitest";

import {
  daysLeft,
  hasAdsScope,
  linkedInPostUrl,
  photoNote,
} from "./useLinkedIn";

describe("daysLeft", () => {
  const now = new Date("2026-11-09T12:00:00Z").getTime();
  it("counts whole days, rounding a part day up", () => {
    expect(daysLeft("2026-11-12T12:00:00Z", now)).toBe(3);
    expect(daysLeft("2026-11-12T13:00:00Z", now)).toBe(4);
  });
  it("never goes below zero", () => {
    expect(daysLeft("2026-11-01T00:00:00Z", now)).toBe(0);
  });
});

describe("linkedInPostUrl", () => {
  it("links to the post on LinkedIn, with the id made safe for an address", () => {
    expect(linkedInPostUrl("urn:li:share:123")).toBe(
      "https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A123/",
    );
  });
});

describe("hasAdsScope", () => {
  it("is true only when the ads reporting permission is there", () => {
    expect(hasAdsScope("openid,profile,w_member_social,r_ads_reporting")).toBe(
      true,
    );
    expect(hasAdsScope("openid profile w_member_social")).toBe(false);
    expect(hasAdsScope(undefined)).toBe(false);
  });
});

describe("photoNote", () => {
  it("says whether the photo went", () => {
    expect(photoNote("sent")).toBe(" with its photo");
    expect(photoNote("skipped")).toContain("text only");
    expect(photoNote("none")).toBe("");
    expect(photoNote(undefined)).toBe("");
  });
});
