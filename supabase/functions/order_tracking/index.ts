// The customer's order page: GET /order_tracking?token=... returns a server-rendered
// HTML page. No sign-in. The token is a random UUID stored on the order, so the link is
// the only way in. An unknown or malformed token gets the same "not found" page.

import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  renderNotFound,
  renderTrackingPage,
  type TrackingOrder,
} from "./trackingPage.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const page = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return page(renderNotFound(), 405);

  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!UUID.test(token)) return page(renderNotFound(), 404);

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "reference, product_summary, status, stage_lights, delivery_window_start, delivery_window_end, next_update_due, customer_update",
    )
    .eq("tracking_token", token)
    .maybeSingle();
  if (error) {
    console.error("Order page lookup failed", error.message);
    return page(renderNotFound(), 500);
  }
  if (!data) return page(renderNotFound(), 404);

  return page(renderTrackingPage(data as TrackingOrder));
});
