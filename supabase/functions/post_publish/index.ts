// Publishes or schedules a composed post on the Facebook Page (official Pages API),
// or removes one from Facebook. Signed-in admins and agents only.
// Needs META_PAGE_ACCESS_TOKEN and a Page ID (META_PAGE_ID, or the Page that
// has messaged us).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import {
  getDefaultPage,
  getPageToken,
  getPageTokenFor,
} from "../_shared/metaToken.ts";
import {
  assertMetaOpen,
  MetaBlockedError,
  recordIfActionBlock,
} from "../_shared/metaCircuit.ts";
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
  await assertMetaOpen();
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
    await recordIfActionBlock(json);
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
  const { data: stored } = await supabaseAdmin
    .from("meta_connection")
    .select("page_id")
    .eq("id", 1)
    .maybeSingle();
  if (stored?.page_id) return stored.page_id as string;
  const { data } = await supabaseAdmin
    .from("messenger_messages")
    .select("page_id")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.page_id as string | undefined) ?? null;
};

// The scheduled autopilot job sends the key from Vault. It may only schedule posts
// an administrator has already approved, checked below.
const autopilotCall = async (req: Request) => {
  const given = req.headers.get("x-autopilot-key");
  if (!given) return false;
  const { data } = await supabaseAdmin.rpc("post_autopilot_key_ok", {
    candidate: given,
  });
  return data === true;
};

// The Page a post goes to. A post that names a Page only ever uses that Page's token, so it
// cannot end up on another Page by accident. A post without one uses the default Page on the
// list, and falls back to the connected Page if the list is empty.
const choosePage = async (
  pageIdOnPost: string | null,
): Promise<{ pageId: string | null; token: string | null }> => {
  if (pageIdOnPost) {
    return { pageId: pageIdOnPost, token: await getPageTokenFor(pageIdOnPost) };
  }
  const fallback = await getDefaultPage();
  if (fallback) return fallback;
  return { pageId: null, token: await getPageToken() };
};

const publish = async (
  req: Request,
  sale: {
    id: number;
    administrator?: boolean;
    role?: string;
    disabled?: boolean;
  } | null,
  autopilot: boolean,
) => {
  if (req.method !== "POST") {
    return createErrorResponse(405, "Method Not Allowed");
  }
  if (!autopilot && (!sale || sale.disabled || sale.role === "viewer")) {
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
    return createErrorResponse(400, "A post and a known action are required");
  }

  const { data: post } = await supabaseAdmin
    .from("page_posts")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (!post) return createErrorResponse(404, "Post not found");
  if (
    autopilot &&
    (input.action !== "schedule" || post.status !== "approved")
  ) {
    return createErrorResponse(
      403,
      "The scheduled job can only schedule approved posts",
    );
  }

  // Agents publish only approved posts. Administrators may also publish
  // their own drafts directly.
  if (input.action !== "remove") {
    const publishable =
      post.status === "approved" ||
      (sale?.administrator &&
        ["draft", "failed", "approved"].includes(post.status));
    if (!publishable) {
      return createErrorResponse(
        409,
        post.status === "pending_review"
          ? "This post is waiting for an administrator to approve it."
          : "Only approved posts can be published. Submit it for review first.",
        { code: "not_approved" },
      );
    }
  }

  const chosen = await choosePage(post.page_id ? String(post.page_id) : null);
  const token = chosen.token;
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
    const page = chosen.pageId ?? (await pageId());
    if (!page) {
      return createErrorResponse(
        503,
        "The Facebook Page is not known yet. Save the token in Facebook connection.",
        {
          code: "no_page",
        },
      );
    }

    let scheduleUnix: number | undefined;
    let scheduledFor: string | null = null;
    if (input.action === "schedule") {
      const check = validateSchedule(input.scheduled_for ?? post.scheduled_for);
      if (!check.ok) return createErrorResponse(400, check.reason);
      scheduleUnix = check.unix;
      scheduledFor = new Date(check.unix * 1000).toISOString();
    }

    // Facebook fetches the photo itself, so it gets a short-lived link to our private bucket.
    let imageUrl: string | null = post.image_url;
    if (post.media_path) {
      const { data: signed, error: signError } = await supabaseAdmin.storage
        .from("post-media")
        .createSignedUrl(post.media_path, 3600);
      if (signError || !signed?.signedUrl) {
        return createErrorResponse(
          500,
          "Could not prepare the photo for Facebook",
          {
            code: "media_unavailable",
          },
        );
      }
      imageUrl = signed.signedUrl;
    }
    const request = buildGraphRequest(
      page,
      { ...post, image_url: imageUrl },
      scheduleUnix,
    );
    let result;
    try {
      result = await graph(token, "POST", request.path, request.body);
    } catch (error) {
      // A block is not a failed post: leave the post as it was so it can be retried after clearing.
      if (!(error instanceof MetaBlockedError)) {
        await supabaseAdmin
          .from("page_posts")
          .update({
            status: "failed",
            error: (error as Error).message.slice(0, 500),
          })
          .eq("id", post.id);
      }
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
};

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (await autopilotCall(req)) return publish(req, null, true);
    return AuthMiddleware(req, (req) =>
      UserMiddleware(req, async (req, user) =>
        publish(req, await getUserSale(user!), false),
      ),
    );
  }),
);
