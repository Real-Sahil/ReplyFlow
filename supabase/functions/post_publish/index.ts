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
import {
  buildGraphRequest,
  pickTargets,
  validateSchedule,
  type FbDestination,
  type Target,
} from "./postRules.ts";

const GRAPH = "https://graph.facebook.com/v21.0";

class MetaError extends Error {}

const graph = async (
  organisationId: number | undefined,
  token: string,
  method: "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
) => {
  if (organisationId === undefined)
    throw new MetaError("This post has no business");
  await assertMetaOpen(organisationId);
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
    await recordIfActionBlock(organisationId, json);
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
  organisationId: number | undefined,
): Promise<{ pageId: string | null; token: string | null }> => {
  if (pageIdOnPost) {
    return { pageId: pageIdOnPost, token: await getPageTokenFor(pageIdOnPost) };
  }
  if (organisationId === undefined) return { pageId: null, token: null };
  const fallback = await getDefaultPage(organisationId);
  if (fallback) return fallback;
  return { pageId: null, token: await getPageToken(organisationId) };
};

const publish = async (
  req: Request,
  sale: {
    id: number;
    administrator?: boolean;
    role?: string;
    disabled?: boolean;
    organisation_id?: number;
  } | null,
  autopilot: boolean,
) => {
  if (req.method !== "POST") {
    return createErrorResponse(405, "Method Not Allowed");
  }
  if (!autopilot && (!sale || sale.disabled || sale.role === "viewer")) {
    return createErrorResponse(403, "Not allowed to publish posts");
  }

  let input: {
    id?: number;
    action?: unknown;
    scheduled_for?: string;
    page_id?: string;
  };
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

  // People only reach posts of their own organisation; the scheduled job reaches any.
  let postQuery = supabaseAdmin
    .from("page_posts")
    .select("*")
    .eq("id", input.id);
  if (!autopilot && sale?.organisation_id !== undefined) {
    postQuery = postQuery.eq("organisation_id", sale.organisation_id);
  }
  const { data: post } = await postQuery.maybeSingle();
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
    // A post whose LinkedIn destination is waiting for its time shows as scheduled, and may still be sent to
    // Facebook; whether Facebook already has it is decided from its destinations below.
    const publishable =
      ["approved", "scheduled"].includes(post.status) ||
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

  const postOrganisation =
    post.organisation_id !== undefined
      ? Number(post.organisation_id)
      : undefined;
  if (postOrganisation === undefined) {
    return createErrorResponse(500, "This post has no business");
  }
  const onlyPage =
    typeof input.page_id === "string" && /^\d{1,25}$/.test(input.page_id)
      ? input.page_id
      : null;

  // The post's Facebook Pages are its destinations. A post made before destinations existed has none, and uses
  // the one Page it names, or the business's default Page.
  const { data: allDestinations } = await supabaseAdmin
    .from("post_destinations")
    .select("id, channel_key, state, external_id")
    .eq("post_id", post.id);
  const rows = ((allDestinations ?? []) as FbDestination[]).filter((d) =>
    d.channel_key.startsWith("facebook:"),
  );
  const picked = pickTargets({
    action: input.action as "publish" | "schedule" | "remove",
    rows,
    anyDestinations: (allDestinations ?? []).length > 0,
    legacyPageId: post.page_id ? String(post.page_id) : null,
    legacyFbPostId: post.fb_post_id ? String(post.fb_post_id) : null,
    legacyStatus: String(post.status),
    onlyPage,
  });
  if (!picked.ok) {
    return createErrorResponse(
      picked.status,
      picked.message,
      picked.code ? { code: picked.code } : {},
    );
  }

  // Each target's Page and token. A destination's Page must be one of this business's connected Pages.
  const resolved: (Target & { pageId: string; token: string })[] = [];
  for (const target of picked.targets) {
    let pageId = target.pageId;
    let token: string | null = null;
    if (pageId) {
      const { data: owned } = await supabaseAdmin
        .from("meta_pages")
        .select("page_id")
        .eq("page_id", pageId)
        .eq("organisation_id", postOrganisation)
        .maybeSingle();
      // A post made before destinations existed names its Page itself, so it is trusted as before.
      token = owned || picked.legacy ? await getPageTokenFor(pageId) : null;
    } else {
      const fallback = await choosePage(null, postOrganisation);
      pageId = fallback.pageId;
      token = fallback.token;
    }
    if (!token) {
      return createErrorResponse(503, "Facebook access is not set up yet", {
        code: "not_configured",
      });
    }
    if (!pageId) {
      return createErrorResponse(
        503,
        "The Facebook Page is not known yet. Connect Facebook first.",
        { code: "no_page" },
      );
    }
    resolved.push({ ...target, pageId, token });
  }

  // Saves how one Page went, on its destination (made now if a post from before destinations has none).
  const record = async (
    target: { pageId: string; destinationId: number | null },
    patch: Record<string, unknown>,
  ) => {
    if (target.destinationId !== null) {
      await supabaseAdmin
        .from("post_destinations")
        .update(patch)
        .eq("id", target.destinationId);
    } else {
      await supabaseAdmin.from("post_destinations").upsert(
        {
          organisation_id: postOrganisation,
          post_id: post.id,
          channel_key: `facebook:page:${target.pageId}`,
          ...patch,
        },
        { onConflict: "post_id,channel_key" },
      );
    }
  };

  try {
    if (input.action === "remove") {
      for (const t of resolved) {
        await graph(postOrganisation, t.token, "DELETE", String(t.externalId));
        await record(t, { state: "removed" });
      }
      // Back to a draft only when nothing is left out anywhere (on LinkedIn too); otherwise the post stays.
      const { data: left } = await supabaseAdmin
        .from("post_destinations")
        .select("channel_key, state, external_id")
        .eq("post_id", post.id)
        .in("state", ["published", "scheduled"]);
      const facebookLeft = (left ?? []).find((d) =>
        String(d.channel_key).startsWith("facebook:"),
      );
      if (!left?.length) {
        await supabaseAdmin
          .from("page_posts")
          .update({ status: "draft", fb_post_id: null, published_at: null })
          .eq("id", post.id);
        return ok({ status: "draft" });
      }
      await supabaseAdmin
        .from("page_posts")
        .update({ fb_post_id: facebookLeft?.external_id ?? null })
        .eq("id", post.id);
      return ok({ status: post.status });
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
          { code: "media_unavailable" },
        );
      }
      imageUrl = signed.signedUrl;
    }

    // Each Page in turn. One failing does not stop the others; a block (Facebook refusing the app for now) does.
    const results: { page_id: string; ok: boolean; error?: string }[] = [];
    let firstId: string | null = null;
    let firstError: unknown = null;
    for (const t of resolved) {
      try {
        const request = buildGraphRequest(
          t.pageId,
          { ...post, image_url: imageUrl },
          scheduleUnix,
        );
        const result = await graph(
          postOrganisation,
          t.token,
          "POST",
          request.path,
          request.body,
        );
        const fbId = (result.post_id ?? result.id) as string | undefined;
        firstId = firstId ?? fbId ?? null;
        await record(t, {
          state: scheduleUnix ? "scheduled" : "published",
          external_id: fbId ?? null,
          scheduled_for: scheduleUnix ? scheduledFor : null,
          posted_at: scheduleUnix ? null : new Date().toISOString(),
          error: null,
        });
        results.push({ page_id: t.pageId, ok: true });
      } catch (error) {
        if (error instanceof MetaBlockedError) throw error;
        firstError = firstError ?? error;
        await record(t, {
          state: "failed",
          error: (error as Error).message.slice(0, 300),
        });
        results.push({
          page_id: t.pageId,
          ok: false,
          error: (error as Error).message.slice(0, 300),
        });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    if (succeeded === 0) {
      await supabaseAdmin
        .from("page_posts")
        .update({
          status: "failed",
          error: String(
            (firstError as Error)?.message ?? "Facebook rejected the request",
          ).slice(0, 500),
        })
        .eq("id", post.id);
      throw firstError;
    }
    await supabaseAdmin
      .from("page_posts")
      .update(
        scheduleUnix
          ? {
              status: "scheduled",
              scheduled_for: scheduledFor,
              fb_post_id: firstId,
              error: null,
            }
          : {
              status: "published",
              published_at: new Date().toISOString(),
              fb_post_id: firstId,
              error: null,
            },
      )
      .eq("id", post.id);
    return ok({
      status: scheduleUnix ? "scheduled" : "published",
      fb_post_id: firstId,
      pages: results,
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
