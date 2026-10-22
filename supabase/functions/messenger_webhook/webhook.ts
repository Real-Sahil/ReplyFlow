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
