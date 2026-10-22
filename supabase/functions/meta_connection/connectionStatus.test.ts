import { describe, expect, it } from "vitest";

import {
  cleanToken,
  compareRequirements,
  describeExpiry,
  REQUIRED_PERMISSIONS,
  REQUIRED_SUBSCRIPTIONS,
} from "./connectionStatus";

describe("compareRequirements", () => {
  it("marks what is granted and what is missing", () => {
    const result = compareRequirements(
      ["pages_messaging", "pages_show_list"],
      ["messages", "feed"],
    );
    expect(
      result.permissions.find((p) => p.name === "pages_messaging")?.ok,
    ).toBe(true);
    expect(
      result.permissions.find((p) => p.name === "pages_manage_posts")?.ok,
    ).toBe(false);
    expect(result.subscriptions.find((s) => s.name === "feed")?.ok).toBe(true);
    expect(
      result.subscriptions.find((s) => s.name === "message_echoes")?.ok,
    ).toBe(false);
  });
  it("treats unknown state as not ok", () => {
    const result = compareRequirements(null, null);
    expect(result.permissions).toHaveLength(REQUIRED_PERMISSIONS.length);
    expect(result.subscriptions).toHaveLength(REQUIRED_SUBSCRIPTIONS.length);
    expect(result.permissions.every((p) => !p.ok)).toBe(true);
    expect(result.subscriptions.every((s) => !s.ok)).toBe(true);
  });
});

describe("describeExpiry", () => {
  const now = Date.parse("2026-10-22T00:00:00Z");
  it("recognises tokens that never expire", () => {
    expect(describeExpiry(0, now).never).toBe(true);
    expect(describeExpiry(undefined, now).never).toBe(true);
  });
  it("counts days left", () => {
    const result = describeExpiry(
      Math.floor((now + 10.5 * 86_400_000) / 1000),
      now,
    );
    expect(result).toMatchObject({ never: false, daysLeft: 10 });
  });
});

describe("cleanToken", () => {
  const token = "EAAT" + "x".repeat(60);
  it("strips whitespace and quotes", () => {
    expect(cleanToken(`  "${token}"\n`)).toBe(token);
    expect(cleanToken(token.slice(0, 20) + "\n" + token.slice(20))).toBe(token);
  });
  it("rejects things that are not tokens", () => {
    expect(cleanToken("")).toBeNull();
    expect(cleanToken("short")).toBeNull();
    expect(
      cleanToken("has spaces and is not a token at all, really not one"),
    ).toBeNull();
    expect(cleanToken(42)).toBeNull();
  });
});
