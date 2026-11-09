import { describe, expect, it } from "vitest";

import {
  canSend,
  failureNote,
  isDue,
  mayPost,
  parseChannelKey,
  textFor,
} from "./destinations.ts";

describe("parseChannelKey", () => {
  it("reads a LinkedIn Page or profile and nothing else", () => {
    expect(parseChannelKey("linkedin:page:123")).toEqual({
      platform: "linkedin",
      kind: "page",
      id: "123",
    });
    expect(parseChannelKey("linkedin:profile:7")?.kind).toBe("profile");
    for (const bad of [
      "facebook:page:1",
      "linkedin:page:abc",
      "linkedin:team:1",
      "linkedin:page:1:2",
      "linkedin:page:",
      "",
      null,
      5,
    ]) {
      expect(parseChannelKey(bad)).toBeNull();
    }
  });
});

describe("textFor", () => {
  it("uses the destination's version when it has one", () => {
    expect(
      textFor({ message: "Post" }, { text_override: "  LinkedIn  " }),
    ).toBe("LinkedIn");
    expect(textFor({ message: "Post" }, { text_override: null })).toBe("Post");
    expect(textFor({ message: "Post" }, { text_override: "   " })).toBe("Post");
  });
});

describe("mayPost", () => {
  it("lets anyone post an approved post, and an administrator a draft", () => {
    expect(mayPost("approved", { administrator: false })).toBe(true);
    expect(mayPost("published", { administrator: false })).toBe(true);
    expect(mayPost("draft", { administrator: false })).toBe(false);
    expect(mayPost("pending_review", { administrator: true })).toBe(false);
    expect(mayPost("draft", { administrator: true })).toBe(true);
  });
  it("lets the runner post only what is approved, scheduled or published", () => {
    expect(mayPost("approved", "runner")).toBe(true);
    expect(mayPost("scheduled", "runner")).toBe(true);
    expect(mayPost("draft", "runner")).toBe(false);
    expect(mayPost("failed", "runner")).toBe(false);
  });
});

describe("isDue and canSend", () => {
  const now = Date.parse("2026-11-10T10:00:00Z");
  it("is due only when scheduled and the time has come", () => {
    expect(
      isDue(
        { id: 1, state: "scheduled", scheduled_for: "2026-11-10T09:59:00Z" },
        now,
      ),
    ).toBe(true);
    expect(
      isDue(
        { id: 1, state: "scheduled", scheduled_for: "2026-11-10T10:01:00Z" },
        now,
      ),
    ).toBe(false);
    expect(
      isDue(
        { id: 1, state: "planned", scheduled_for: "2026-11-10T09:00:00Z" },
        now,
      ),
    ).toBe(false);
    expect(isDue({ id: 1, state: "scheduled", scheduled_for: null }, now)).toBe(
      false,
    );
  });
  it("sends from planned, scheduled or failed, never from published", () => {
    expect(canSend("planned")).toBe(true);
    expect(canSend("failed")).toBe(true);
    expect(canSend("published")).toBe(false);
    expect(canSend("removed")).toBe(false);
  });
});

describe("failureNote", () => {
  it("is short and on one line", () => {
    expect(failureNote("a\n\nb   c")).toBe("a b c");
    expect(failureNote("x".repeat(500))).toHaveLength(300);
  });
});
