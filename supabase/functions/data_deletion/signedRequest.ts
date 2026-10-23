// Reads the signed_request that Meta posts to a data deletion callback. The payload is
// JSON, base64url-encoded, and signed with HMAC-SHA256 using the app secret. Kept free of
// Deno-only APIs so it can be unit tested.

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromBase64Url = (text: string) => {
  const padded = text
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(text.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

export const signPayload = async (
  appSecret: string,
  encodedPayload: string,
) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(encodedPayload),
      ),
    ),
  );
};

export const readSignedRequest = async (
  signedRequest: string,
  appSecret: string,
): Promise<{ ok: true; userId: string } | { ok: false }> => {
  if (!appSecret || !signedRequest.includes(".")) return { ok: false };
  const [sig, payload] = signedRequest.split(".", 2);
  const expected = await signPayload(appSecret, payload);
  if (expected !== sig) return { ok: false };
  try {
    const data = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payload)),
    ) as { user_id?: unknown };
    if (typeof data.user_id !== "string" && typeof data.user_id !== "number")
      return { ok: false };
    return { ok: true, userId: String(data.user_id) };
  } catch {
    return { ok: false };
  }
};
