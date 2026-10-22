// Receives Messenger webhooks for the business Page (official Messenger Platform).
// Secrets (set in the Supabase dashboard, never in the repo):
//   META_APP_SECRET        app secret, used to verify every delivery's signature
//   META_VERIFY_TOKEN      any long random string, also entered in Meta's webhook setup
//   META_PAGE_ID           optional: ignore events for any other Page
//   META_PAGE_ACCESS_TOKEN optional: lets us look up the customer's name

import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { isValidSignature, parseInboundMessages } from "./webhook.ts";

const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain" } });

const fetchProfile = async (psid: string) => {
  const token = Deno.env.get("META_PAGE_ACCESS_TOKEN");
  if (!token) return {};
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(psid)}?fields=first_name,last_name`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) {
      // Usually a token or permission problem; visible in the function logs.
      console.error(
        "Profile lookup failed",
        response.status,
        (await response.text()).slice(0, 300),
      );
      return {};
    }
    const profile = await response.json();
    return {
      first: profile.first_name as string | undefined,
      last: profile.last_name as string | undefined,
    };
  } catch {
    return {};
  }
};

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const verifyToken = Deno.env.get("META_VERIFY_TOKEN");
    if (
      verifyToken &&
      url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === verifyToken
    ) {
      return text(url.searchParams.get("hub.challenge") ?? "");
    }
    return text("Forbidden", 403);
  }

  if (req.method !== "POST") return text("Method not allowed", 405);

  const rawBody = await req.text();
  const valid = await isValidSignature(
    Deno.env.get("META_APP_SECRET") ?? "",
    rawBody,
    req.headers.get("x-hub-signature-256"),
  );
  if (!valid) return text("Invalid signature", 403);

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return text("Bad request", 400);
  }

  const messages = parseInboundMessages(
    payload,
    Deno.env.get("META_PAGE_ID") || undefined,
  );

  for (const message of messages) {
    const profile = await fetchProfile(message.psid);
    const { error } = await supabaseAdmin.rpc("record_messenger_message", {
      p_page_id: message.pageId,
      p_psid: message.psid,
      p_mid: message.mid,
      p_body: message.body,
      p_sent_at: message.sentAt,
      p_first_name: profile.first ?? null,
      p_last_name: profile.last ?? null,
      p_referral: message.referral,
    });
    if (error) {
      console.error("record_messenger_message failed", error.message);
      // A non-200 makes Meta retry the delivery later.
      return text("Error", 500);
    }
  }

  return text("EVENT_RECEIVED");
});
