import { describe, expect, it } from "vitest";

import {
  isValidSignature,
  parseInboundMessages,
  parseInboxEchoes,
  parsePageComments,
  signBody,
} from "./webhook";

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

describe("parseInboxEchoes", () => {
  const echo = (message: Record<string, unknown>) =>
    payload([
      {
        sender: { id: "PAGE1" },
        recipient: { id: "U1" },
        timestamp: 1700000000000,
        message: { is_echo: true, ...message },
      },
    ]);

  it("returns replies typed in the Page inbox, keyed by the customer", () => {
    expect(parseInboxEchoes(echo({ mid: "e1", text: "Hello" }))).toEqual([
      {
        pageId: "PAGE1",
        psid: "U1",
        mid: "e1",
        body: "Hello",
        sentAt: new Date(1700000000000).toISOString(),
      },
    ]);
  });

  it("skips echoes of messages sent by an app, and customer messages", () => {
    expect(
      parseInboxEchoes(echo({ mid: "e1", text: "Hi", app_id: 123 })),
    ).toEqual([]);
    expect(
      parseInboxEchoes(
        payload([{ sender: { id: "U1" }, message: { mid: "m1", text: "Hi" } }]),
      ),
    ).toEqual([]);
  });
});

describe("parsePageComments", () => {
  const feed = (value: Record<string, unknown>) => ({
    object: "page",
    entry: [
      { id: "PAGE1", time: 1700000000, changes: [{ field: "feed", value }] },
    ],
  });
  const comment = {
    item: "comment",
    verb: "add",
    comment_id: "P_1",
    post_id: "POST1",
    parent_id: "POST1",
    from: { id: "U1", name: "Priya Shah" },
    message: "Is this in stock?",
    created_time: 1700000100,
  };

  it("extracts a new comment on a post", () => {
    expect(parsePageComments(feed(comment))).toEqual([
      {
        pageId: "PAGE1",
        commentId: "P_1",
        postId: "POST1",
        parentId: null,
        authorId: "U1",
        authorName: "Priya Shah",
        body: "Is this in stock?",
        createdAt: new Date(1700000100 * 1000).toISOString(),
      },
    ]);
  });

  it("keeps the parent of a reply to another comment", () => {
    expect(
      parsePageComments(feed({ ...comment, parent_id: "P_0" }))[0].parentId,
    ).toBe("P_0");
  });

  it("ignores edits, removals, other items and incomplete events", () => {
    expect(parsePageComments(feed({ ...comment, verb: "edited" }))).toEqual([]);
    expect(parsePageComments(feed({ ...comment, verb: "remove" }))).toEqual([]);
    expect(parsePageComments(feed({ ...comment, item: "reaction" }))).toEqual(
      [],
    );
    expect(parsePageComments(feed({ ...comment, message: "" }))).toEqual([]);
    expect(parsePageComments(feed({ ...comment, from: undefined }))).toEqual(
      [],
    );
    expect(parsePageComments(feed(comment), "OTHER")).toEqual([]);
  });
});
