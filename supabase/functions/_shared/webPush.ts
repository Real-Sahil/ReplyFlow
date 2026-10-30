// Web Push: tells everyone in a business that a customer wrote. Nothing here may break the
// caller: every failure is logged and swallowed, because the message is already saved.

import { clip } from "./rateLimitRules.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";

const VAPID_SUBJECT = "https://replyflow-sahil.vercel.app";

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

// The signing key pair. Created once, on first use, and kept in push_config so it survives
// restarts and every function sees the same one. The private half never leaves the database.
export const getVapidKeys = async (): Promise<{
  publicKey: string;
  privateKey: string;
}> => {
  const read = async () => {
    const { data } = await supabaseAdmin
      .from("push_config")
      .select("public_key, private_key")
      .eq("id", 1)
      .maybeSingle();
    return data
      ? {
          publicKey: data.public_key as string,
          privateKey: data.private_key as string,
        }
      : null;
  };
  const existing = await read();
  if (existing) return existing;

  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const x = Uint8Array.from(
    atob(jwk.x!.replaceAll("-", "+").replaceAll("_", "/") + "=="),
    (c) => c.charCodeAt(0),
  );
  const y = Uint8Array.from(
    atob(jwk.y!.replaceAll("-", "+").replaceAll("_", "/") + "=="),
    (c) => c.charCodeAt(0),
  );
  const raw = new Uint8Array(65);
  raw[0] = 4;
  raw.set(x.slice(0, 32), 1);
  raw.set(y.slice(0, 32), 33);
  // If two requests race, the first insert wins and both then read the same pair.
  await supabaseAdmin
    .from("push_config")
    .upsert(
      { id: 1, public_key: toBase64Url(raw), private_key: jwk.d! },
      { onConflict: "id", ignoreDuplicates: true },
    );
  const saved = await read();
  if (!saved) throw new Error("Could not save the push keys");
  return saved;
};

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

export const sendPushToOrganisation = async (
  organisationId: number,
  payload: PushPayload,
) => {
  try {
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("organisation_id", organisationId);
    if (!subs?.length) return;

    // Loaded here, not at the top, so a problem with the library cannot stop the function
    // from starting.
    const { default: webpush } = await import("npm:web-push@3.6.7");
    const { publicKey, privateKey } = await getVapidKeys();
    webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);

    const body = JSON.stringify({
      title: clip(payload.title, 80),
      body: clip(payload.body, 140),
      url: payload.url,
      tag: payload.tag,
    });
    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 3600, urgency: "high" },
        ),
      ),
    );
    // A device that was removed or revoked answers 404 or 410: forget it.
    const gone = results
      .map((r, i) => ({ r, id: subs[i].id }))
      .filter(
        ({ r }) =>
          r.status === "rejected" &&
          [404, 410].includes(
            (r.reason as { statusCode?: number })?.statusCode ?? 0,
          ),
      )
      .map(({ id }) => id);
    if (gone.length) {
      await supabaseAdmin.from("push_subscriptions").delete().in("id", gone);
    }
  } catch (error) {
    console.error("Push failed", (error as Error).message);
  }
};
