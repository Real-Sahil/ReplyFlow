// Actions on a Page comment from ReplyFlow (official Graph API): reply publicly,
// hide, send a private Messenger reply, mark handled, or turn it into an enquiry.
// Signed-in admins and agents only. Needs META_PAGE_ACCESS_TOKEN.

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
import { canPrivateReply, isAction } from "./commentRules.ts";

const GRAPH = "https://graph.facebook.com/v21.0";

class MetaError extends Error {}

const graph = async (
  token: string,
  path: string,
  body: Record<string, unknown>,
) => {
  await assertMetaOpen();
  let response: Response;
  try {
    response = await fetch(`${GRAPH}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new MetaError("Could not reach Facebook");
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    await recordIfActionBlock(json);
    console.error(
      "Graph error",
      path.split("/").pop(),
      response.status,
      json?.error?.code,
    );
    throw new MetaError(
      json?.error?.message ?? "Facebook rejected the request",
    );
  }
  return json;
};

const ok = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

Deno.serve((req: Request) =>
  OptionsMiddleware(req, (req) =>
    AuthMiddleware(req, (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }
        const sale = await getUserSale(user!);
        if (!sale || sale.disabled || sale.role === "viewer") {
          return createErrorResponse(403, "Not allowed to act on comments");
        }

        let input: { id?: number; action?: unknown; text?: unknown };
        try {
          input = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid request");
        }
        if (!Number.isInteger(input.id) || !isAction(input.action)) {
          return createErrorResponse(
            400,
            "A comment and a known action are required",
          );
        }
        const text = typeof input.text === "string" ? input.text.trim() : "";
        if (
          (input.action === "reply" || input.action === "private_reply") &&
          (!text || text.length > 2000)
        ) {
          return createErrorResponse(
            400,
            "A message of 1 to 2000 characters is required",
          );
        }

        const { data: comment } = await supabaseAdmin
          .from("page_comments")
          .select("*")
          .eq("id", input.id)
          .eq("organisation_id", sale.organisation_id)
          .maybeSingle();
        if (!comment) return createErrorResponse(404, "Comment not found");

        const needsFacebook = [
          "reply",
          "hide",
          "unhide",
          "private_reply",
        ].includes(input.action);
        // The comment's own Page answers, so a reply never goes out from another business's Page.
        const token =
          (await getPageTokenFor(String(comment.page_id))) ??
          (await getPageToken());
        if (needsFacebook && !token) {
          return createErrorResponse(503, "Facebook access is not set up yet", {
            code: "not_configured",
          });
        }

        try {
          switch (input.action) {
            case "reply": {
              await graph(token!, `${comment.comment_id}/comments`, {
                message: text,
              });
              await supabaseAdmin
                .from("page_comments")
                .update({
                  status: "replied",
                  reply_text: text,
                  replied_by: sale.id,
                  replied_at: new Date().toISOString(),
                })
                .eq("id", comment.id);
              return ok({ status: "replied" });
            }
            case "hide":
            case "unhide": {
              await graph(token!, comment.comment_id, {
                is_hidden: input.action === "hide",
              });
              await supabaseAdmin
                .from("page_comments")
                .update({ status: input.action === "hide" ? "hidden" : "new" })
                .eq("id", comment.id);
              return ok({ status: input.action === "hide" ? "hidden" : "new" });
            }
            case "private_reply": {
              if (
                !canPrivateReply(comment.commented_at, comment.private_reply_at)
              ) {
                return createErrorResponse(
                  409,
                  "A private reply can be sent once, within 7 days of the comment.",
                  { code: "private_reply_unavailable" },
                );
              }
              const result = await graph(
                token!,
                `${comment.page_id}/messages`,
                {
                  recipient: { comment_id: comment.comment_id },
                  message: { text },
                },
              );
              const psid =
                typeof result.recipient_id === "string"
                  ? result.recipient_id
                  : null;
              await supabaseAdmin
                .from("page_comments")
                .update({
                  private_reply_at: new Date().toISOString(),
                  status: comment.status === "new" ? "replied" : comment.status,
                  replied_by: sale.id,
                  replied_at: new Date().toISOString(),
                  reply_text: text,
                })
                .eq("id", comment.id);
              // Link the Messenger conversation to a contact and enquiry from now on.
              const { data: contactId } = await supabaseAdmin.rpc(
                "record_comment_lead",
                {
                  p_comment_row_id: comment.id,
                  p_psid: psid,
                },
              );
              if (psid && result.message_id) {
                await supabaseAdmin.from("messenger_messages").insert({
                  mid: result.message_id,
                  page_id: comment.page_id,
                  psid,
                  contact_id: contactId,
                  body: text,
                  direction: "outbound",
                  sent_by: sale.id,
                  organisation_id: comment.organisation_id,
                });
              }
              return ok({ status: "replied", contact_id: contactId });
            }
            case "handled": {
              await supabaseAdmin
                .from("page_comments")
                .update({ status: "handled" })
                .eq("id", comment.id);
              return ok({ status: "handled" });
            }
            case "to_enquiry": {
              const { data: contactId } = await supabaseAdmin.rpc(
                "record_comment_lead",
                {
                  p_comment_row_id: comment.id,
                  p_psid: null,
                },
              );
              return ok({ contact_id: contactId });
            }
          }
        } catch (error) {
          if (error instanceof MetaBlockedError) {
            return createErrorResponse(503, error.message, {
              code: "meta_blocked",
            });
          }
          if (error instanceof MetaError) {
            return createErrorResponse(502, error.message, {
              code: "meta_error",
            });
          }
          throw error;
        }
        return createErrorResponse(400, "Unknown action");
      }),
    ),
  ),
);
