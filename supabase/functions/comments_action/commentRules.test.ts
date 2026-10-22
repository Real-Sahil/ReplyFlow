import { describe, expect, it } from "vitest";

import { canPrivateReply, isAction } from "./commentRules";

const now = Date.parse("2026-10-22T12:00:00Z");
const daysAgo = (d: number) => new Date(now - d * 86400_000).toISOString();

describe("canPrivateReply", () => {
  it("allows one private reply within 7 days", () => {
    expect(canPrivateReply(daysAgo(1), null, now)).toBe(true);
    expect(canPrivateReply(daysAgo(6.9), null, now)).toBe(true);
  });
  it("blocks later replies, a second reply and bad dates", () => {
    expect(canPrivateReply(daysAgo(7.1), null, now)).toBe(false);
    expect(canPrivateReply(daysAgo(1), daysAgo(0.5), now)).toBe(false);
    expect(canPrivateReply("nope", null, now)).toBe(false);
  });
});

describe("isAction", () => {
  it("accepts only known actions", () => {
    expect(isAction("hide")).toBe(true);
    expect(isAction("delete")).toBe(false);
    expect(isAction(undefined)).toBe(false);
  });
});
