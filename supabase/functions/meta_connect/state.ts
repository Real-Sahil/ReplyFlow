// Signed "state" for Facebook Login. Facebook sends it back unchanged, so the callback can
// prove it belongs to a connect link this app issued, and the link stops working after it
// expires. Pure functions, so they can be unit tested with vitest.

const encoder = new TextEncoder();

export const STATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const sign = async (secret: string, message: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
};

// Compares every character, so the check takes the same time whatever the mismatch.
const sameText = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

// The state names the administrator who created the link and when it stops working.
export const signState = async (
  secret: string,
  saleId: string,
  now: number,
  nonce: string,
) => {
  const body = `${saleId}.${now + STATE_TTL_MS}.${nonce}`;
  return `${body}.${await sign(secret, body)}`;
};

// Returns the administrator's sale id when the state is genuine and not expired, else null.
export const verifyState = async (
  secret: string,
  state: string,
  now: number,
): Promise<string | null> => {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [saleId, expires, nonce, signature] = parts;
  if (!/^\d+$/.test(saleId) || !/^\d+$/.test(expires)) return null;
  if (Number(expires) <= now) return null;
  const expected = await sign(secret, `${saleId}.${expires}.${nonce}`);
  return sameText(signature, expected) ? saleId : null;
};
