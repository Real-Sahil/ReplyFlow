// Publishes or schedules a composed post on the Facebook Page (official Pages API),
// or removes one from Facebook. Signed-in admins and agents only.
// Needs META_PAGE_ACCESS_TOKEN and a Page ID (META_PAGE_ID, or the Page that
// has messaged us).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { buildGraphRequest, validateSchedule } from "./postRules.ts";

const GRAPH = "https://graph.facebook.com/v21.0";

class MetaError extends Error {}

const graph = async (
  token: string,
  method: "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
) => {
  let response: Response;
  try {
    response = await fetch(`${GRAPH}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new MetaError("Could not reach Facebook");
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Graph error", method, response.status, json?.error?.code);
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

const pageId = async () => {
  const fromEnv = Deno.env.get("META_PAGE_ID");
  if (fromEnv) return fromEnv;
  const { data } = await supabaseAdmin
    .from("messenger_messages")
    .select("page_id")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.page_id as string | undefined) ?? null;
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
          return createErrorResponse(403, "Not allowed to publish posts");
        }

        let input: { id?: number; action?: unknown; scheduled_for?: string };
        try {
          input = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid request");
        }
        if (
          !Number.isInteger(input.id) ||
          !["publish", "schedule", "remove"].includes(String(input.action))
        ) {
          return createErrorResponse(
            400,
            "A post and a known action are required",
          );
        }

        const { data: post } = await supabaseAdmin
          .from("page_posts")
          .select("*")
          .eq("id", input.id)
          .maybeSingle();
        if (!post) return createErrorResponse(404, "Post not found");

        const token = Deno.env.get("META_PAGE_ACCESS_TOKEN");
        if (!token) {
          return createErrorResponse(503, "Facebook access is not set up yet", {
            code: "not_configured",
          });
        }

        try {
          if (input.action === "remove") {
            if (!post.fb_post_id) {
              return createErrorResponse(409, "This post is not on Facebook");
            }
            await graph(token, "DELETE", post.fb_post_id);
            await supabaseAdmin
              .from("page_posts")
              .update({ status: "draft", fb_post_id: null, published_at: null })
              .eq("id", post.id);
            return ok({ status: "draft" });
          }

          if (
            post.status === "published" ||
            (post.status === "scheduled" && post.fb_post_id)
          ) {
            return createErrorResponse(409, "This post is already on Facebook");
          }
          const page = await pageId();
          if (!page) {
            return createErrorResponse(
              503,
              "The Facebook Page is not known yet. Set META_PAGE_ID.",
              {
                code: "no_page",
              },
            );
          }

          let scheduleUnix: number | undefined;
          let scheduledFor: string | null = null;
          if (input.action === "schedule") {
            const check = validateSchedule(
              input.scheduled_for ?? post.scheduled_for,
            );
            if (!check.ok) return createErrorResponse(400, check.reason);
            scheduleUnix = check.unix;
            scheduledFor = new Date(check.unix * 1000).toISOString();
          }

          const request = buildGraphRequest(page, post, scheduleUnix);
          let result;
          try {
            result = await graph(token, "POST", request.path, request.body);
          } catch (error) {
            await supabaseAdmin
              .from("page_posts")
              .update({
                status: "failed",
                error: (error as Error).message.slice(0, 500),
              })
              .eq("id", post.id);
            throw error;
          }
          const fbId = (result.post_id ?? result.id) as string | undefined;
          await supabaseAdmin
            .from("page_posts")
            .update(
              scheduleUnix
                ? {
                    status: "scheduled",
                    scheduled_for: scheduledFor,
                    fb_post_id: fbId ?? null,
                    error: null,
                  }
                : {
                    status: "published",
                    published_at: new Date().toISOString(),
                    fb_post_id: fbId ?? null,
                    error: null,
                  },
            )
            .eq("id", post.id);
          return ok({
            status: scheduleUnix ? "scheduled" : "published",
            fb_post_id: fbId,
          });
        } catch (error) {
          if (error instanceof MetaError) {
            return createErrorResponse(502, error.message, {
              code: "meta_error",
            });
          }
          throw error;
        }
      }),
    ),
  ),
);
