import { describe, expect, it } from "vitest";
import {
  clientAddress,
  clip,
  DEFAULT_LIMIT,
  functionName,
  limitFor,
} from "./rateLimitRules.ts";

describe("functionName", () => {
  it("reads the name after /functions/v1", () => {
    expect(functionName("/functions/v1/messenger_send")).toBe("messenger_send");
    expect(functionName("/functions/v1/meta_connect/callback")).toBe(
      "meta_connect",
    );
  });

  it("reads the first segment when the prefix is already removed", () => {
    expect(functionName("/post_publish")).toBe("post_publish");
    expect(functionName("/meta_pages/")).toBe("meta_pages");
  });

  it("falls back to unknown for an empty path", () => {
    expect(functionName("/")).toBe("unknown");
  });
});

describe("limitFor", () => {
  it("uses the named limit when there is one", () => {
    expect(limitFor("update_password")).toEqual({
      limit: 5,
      windowSeconds: 60,
    });
  });

  it("uses the default otherwise", () => {
    expect(limitFor("something_new")).toEqual(DEFAULT_LIMIT);
  });
});

describe("clientAddress", () => {
  it("prefers cf-connecting-ip", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.1, 10.0.0.1",
    });
    expect(clientAddress(headers)).toBe("203.0.113.7");
  });

  it("takes the first x-forwarded-for address", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.1, 10.0.0.1",
    });
    expect(clientAddress(headers)).toBe("198.51.100.1");
  });

  it("says unknown when no address is sent", () => {
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});

describe("clip", () => {
  it("leaves short text alone", () => {
    expect(clip("short", 10)).toBe("short");
  });

  it("cuts long text and marks the cut", () => {
    expect(clip("abcdefghij", 5)).toBe("abcd…");
  });

  it("reads an Error's message", () => {
    expect(clip(new Error("boom"), 20)).toBe("boom");
  });

  it("stringifies objects", () => {
    expect(clip({ a: 1 }, 20)).toBe('{"a":1}');
  });
});
