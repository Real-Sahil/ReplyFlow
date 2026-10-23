// Sends a Messenger reply to a customer from ReplyFlow (official Send API).
// Signed-in admins and agents only. Replies are limited to 24 hours after the
// customer's last message, as Messenger requires. Needs META_PAGE_ACCESS_TOKEN.
//
// Body: { contact_id, text? , product_id? }. With a product_id the product photo
// is sent first, then a text with its name, price and link (plus text, if given).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import { getPageToken, getPageTokenFor } from "../_shared/metaToken.ts";
import {
  assertMetaOpen,
  MetaBlockedError,
  recordIfActionBlock,
} from "../_shared/metaCircuit.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import {
  formatProductMessage,
  isWithinReplyWindow,
  validateReplyText,
} from "./replyWindow.ts";
import { nextOpening } from "./sendWindow.ts";
import {
  type AutoReplySettings,
  isOpenNow,
} from "../messenger_webhook/autoReply.ts";

type OutgoingMessage =
  | { text: string }
  | {
      attachment: {
        type: "image";
        payload: { url: string; is_reusable: boolean };
      };
    };

class SendError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

const sendToMeta = async (
  token: string,
  psid: string,
  message: OutgoingMessage,
): Promise<string> => {
  try {
    await assertMetaOpen();
  } catch (error) {
    if (error instanceof MetaBlockedError) {
      throw new SendError(503, error.message, "meta_blocked");
    }
    throw error;
  }
  let response: Response;
  try {
    response = await fetch("https://graph.facebook.com/v21.0/me/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: psid },
        messaging_type: "RESPONSE",
        message,
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new SendError(502, "Could not reach Messenger", "meta_unreachable");
  }
  const meta = await response.json().catch(() => ({}));
  if (!response.ok || !meta.message_id) {
    await recordIfActionBlock(meta);
    console.error("Send API error", response.status, meta?.error?.code);
    throw new SendError(
      502,
      meta?.error?.message ?? "Messenger rejected the message",
      "meta_error",
    );
  }
  return meta.message_id as string;
};

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

        let input: {
          contact_id?: number;
          text?: unknown;
          product_id?: number;
          automated?: unknown;
        };
        try {
          input = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid request");
        }
        const text =
          input.text === undefined || input.text === ""
            ? null
            : validateReplyText(input.text);
        const hasProduct = Number.isInteger(input.product_id);
        if (
          !Number.isInteger(input.contact_id) ||
          (input.text !== undefined && input.text !== "" && !text) ||
          (!text && !hasProduct)
        ) {
          return createErrorResponse(
            400,
            "A contact and a message of 1 to 2000 characters, or a product, are required",
          );
        }

        const token = await getPageToken();
        if (!token) {
          return createErrorResponse(
            503,
            "Messenger sending is not set up yet",
            { code: "not_configured" },
          );
        }

        // Automatic messages (follow-ups) only go out inside business hours. Staff
        // replies are not held: a person chose to send them.
        if (input.automated === true) {
          const { data: hours } = await supabaseAdmin
            .from("messenger_settings")
            .select("*")
            .eq("id", 1)
            .maybeSingle();
          if (!hours) {
            return createErrorResponse(
              503,
              "Business hours are not set up yet",
              { code: "not_configured" },
            );
          }
          const now = new Date();
          if (!isOpenNow(hours as AutoReplySettings, now)) {
            const next = nextOpening(hours as AutoReplySettings, now);
            return createErrorResponse(
              409,
              "Automatic messages only go out inside business hours.",
              {
                code: "outside_send_window",
                next_open_at: next?.toISOString() ?? null,
              },
            );
          }
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

        // Replies go out from the Page the customer messaged. An older conversation without a
        // known Page uses the connected Page, as before.
        const replyToken =
          (await getPageTokenFor(String(last.page_id))) ?? token;

        const outgoing: Array<{ message: OutgoingMessage; logged: string }> =
          [];
        if (hasProduct) {
          const { data: product } = await supabaseAdmin
            .from("products")
            .select(
              "title, price_pence, original_price_pence, source_url, image_url",
            )
            .eq("id", input.product_id)
            .maybeSingle();
          if (!product) {
            return createErrorResponse(404, "Product not found");
          }
          if (product.image_url) {
            outgoing.push({
              message: {
                attachment: {
                  type: "image",
                  payload: { url: product.image_url, is_reusable: true },
                },
              },
              logged: `[photo] ${product.title}`,
            });
          }
          const description = formatProductMessage(product);
          outgoing.push({
            message: { text: description },
            logged: description,
          });
        }
        if (text) outgoing.push({ message: { text }, logged: text });

        const sentIds: string[] = [];
        try {
          for (const item of outgoing) {
            const messageId = await sendToMeta(
              replyToken,
              last.psid,
              item.message,
            );
            sentIds.push(messageId);
            await supabaseAdmin.from("messenger_messages").insert({
              mid: messageId,
              page_id: last.page_id,
              psid: last.psid,
              contact_id: input.contact_id,
              deal_id: last.deal_id,
              body: item.logged,
              direction: "outbound",
              sent_by: sale.id,
            });
          }
        } catch (error) {
          if (error instanceof SendError) {
            return createErrorResponse(error.status, error.message, {
              code: error.code,
              sent: sentIds.length,
            });
          }
          throw error;
        }

        // A logged reply counts as activity, which closes the "reply to enquiry" reminder.
        if (last.deal_id) {
          await supabaseAdmin.from("deal_notes").insert({
            deal_id: last.deal_id,
            text: `Replied on Messenger: ${outgoing.map((o) => o.logged).join(" / ")}`.slice(
              0,
              1000,
            ),
            sales_id: sale.id,
          });
        }

        return new Response(
          JSON.stringify({ data: { message_ids: sentIds } }),
          {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }),
    ),
  ),
);
