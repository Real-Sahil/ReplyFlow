// Works out the best days and hours to post, from how past posts performed. Times are read
// on the London clock. A slot is only recommended with enough posts behind it, so one lucky
// post does not decide the schedule. Needs the Page's insights (see the app review notes).

export type PastPost = { published_at: string; engagement: number };

export const MIN_POSTS_PER_SLOT = 3;

const LONDON = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  hour: "numeric",
  hour12: false,
});

export type Slot = {
  day: string;
  hour: number;
  average: number;
  posts: number;
};

export const bestSlots = (
  posts: PastPost[],
  count = 3,
): { slots: Slot[]; enough: boolean } => {
  const buckets = new Map<
    string,
    { total: number; posts: number; day: string; hour: number }
  >();
  for (const post of posts) {
    const time = Date.parse(post.published_at);
    if (Number.isNaN(time) || !Number.isFinite(post.engagement)) continue;
    const parts = LONDON.formatToParts(new Date(time));
    const day = parts.find((p) => p.type === "weekday")?.value ?? "";
    const hour = Number(parts.find((p) => p.type === "hour")?.value) % 24;
    const key = `${day}-${hour}`;
    const bucket = buckets.get(key) ?? { total: 0, posts: 0, day, hour };
    bucket.total += post.engagement;
    bucket.posts += 1;
    buckets.set(key, bucket);
  }
  const slots = [...buckets.values()]
    .filter((b) => b.posts >= MIN_POSTS_PER_SLOT)
    .map((b) => ({
      day: b.day,
      hour: b.hour,
      average: b.total / b.posts,
      posts: b.posts,
    }))
    .sort((a, b) => b.average - a.average)
    .slice(0, count);
  return { slots, enough: slots.length > 0 };
};
