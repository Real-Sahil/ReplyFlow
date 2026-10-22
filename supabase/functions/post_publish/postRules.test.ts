import { describe, expect, it } from "vitest";

import { buildGraphRequest, validateSchedule } from "./postRules";

const now = Date.parse("2026-10-22T12:00:00Z");
const inMinutes = (m: number) => new Date(now + m * 60_000).toISOString();

describe("validateSchedule", () => {
  it("accepts 10 minutes to 30 days ahead and returns a unix time", () => {
    const result = validateSchedule(inMinutes(11), now);
    expect(result).toEqual({
      ok: true,
      unix: Math.floor((now + 11 * 60_000) / 1000),
    });
    expect(validateSchedule(inMinutes(60 * 24 * 29), now).ok).toBe(true);
  });
  it("rejects too soon, too far, past and invalid times", () => {
    expect(validateSchedule(inMinutes(5), now).ok).toBe(false);
    expect(validateSchedule(inMinutes(-60), now).ok).toBe(false);
    expect(validateSchedule(inMinutes(60 * 24 * 31), now).ok).toBe(false);
    expect(validateSchedule("tomorrow-ish", now).ok).toBe(false);
    expect(validateSchedule(null, now).ok).toBe(false);
  });
});

describe("buildGraphRequest", () => {
  it("posts text with an attached link to the feed", () => {
    expect(
      buildGraphRequest("P1", {
        message: "Hello",
        image_url: null,
        link_url: "https://x.test",
      }),
    ).toEqual({
      path: "P1/feed",
      body: { message: "Hello", link: "https://x.test" },
    });
  });
  it("posts a photo with the link in the caption, once", () => {
    const a = buildGraphRequest("P1", {
      message: "Sofa",
      image_url: "https://img.test/a.webp",
      link_url: "https://x.test",
    });
    expect(a).toEqual({
      path: "P1/photos",
      body: { url: "https://img.test/a.webp", caption: "Sofa\nhttps://x.test" },
    });
    const b = buildGraphRequest("P1", {
      message: "Sofa https://x.test",
      image_url: "https://img.test/a.webp",
      link_url: "https://x.test",
    });
    expect(b.body).toMatchObject({ caption: "Sofa https://x.test" });
  });
  it("adds Facebook's scheduling fields when scheduled", () => {
    expect(
      buildGraphRequest(
        "P1",
        { message: "Hi", image_url: null, link_url: null },
        1800000000,
      ).body,
    ).toEqual({
      message: "Hi",
      published: false,
      scheduled_publish_time: 1800000000,
    });
  });
});
