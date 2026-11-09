// Posts a ReplyFlow post to the signed-in person's own LinkedIn profile, or takes it down again.
// It posts as the person who presses the button, using the LinkedIn account they connected, and
// follows the same approval rule as Facebook: agents post only approved posts. Text and a link only
// for now; photos are not sent to LinkedIn yet.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { postBody, tooLong } from "./postRules.ts";

const API = "https://api.linkedin.com/rest/posts";
// LinkedIn versions its API by month and retires each version after about a year. If posts start failing
// with a "version not active" message in the logs, set LINKEDIN_API_VERSION to a newer month (YYYYMM).
const LINKEDIN_VERSION = Deno.env.get("LINKEDIN_API_VERSION") ?? "202605";

const ok = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "LinkedIn-Version": LINKEDIN_VERSION,
  "X-Restli-Protocol-Version": "2.0.0",
  "Content-Type": "application/json",
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
        let input: { id?: number; action?: string };
        try {
          input = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid request");
        }
        if (
          !Number.isInteger(input.id) ||
          !["publish", "remove"].includes(String(input.action))
        ) {
          return createErrorResponse(
            400,
            "A post and a known action are required",
          );
        }
        const organisationId = Number(sale.organisation_id);

        const { data: post } = await supabaseAdmin
          .from("page_posts")
          .select("id, message, link_url, status")
          .eq("id", input.id)
          .eq("organisation_id", organisationId)
          .maybeSingle();
        if (!post) return createErrorResponse(404, "Post not found");

        const { data: member } = await supabaseAdmin
          .from("linkedin_members")
          .select("member_id, expires_at")
          .eq("organisation_id", organisationId)
          .eq("sale_id", sale.id)
          .maybeSingle();
        if (!member) {
          return createErrorResponse(
            409,
            "Connect your LinkedIn account first.",
            {
              code: "not_connected",
            },
          );
        }
        const { data: token } = await supabaseAdmin.rpc(
          "linkedin_member_token",
          {
            p_organisation_id: organisationId,
            p_sale_id: Number(sale.id),
          },
        );
        if (!token) {
          return createErrorResponse(
            409,
            "Your LinkedIn connection has expired. Connect again.",
            { code: "expired" },
          );
        }

        const { data: sent } = await supabaseAdmin
          .from("linkedin_posts")
          .select("id, urn, removed_at")
          .eq("post_id", post.id)
          .eq("sale_id", sale.id)
          .maybeSingle();

        try {
          if (input.action === "remove") {
            if (!sent || sent.removed_at) {
              return createErrorResponse(
                409,
                "This post is not on your LinkedIn",
              );
            }
            const response = await fetch(
              `${API}/${encodeURIComponent(sent.urn)}`,
              {
                method: "DELETE",
                headers: headers(String(token)),
                signal: AbortSignal.timeout(15000),
              },
            );
            // 404 means it is already gone, which is the outcome we want.
            if (!response.ok && response.status !== 404) {
              console.error("LinkedIn delete failed", response.status);
              return createErrorResponse(
                502,
                "LinkedIn did not remove the post",
              );
            }
            await supabaseAdmin
              .from("linkedin_posts")
              .update({ removed_at: new Date().toISOString() })
              .eq("id", sent.id);
            return ok({ removed: true });
          }

          if (sent && !sent.removed_at) {
            return createErrorResponse(
              409,
              "This post is already on your LinkedIn",
            );
          }
          // The same rule as Facebook: an agent posts only what an administrator approved. A post
          // that is already live on Facebook has been through that already.
          const allowed =
            post.status === "approved" ||
            post.status === "published" ||
            (sale.administrator &&
              ["draft", "failed", "approved"].includes(post.status));
          if (!allowed) {
            return createErrorResponse(
              409,
              post.status === "pending_review"
                ? "This post is waiting for an administrator to approve it."
                : "Only approved posts can be posted. Submit it for review first.",
              { code: "not_approved" },
            );
          }
          if (tooLong(post.message, post.link_url)) {
            return createErrorResponse(
              422,
              "This post is too long for LinkedIn (3,000 characters at most).",
            );
          }

          const response = await fetch(API, {
            method: "POST",
            headers: headers(String(token)),
            body: JSON.stringify(
              postBody(member.member_id, post.message, post.link_url),
            ),
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) {
            const detail = await response.json().catch(() => ({}));
            console.error(
              "LinkedIn post failed",
              response.status,
              detail?.code,
            );
            return createErrorResponse(
              response.status === 401 ? 409 : 502,
              response.status === 401
                ? "Your LinkedIn connection has expired. Connect again."
                : "LinkedIn did not accept the post.",
              response.status === 401 ? { code: "expired" } : {},
            );
          }
          const urn = response.headers.get("x-restli-id");
          if (!urn) {
            return createErrorResponse(
              502,
              "LinkedIn did not confirm the post",
            );
          }
          await supabaseAdmin.from("linkedin_posts").upsert(
            {
              organisation_id: organisationId,
              post_id: post.id,
              sale_id: sale.id,
              urn,
              posted_at: new Date().toISOString(),
              removed_at: null,
            },
            { onConflict: "post_id,sale_id" },
          );
          return ok({ urn });
        } catch (e) {
          console.error("LinkedIn call failed", (e as Error).message);
          return createErrorResponse(502, "Could not reach LinkedIn");
        }
      }),
    ),
  ),
);
