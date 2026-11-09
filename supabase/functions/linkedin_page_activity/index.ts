// What is happening on a business's connected LinkedIn company Pages: the recent posts, the comments on a
// post (and a reply to one, as the Page), and the Page's follower count and all-time post totals. It reads
// live from LinkedIn and keeps nothing. Signed-in staff of the business only; viewers cannot reply.
//
// POST { action: "posts", org_id }
// POST { action: "comments", org_id, post_urn }
// POST { action: "reply", org_id, post_urn, text, parent_comment? }
// POST { action: "analytics", org_id }
// POST { action: "best_times", org_id }: the Page's recent posts with when they went out and how they did

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import {
  commentsUrl,
  followersUrl,
  parseComments,
  parsePeople,
  parsePerPost,
  perPostStatsUrls,
  postResults,
  peopleUrl,
  personIds,
  parseFollowers,
  parsePosts,
  parseShareStats,
  postsUrl,
  replyBody,
  replyUrl,
  shareStatsUrl,
  validCommentUrn,
  validPostUrn,
  validReply,
} from "./activityRules.ts";

// LinkedIn versions its API by month and retires each version after about a year. If calls start failing
// with a "version not active" message in the logs, set LINKEDIN_API_VERSION to a newer month (YYYYMM).
const LINKEDIN_VERSION = Deno.env.get("LINKEDIN_API_VERSION") ?? "202605";

const ok = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

class LinkedInError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const call = async (
  token: string,
  url: string,
  init: { method?: string; body?: unknown } = {},
) => {
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("LinkedIn Page call failed", response.status, json?.message);
    throw new LinkedInError(
      json?.message ?? "LinkedIn refused",
      response.status,
    );
  }
  return json;
};

Deno.serve((req: Request) =>
  OptionsMiddleware(req, (req) =>
    AuthMiddleware(req, (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }
        const sale = await getUserSale(user!);
        if (!sale || sale.disabled) {
          return createErrorResponse(403, "Not allowed");
        }
        let input: {
          action?: string;
          org_id?: string;
          post_urn?: string;
          text?: string;
          parent_comment?: string;
        };
        try {
          input = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid request");
        }
        const action = String(input.action);
        if (
          !["posts", "comments", "reply", "analytics", "best_times"].includes(
            action,
          )
        ) {
          return createErrorResponse(400, "Unknown action");
        }
        const orgId = String(input.org_id ?? "");
        if (!/^\d{1,20}$/.test(orgId)) {
          return createErrorResponse(400, "A Page is required");
        }
        if (action === "reply" && sale.role === "viewer") {
          return createErrorResponse(403, "Not allowed to reply");
        }

        const organisationId = Number(sale.organisation_id);
        const { data: page } = await supabaseAdmin
          .from("linkedin_pages")
          .select("org_id")
          .eq("organisation_id", organisationId)
          .eq("org_id", orgId)
          .maybeSingle();
        if (!page) {
          return createErrorResponse(
            409,
            "That LinkedIn Page is not connected.",
            {
              code: "not_connected",
            },
          );
        }
        const { data: token } = await supabaseAdmin.rpc("linkedin_page_token", {
          p_organisation_id: organisationId,
          p_org_id: orgId,
        });
        if (!token) {
          return createErrorResponse(
            409,
            "The LinkedIn Page connection has expired. An administrator needs to connect it again.",
            { code: "expired" },
          );
        }
        const t = String(token);

        try {
          if (action === "posts") {
            return ok({ posts: parsePosts(await call(t, postsUrl(orgId))) });
          }
          if (action === "best_times") {
            const posts = parsePosts(await call(t, postsUrl(orgId)));
            const engagement: Record<string, number> = {};
            for (const url of perPostStatsUrls(
              orgId,
              posts.map((p) => p.urn),
            )) {
              // One list failing should not hide the other.
              Object.assign(
                engagement,
                await call(t, url)
                  .then(parsePerPost)
                  .catch(() => ({})),
              );
            }
            return ok({ posts: postResults(posts, engagement) });
          }
          if (action === "analytics") {
            // Followers and post totals are separate calls; one failing should not hide the other.
            const [followers, stats] = await Promise.allSettled([
              call(t, followersUrl(orgId)),
              call(t, shareStatsUrl(orgId)),
            ]);
            return ok({
              followers:
                followers.status === "fulfilled"
                  ? parseFollowers(followers.value)
                  : null,
              stats:
                stats.status === "fulfilled"
                  ? parseShareStats(stats.value)
                  : null,
            });
          }

          if (!validPostUrn(input.post_urn)) {
            return createErrorResponse(400, "A post is required");
          }
          if (action === "comments") {
            const comments = parseComments(
              await call(t, commentsUrl(input.post_urn)),
              orgId,
            );
            // Names are best effort: if LinkedIn refuses the lookup, the comments still show.
            const ids = personIds(comments);
            const people = ids.length
              ? await call(t, peopleUrl(ids))
                  .then(parsePeople)
                  .catch(() => ({}))
              : {};
            return ok({ comments, people });
          }
          // reply
          if (!validReply(input.text)) {
            return createErrorResponse(
              400,
              "Write a reply of up to 1,250 characters.",
            );
          }
          if (input.parent_comment && !validCommentUrn(input.parent_comment)) {
            return createErrorResponse(400, "That comment is not valid");
          }
          await call(t, replyUrl(input.post_urn), {
            method: "POST",
            body: replyBody(
              orgId,
              input.post_urn,
              input.text.trim(),
              input.parent_comment,
            ),
          });
          return ok({ replied: true });
        } catch (e) {
          if (e instanceof LinkedInError) {
            if (e.status === 401) {
              return createErrorResponse(
                409,
                "The LinkedIn Page connection has expired. An administrator needs to connect it again.",
                { code: "expired" },
              );
            }
            if (e.status === 403) {
              return createErrorResponse(
                403,
                "LinkedIn does not allow this account to do that on the Page.",
                { code: "no_access" },
              );
            }
          }
          return createErrorResponse(
            502,
            "LinkedIn did not return the Page's activity.",
          );
        }
      }),
    ),
  ),
);
