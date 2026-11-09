import { describe, expect, it } from "vitest";

import {
  buildGraphRequest,
  facebookPageId,
  pickTargets,
  validateSchedule,
} from "./postRules";

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

describe("facebookPageId", () => {
  it("reads a Facebook Page key and nothing else", () => {
    expect(facebookPageId("facebook:page:123")).toBe("123");
    expect(facebookPageId("linkedin:page:123")).toBeNull();
    expect(facebookPageId("facebook:page:abc")).toBeNull();
  });
});

describe("pickTargets", () => {
  const row = (
    id: number,
    page: string,
    state: string,
    ext: string | null = null,
  ) => ({
    id,
    channel_key: `facebook:page:${page}`,
    state,
    external_id: ext,
  });
  const base = {
    anyDestinations: true,
    legacyPageId: null,
    legacyFbPostId: null,
    legacyStatus: "approved",
  };

  it("posts to every Facebook Page chosen and not yet sent", () => {
    const r = pickTargets({
      ...base,
      action: "publish",
      rows: [
        row(1, "10", "planned"),
        row(2, "20", "failed"),
        row(3, "30", "published", "x"),
      ],
    });
    expect(r).toMatchObject({ ok: true, legacy: false });
    expect(r.ok && r.targets.map((t) => t.pageId)).toEqual(["10", "20"]);
  });
  it("can be limited to one Page", () => {
    const r = pickTargets({
      ...base,
      action: "publish",
      onlyPage: "20",
      rows: [row(1, "10", "planned"), row(2, "20", "planned")],
    });
    expect(r.ok && r.targets.map((t) => t.pageId)).toEqual(["20"]);
  });
  it("takes down what is live, using each Page's own post id", () => {
    const r = pickTargets({
      ...base,
      action: "remove",
      rows: [
        row(1, "10", "published", "10_1"),
        row(2, "20", "scheduled", "20_2"),
        row(3, "30", "planned"),
      ],
    });
    expect(r.ok && r.targets.map((t) => t.externalId)).toEqual([
      "10_1",
      "20_2",
    ]);
  });
  it("refuses a post with destinations but none for Facebook (a LinkedIn-only post)", () => {
    const r = pickTargets({ ...base, action: "publish", rows: [] });
    expect(r).toMatchObject({ ok: false, status: 409, code: "no_page" });
  });
  it("refuses when everything is already on Facebook", () => {
    const r = pickTargets({
      ...base,
      action: "publish",
      rows: [row(1, "10", "published", "x")],
    });
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
  it("falls back to the one Page a post made before destinations names", () => {
    const r = pickTargets({
      ...base,
      anyDestinations: false,
      action: "publish",
      rows: [],
      legacyPageId: "55",
    });
    expect(r).toMatchObject({ ok: true, legacy: true });
    expect(r.ok && r.targets[0].pageId).toBe("55");
  });
  it("still refuses an old post that is already on Facebook", () => {
    const r = pickTargets({
      ...base,
      anyDestinations: false,
      action: "publish",
      rows: [],
      legacyStatus: "published",
      legacyFbPostId: "1_2",
    });
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
  it("takes an old post down by its saved Facebook id", () => {
    const r = pickTargets({
      ...base,
      anyDestinations: false,
      action: "remove",
      rows: [],
      legacyFbPostId: "1_2",
      legacyStatus: "published",
    });
    expect(r).toMatchObject({ ok: true, legacy: true });
  });
  it("has nothing to take down when nothing is on Facebook", () => {
    expect(
      pickTargets({
        ...base,
        action: "remove",
        rows: [row(1, "10", "planned")],
      }),
    ).toMatchObject({
      ok: false,
      status: 409,
    });
  });
});
