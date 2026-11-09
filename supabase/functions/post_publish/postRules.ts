// Facebook schedules posts between 10 minutes and 30 days ahead.
export const MIN_SCHEDULE_MS = 10 * 60 * 1000;
export const MAX_SCHEDULE_MS = 30 * 24 * 60 * 60 * 1000;

export const validateSchedule = (
  scheduledFor: string | null | undefined,
  now: number = Date.now(),
): { ok: true; unix: number } | { ok: false; reason: string } => {
  const at = Date.parse(scheduledFor ?? "");
  if (Number.isNaN(at)) return { ok: false, reason: "Choose a date and time." };
  // A little slack so a post set for "in 10 minutes" is not rejected by seconds.
  if (at - now < MIN_SCHEDULE_MS - 30_000) {
    return {
      ok: false,
      reason: "Facebook needs scheduled posts to be at least 10 minutes ahead.",
    };
  }
  if (at - now > MAX_SCHEDULE_MS) {
    return {
      ok: false,
      reason: "Facebook only schedules up to 30 days ahead.",
    };
  }
  return { ok: true, unix: Math.floor(at / 1000) };
};

export type PostForGraph = {
  message: string;
  image_url: string | null;
  link_url: string | null;
};

// A photo post carries its link inside the caption; a plain post attaches the link.
export const buildGraphRequest = (
  pageId: string,
  post: PostForGraph,
  scheduleUnix?: number,
) => {
  const schedule = scheduleUnix
    ? { published: false, scheduled_publish_time: scheduleUnix }
    : {};
  if (post.image_url) {
    const caption =
      post.link_url && !post.message.includes(post.link_url)
        ? `${post.message}\n${post.link_url}`
        : post.message;
    return {
      path: `${pageId}/photos`,
      body: { url: post.image_url, caption, ...schedule },
    };
  }
  return {
    path: `${pageId}/feed`,
    body: {
      message: post.message,
      ...(post.link_url ? { link: post.link_url } : {}),
      ...schedule,
    },
  };
};

// ---- Which Facebook Pages a call acts on ---------------------------------------------------------------------
// A post's Facebook Pages are its destinations (channel 'facebook:page:<id>'). A post made before destinations
// existed has none, and falls back to the one Page it names, or the business's default Page.

export type FbDestination = {
  id: number;
  channel_key: string;
  state: string;
  external_id: string | null;
};

export const facebookPageId = (key: string): string | null =>
  /^facebook:page:(\d{1,25})$/.exec(key)?.[1] ?? null;

export type Target = {
  // Null only for a post with no destinations and no Page named: the default Page is then used.
  pageId: string | null;
  destinationId: number | null;
  externalId: string | null;
};

export type TargetResult =
  | { ok: true; targets: Target[]; legacy: boolean }
  | { ok: false; status: number; message: string; code?: string };

export const pickTargets = (args: {
  action: "publish" | "schedule" | "remove";
  rows: FbDestination[];
  // The post has destinations of any platform (so one with none for Facebook is not meant to go there).
  anyDestinations: boolean;
  legacyPageId: string | null;
  legacyFbPostId: string | null;
  legacyStatus: string;
  onlyPage?: string | null;
}): TargetResult => {
  const { action, rows, anyDestinations, onlyPage } = args;
  const mine = rows
    .map((r) => ({ row: r, pageId: facebookPageId(r.channel_key) }))
    .filter((r) => r.pageId && (!onlyPage || r.pageId === onlyPage));

  if (action === "remove") {
    const live = mine.filter(
      (r) =>
        ["published", "scheduled"].includes(r.row.state) && r.row.external_id,
    );
    if (live.length) {
      return {
        ok: true,
        legacy: false,
        targets: live.map((r) => ({
          pageId: r.pageId,
          destinationId: r.row.id,
          externalId: r.row.external_id,
        })),
      };
    }
    if (rows.length === 0 && args.legacyFbPostId) {
      return {
        ok: true,
        legacy: true,
        targets: [
          {
            pageId: args.legacyPageId,
            destinationId: null,
            externalId: args.legacyFbPostId,
          },
        ],
      };
    }
    return { ok: false, status: 409, message: "This post is not on Facebook" };
  }

  const open = mine.filter((r) => ["planned", "failed"].includes(r.row.state));
  if (open.length) {
    return {
      ok: true,
      legacy: false,
      targets: open.map((r) => ({
        pageId: r.pageId,
        destinationId: r.row.id,
        externalId: null,
      })),
    };
  }
  if (rows.length === 0) {
    if (anyDestinations) {
      return {
        ok: false,
        status: 409,
        message: "No Facebook Page is chosen for this post.",
        code: "no_page",
      };
    }
    if (
      args.legacyStatus === "published" ||
      (args.legacyStatus === "scheduled" && args.legacyFbPostId)
    ) {
      return {
        ok: false,
        status: 409,
        message: "This post is already on Facebook",
      };
    }
    return {
      ok: true,
      legacy: true,
      targets: [
        { pageId: args.legacyPageId, destinationId: null, externalId: null },
      ],
    };
  }
  return {
    ok: false,
    status: 409,
    message: "This post is already on Facebook",
  };
};
