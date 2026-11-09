import { describe, expect, it } from "vitest";

import {
  commentaryFor,
  MAX_LENGTH,
  organizationUrn,
  personUrn,
  postBody,
  tooLong,
} from "./linkedinPostRules.ts";

describe("commentaryFor", () => {
  it("escapes the characters LinkedIn treats as formatting", () => {
    expect(commentaryFor("Sale (50% off) @ shop #1 [today]", null)).toBe(
      "Sale \\(50% off\\) \\@ shop \\#1 \\[today\\]",
    );
  });
  it("puts the link on its own line", () => {
    expect(commentaryFor("New candles", "https://x.test/a_b")).toBe(
      "New candles\n\nhttps://x.test/a\\_b",
    );
  });
  it("leaves out an empty link", () => {
    expect(commentaryFor("Hello", "  ")).toBe("Hello");
  });
});

describe("tooLong", () => {
  it("counts the message and the link together", () => {
    expect(tooLong("a".repeat(MAX_LENGTH), null)).toBe(false);
    expect(tooLong("a".repeat(MAX_LENGTH), "https://x.test")).toBe(true);
  });
});

describe("postBody", () => {
  it("posts publicly as the person", () => {
    const body = postBody(personUrn("abc123"), "Hi", null);
    expect(body.author).toBe("urn:li:person:abc123");
    expect(body.visibility).toBe("PUBLIC");
    expect(body.lifecycleState).toBe("PUBLISHED");
  });
  it("can post as a company Page", () => {
    expect(postBody(organizationUrn("42"), "Hi", null).author).toBe(
      "urn:li:organization:42",
    );
  });
});
