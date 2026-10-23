// Tracked links: GET /go?c=CODE counts the click and sends the person on to the product
// page with campaign tags added. Targets come only from the tracked_links table, so this
// cannot be used to send people anywhere else.

import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { buildRedirect, CODE_PATTERN } from "./goRules.ts";

const plain = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return plain(405, "Method Not Allowed");

  const code = new URL(req.url).searchParams.get("c") ?? "";
  if (!CODE_PATTERN.test(code)) return plain(404, "This link is not valid.");

  const { data, error } = await supabaseAdmin
    .from("tracked_links")
    .select("target_url, utm_campaign, organisation_id")
    .eq("code", code)
    .maybeSingle();
  if (error) {
    console.error("Tracked link lookup failed", error.message);
    return plain(500, "This link cannot be opened right now.");
  }
  if (!data) return plain(404, "This link is not valid.");

  const destination = buildRedirect(
    String(data.target_url),
    String(data.utm_campaign),
  );
  if (!destination) return plain(404, "This link is not valid.");

  // A failed count must not stop the customer reaching the page.
  const { error: clickError } = await supabaseAdmin
    .from("link_clicks")
    .insert({ code, organisation_id: data.organisation_id });
  if (clickError) console.error("Click not recorded", clickError.message);

  return new Response(null, {
    status: 302,
    headers: { Location: destination, "Cache-Control": "no-store" },
  });
});
