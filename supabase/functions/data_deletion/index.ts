// Data deletion callback for the Facebook app. Meta posts a signed request when a person
// asks to remove their data. We record the request and reply with a confirmation code and
// a status page. Staff then remove the person's messages and details and mark the request
// completed (see docs/meta-app-review/DATA_DELETION.md).
// Secrets: META_APP_SECRET (verifies the signed request).

import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { readSignedRequest } from "./signedRequest.ts";

const html = (status: number, body: string) =>
  new Response(
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Data deletion · Mere &amp; Row</title></head><body style="font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px">${body}</body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const statusUrl = (code: string) => {
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  return `${base}/functions/v1/data_deletion?code=${encodeURIComponent(code)}`;
};

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    const code = new URL(req.url).searchParams.get("code") ?? "";
    if (!/^[a-f0-9]{16}$/.test(code)) {
      return html(
        404,
        "<h1>Request not found</h1><p>Check the link you were sent.</p>",
      );
    }
    const { data } = await supabaseAdmin
      .from("data_deletion_requests")
      .select("requested_at, status, completed_at")
      .eq("code", code)
      .maybeSingle();
    if (!data)
      return html(
        404,
        "<h1>Request not found</h1><p>Check the link you were sent.</p>",
      );
    const done = data.status === "completed";
    return html(
      200,
      `<h1>Data deletion request</h1><p>Code: <strong>${escape(code)}</strong></p>` +
        `<p>Received: ${escape(new Date(data.requested_at).toLocaleDateString("en-GB"))}</p>` +
        (done
          ? `<p>Completed on ${escape(new Date(data.completed_at ?? data.requested_at).toLocaleDateString("en-GB"))}. Messages and contact details that we held for you have been removed.</p>`
          : "<p>We are removing the messages and contact details we hold for you. This takes up to 30 days.</p>"),
    );
  }

  if (req.method !== "POST") return html(405, "<p>Method not allowed.</p>");

  const form = await req.formData().catch(() => null);
  const signed = String(form?.get("signed_request") ?? "");
  const verified = await readSignedRequest(
    signed,
    Deno.env.get("META_APP_SECRET") ?? "",
  );
  if (!verified.ok) {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // The person belongs to the organisation whose contact has this Messenger id. No match
  // leaves the organisation empty for staff to check, rather than assigning Mere & Row.
  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("organisation_id")
    .eq("messenger_psid", verified.userId)
    .limit(1)
    .maybeSingle();

  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const { error } = await supabaseAdmin.from("data_deletion_requests").insert({
    code,
    meta_user_id: verified.userId,
    organisation_id: contact?.organisation_id ?? null,
  });
  if (error) {
    console.error("Deletion request not recorded", error.message);
    return new Response(JSON.stringify({ error: "Try again later" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ url: statusUrl(code), confirmation_code: code }),
    { headers: { "Content-Type": "application/json" } },
  );
});
