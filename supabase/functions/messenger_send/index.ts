// Sends a Messenger reply to a customer from ReplyFlow (official Send API).
// Signed-in admins and agents only. Replies are limited to 24 hours after the
// customer's last message, as Messenger requires. Needs META_PAGE_ACCESS_TOKEN.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { isWithinReplyWindow, validateReplyText } from "./replyWindow.ts";

Deno.serve((req: Request) =>
  OptionsMiddleware(req, (req) =>
    AuthMiddleware(req, (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }
        const sale = await getUserSale(user!);
        if (!sale || sale.disabled || sale.role === "viewer") {
          return createErrorResponse(403, "Not allowed to send messages");
        }

        let input: { contact_id?: number; text?: unknown };
        try {
          input = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid request");
        }
        const text = validateReplyText(input.text);
        if (!text || !Number.isInteger(input.contact_id)) {
          return createErrorResponse(
            400,
            "A contact and a message of 1 to 2000 characters are required",
          );
        }

        const token = Deno.env.get("META_PAGE_ACCESS_TOKEN");
        if (!token) {
          return createErrorResponse(
            503,
            "Messenger sending is not set up yet",
            {
              code: "not_configured",
            },
          );
        }

        const { data: last } = await supabaseAdmin
          .from("messenger_messages")
          .select("psid, page_id, deal_id, sent_at")
          .eq("contact_id", input.contact_id)
          .eq("direction", "inbound")
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!last) {
          return createErrorResponse(
            404,
            "This contact has no Messenger conversation",
          );
        }
        if (!isWithinReplyWindow(last.sent_at)) {
          return createErrorResponse(
            409,
            "More than 24 hours have passed since the customer's last message, so Messenger will not deliver a reply.",
            { code: "window_closed" },
          );
        }

        let metaResponse: Response;
        try {
          metaResponse = await fetch(
            "https://graph.facebook.com/v21.0/me/messages",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                recipient: { id: last.psid },
                messaging_type: "RESPONSE",
                message: { text },
              }),
              signal: AbortSignal.timeout(8000),
            },
          );
        } catch {
          return createErrorResponse(502, "Could not reach Messenger", {
            code: "meta_unreachable",
          });
        }
        const meta = await metaResponse.json().catch(() => ({}));
        if (!metaResponse.ok || !meta.message_id) {
          console.error(
            "Send API error",
            metaResponse.status,
            meta?.error?.code,
          );
          return createErrorResponse(
            502,
            meta?.error?.message ?? "Messenger rejected the message",
            {
              code: "meta_error",
            },
          );
        }

        await supabaseAdmin.from("messenger_messages").insert({
          mid: meta.message_id,
          page_id: last.page_id,
          psid: last.psid,
          contact_id: input.contact_id,
          deal_id: last.deal_id,
          body: text,
          direction: "outbound",
          sent_by: sale.id,
        });
        // A logged reply counts as activity, which closes the "reply to enquiry" reminder.
        if (last.deal_id) {
          await supabaseAdmin.from("deal_notes").insert({
            deal_id: last.deal_id,
            text: `Replied on Messenger: ${text}`,
            sales_id: sale.id,
          });
        }

        return new Response(
          JSON.stringify({ data: { message_id: meta.message_id } }),
          {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }),
    ),
  ),
);
