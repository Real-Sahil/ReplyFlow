// Pure helpers for the Messenger webhook: signature check and event parsing.
// Kept free of Deno-only APIs so they can be unit tested with vitest.

export type InboundMessage = {
  pageId: string;
  psid: string;
  mid: string;
  body: string;
  sentAt: string;
  referral: Record<string, unknown> | null;
};

const encoder = new TextEncoder();

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export const signBody = async (appSecret: string, rawBody: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody)));
};

// Meta sends "sha256=<hex>" in X-Hub-Signature-256, computed over the raw body.
export const isValidSignature = async (
  appSecret: string,
  rawBody: string,
  header: string | null,
) => {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const expected = await signBody(appSecret, rawBody);
  const received = header.slice("sha256=".length);
  if (received.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  }
  return diff === 0;
};

// Returns the customer messages in a webhook payload. Echoes of our own replies,
// delivery and read receipts, and messages for other Pages are ignored.
export const parseInboundMessages = (
  payload: unknown,
  allowedPageId?: string,
): InboundMessage[] => {
  const out: InboundMessage[] = [];
  const body = payload as { object?: string; entry?: unknown[] };
  if (body?.object !== "page" || !Array.isArray(body.entry)) return out;

  for (const entry of body.entry as Array<{
    id?: string;
    messaging?: Array<Record<string, any>>;
  }>) {
    const pageId = String(entry.id ?? "");
    if (!pageId || (allowedPageId && pageId !== allowedPageId)) continue;
    for (const event of entry.messaging ?? []) {
      const message = event.message;
      const psid = event.sender?.id;
      if (!message || message.is_echo || !psid || !message.mid) continue;
      if (String(psid) === pageId) continue;
      const text =
        typeof message.text === "string" && message.text.length > 0
          ? message.text
          : message.attachments?.length
            ? "[attachment]"
            : "";
      if (!text) continue;
      out.push({
        pageId,
        psid: String(psid),
        mid: String(message.mid),
        body: text.slice(0, 4000),
        sentAt: new Date(Number(event.timestamp) || Date.now()).toISOString(),
        referral: event.referral ?? message.referral ?? null,
      });
    }
  }
  return out;
};

export type EchoMessage = {
  pageId: string;
  psid: string;
  mid: string;
  body: string;
  sentAt: string;
};

// Messages typed by a person in the Facebook Page inbox. Echoes of messages sent
// by an app (ours included) carry an app_id and are skipped: we already stored them.
export const parseInboxEchoes = (
  payload: unknown,
  allowedPageId?: string,
): EchoMessage[] => {
  const out: EchoMessage[] = [];
  const body = payload as { object?: string; entry?: unknown[] };
  if (body?.object !== "page" || !Array.isArray(body.entry)) return out;

  for (const entry of body.entry as Array<{
    id?: string;
    // deno-lint-ignore no-explicit-any
    messaging?: Array<Record<string, any>>;
  }>) {
    const pageId = String(entry.id ?? "");
    if (!pageId || (allowedPageId && pageId !== allowedPageId)) continue;
    for (const event of entry.messaging ?? []) {
      const message = event.message;
      const psid = event.recipient?.id;
      if (!message?.is_echo || message.app_id || !psid || !message.mid)
        continue;
      const text =
        typeof message.text === "string" && message.text.length > 0
          ? message.text
          : message.attachments?.length
            ? "[attachment]"
            : "";
      if (!text) continue;
      out.push({
        pageId,
        psid: String(psid),
        mid: String(message.mid),
        body: text.slice(0, 4000),
        sentAt: new Date(Number(event.timestamp) || Date.now()).toISOString(),
      });
    }
  }
  return out;
};

export type PageComment = {
  pageId: string;
  commentId: string;
  postId: string;
  parentId: string | null;
  authorId: string;
  authorName: string | null;
  body: string;
  createdAt: string;
};

// New comments on the Page's posts, from the "feed" webhook field. Edits, removals,
// reactions and other post activity are ignored.
export const parsePageComments = (
  payload: unknown,
  allowedPageId?: string,
): PageComment[] => {
  const out: PageComment[] = [];
  const body = payload as { object?: string; entry?: unknown[] };
  if (body?.object !== "page" || !Array.isArray(body.entry)) return out;

  for (const entry of body.entry as Array<{
    id?: string;
    time?: number;
    // deno-lint-ignore no-explicit-any
    changes?: Array<Record<string, any>>;
  }>) {
    const pageId = String(entry.id ?? "");
    if (!pageId || (allowedPageId && pageId !== allowedPageId)) continue;
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (
        change.field !== "feed" ||
        value?.item !== "comment" ||
        value?.verb !== "add"
      )
        continue;
      if (!value.comment_id || !value.post_id || !value.from?.id) continue;
      const message = typeof value.message === "string" ? value.message : "";
      const text =
        message || (value.photo || value.video ? "[photo or video]" : "");
      if (!text) continue;
      const parent = String(value.parent_id ?? "");
      out.push({
        pageId,
        commentId: String(value.comment_id),
        postId: String(value.post_id),
        // A comment directly on the post has the post as its parent.
        parentId: parent && parent !== String(value.post_id) ? parent : null,
        authorId: String(value.from.id),
        authorName: value.from.name ? String(value.from.name) : null,
        body: text.slice(0, 4000),
        createdAt: new Date(
          (Number(value.created_time) ||
            Number(entry.time) ||
            Date.now() / 1000) * 1000,
        ).toISOString(),
      });
    }
  }
  return out;
};
