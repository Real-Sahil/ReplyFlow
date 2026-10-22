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
