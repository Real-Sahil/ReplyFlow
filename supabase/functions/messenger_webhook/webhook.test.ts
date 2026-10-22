import { describe, expect, it } from "vitest";

import { isValidSignature, parseInboundMessages, signBody } from "./webhook";

const payload = (messaging: unknown[], pageId = "PAGE1") => ({
  object: "page",
  entry: [{ id: pageId, messaging }],
});

describe("isValidSignature", () => {
  it("accepts the signature Meta would send", async () => {
    const body = '{"object":"page"}';
    const sig = await signBody("secret", body);
    expect(await isValidSignature("secret", body, `sha256=${sig}`)).toBe(true);
  });

  it("rejects a wrong secret, a changed body, a missing or malformed header", async () => {
    const body = '{"object":"page"}';
    const sig = await signBody("secret", body);
    expect(await isValidSignature("other", body, `sha256=${sig}`)).toBe(false);
    expect(await isValidSignature("secret", body + " ", `sha256=${sig}`)).toBe(
      false,
    );
    expect(await isValidSignature("secret", body, null)).toBe(false);
    expect(await isValidSignature("secret", body, sig)).toBe(false);
    expect(await isValidSignature("secret", body, "sha256=abc")).toBe(false);
  });

  it("rejects everything when no app secret is configured", async () => {
    const sig = await signBody("secret", "x");
    expect(await isValidSignature("", "x", `sha256=${sig}`)).toBe(false);
  });
});

describe("parseInboundMessages", () => {
  const base = { sender: { id: "U1" }, timestamp: 1700000000000 };

  it("extracts customer text messages", () => {
    const result = parseInboundMessages(
      payload([{ ...base, message: { mid: "m1", text: "Hello" } }]),
    );
    expect(result).toEqual([
      {
        pageId: "PAGE1",
        psid: "U1",
        mid: "m1",
        body: "Hello",
        sentAt: new Date(1700000000000).toISOString(),
        referral: null,
      },
    ]);
  });

  it("ignores echoes, receipts, our own Page and empty messages", () => {
    const result = parseInboundMessages(
      payload([
        { ...base, message: { mid: "m1", text: "x", is_echo: true } },
        { ...base, delivery: { mids: ["m1"] } },
        { sender: { id: "PAGE1" }, message: { mid: "m2", text: "x" } },
        { ...base, message: { mid: "m3" } },
      ]),
    );
    expect(result).toEqual([]);
  });

  it("marks attachment-only messages", () => {
    const result = parseInboundMessages(
      payload([
        { ...base, message: { mid: "m1", attachments: [{ type: "image" }] } },
      ]),
    );
    expect(result[0].body).toBe("[attachment]");
  });

  it("only accepts the configured Page and page events", () => {
    const events = [{ ...base, message: { mid: "m1", text: "Hi" } }];
    expect(parseInboundMessages(payload(events, "OTHER"), "PAGE1")).toEqual([]);
    expect(parseInboundMessages({ object: "user", entry: [] })).toEqual([]);
    expect(parseInboundMessages(null)).toEqual([]);
  });

  it("keeps ad referral data", () => {
    const result = parseInboundMessages(
      payload([
        {
          ...base,
          message: { mid: "m1", text: "Hi" },
          referral: { ref: "ad1" },
        },
      ]),
    );
    expect(result[0].referral).toEqual({ ref: "ad1" });
  });
});
