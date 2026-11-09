// Sends one post to one of its destinations now, retries a failed one, or takes a posted one down. Signed-in
// staff only (not viewers). The destination row must already exist: the editor and the Post to… dialog create
// it. Today this covers LinkedIn profiles and Pages; Facebook goes through post_publish.
//
// POST { id: <post id>, channel_key, action: "publish" | "remove" }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import {
  canSend,
  failureNote,
  mayPost,
  parseChannelKey,
  textFor,
} from "../_shared/destinations.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import {
  postToLinkedIn,
  PublishError,
  removeFromLinkedIn,
} from "../_shared/linkedinPublish.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";

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
          return createErrorResponse(403, "Not allowed to publish posts");
        }
        let input: { id?: number; channel_key?: string; action?: string };
        try {
          input = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid request");
        }
        if (
          !Number.isInteger(input.id) ||
          !parseChannelKey(input.channel_key) ||
          !["publish", "remove"].includes(String(input.action))
        ) {
          return createErrorResponse(
            400,
            "A post, a channel and a known action are required",
          );
        }
        const organisationId = Number(sale.organisation_id);

        const { data: post } = await supabaseAdmin
          .from("page_posts")
          .select(
            "id, message, link_url, status, media_path, media_type, image_url",
          )
          .eq("id", input.id)
          .eq("organisation_id", organisationId)
          .maybeSingle();
        if (!post) return createErrorResponse(404, "Post not found");

        const { data: destination } = await supabaseAdmin
          .from("post_destinations")
          .select("id, state, text_override, owner_sale_id, external_id")
          .eq("post_id", post.id)
          .eq("channel_key", input.channel_key)
          .maybeSingle();
        if (!destination) {
          return createErrorResponse(404, "That destination is not set up");
        }
        // A person can only act on their own profile, whoever they are.
        const ownerSaleId = destination.owner_sale_id
          ? Number(destination.owner_sale_id)
          : null;
        if (ownerSaleId !== null && ownerSaleId !== Number(sale.id)) {
          return createErrorResponse(
            403,
            "That is someone else's LinkedIn profile",
          );
        }

        try {
          if (input.action === "remove") {
            if (destination.state !== "published" || !destination.external_id) {
              return createErrorResponse(409, "This post is not posted there");
            }
            await removeFromLinkedIn({
              organisationId,
              channelKey: String(input.channel_key),
              ownerSaleId,
              urn: String(destination.external_id),
            });
            await supabaseAdmin
              .from("post_destinations")
              .update({ state: "removed" })
              .eq("id", destination.id);
            return ok({ state: "removed" });
          }

          if (!canSend(destination.state)) {
            return createErrorResponse(
              409,
              "This post is already posted there",
            );
          }
          if (!mayPost(post.status, { administrator: !!sale.administrator })) {
            return createErrorResponse(
              409,
              post.status === "pending_review"
                ? "This post is waiting for an administrator to approve it."
                : "Only approved posts can be posted. Submit it for review first.",
              { code: "not_approved" },
            );
          }

          try {
            const result = await postToLinkedIn({
              organisationId,
              channelKey: String(input.channel_key),
              ownerSaleId,
              post,
              text: textFor(post, destination),
            });
            await supabaseAdmin
              .from("post_destinations")
              .update({
                state: "published",
                external_id: result.urn,
                posted_at: new Date().toISOString(),
                scheduled_for: null,
                error: null,
              })
              .eq("id", destination.id);
            return ok({
              state: "published",
              urn: result.urn,
              photo: result.photo,
            });
          } catch (e) {
            // A failed attempt is kept on the destination so the list can say what went wrong and offer a retry.
            if (e instanceof PublishError) {
              await supabaseAdmin
                .from("post_destinations")
                .update({ state: "failed", error: failureNote(e.message) })
                .eq("id", destination.id);
            }
            throw e;
          }
        } catch (e) {
          if (e instanceof PublishError) {
            return createErrorResponse(
              e.status,
              e.message,
              e.code ? { code: e.code } : {},
            );
          }
          console.error("Destination call failed", (e as Error).message);
          return createErrorResponse(502, "Could not reach LinkedIn");
        }
      }),
    ),
  ),
);
