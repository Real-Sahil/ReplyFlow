// Destinations: one post going to one channel (see docs/SOCIAL_WORKFLOW.md). The checks that need no network
// are kept here so they can be tested.

export type ChannelRef =
  | { platform: "linkedin"; kind: "page"; id: string }
  | { platform: "linkedin"; kind: "profile"; id: string };

// 'linkedin:page:<number>' or 'linkedin:profile:<number>'. Anything else is not a channel this server posts to.
export const parseChannelKey = (key: unknown): ChannelRef | null => {
  if (typeof key !== "string") return null;
  const m = /^linkedin:(page|profile):(\d{1,20})$/.exec(key);
  return m
    ? { platform: "linkedin", kind: m[1] as "page" | "profile", id: m[2] }
    : null;
};

// The words a destination posts: its own version when it has one, otherwise the post's.
export const textFor = (
  post: { message: string },
  destination: { text_override: string | null },
) => destination.text_override?.trim() || post.message;

// Who may send a post out. A person who is not an administrator posts approved posts only (or ones already on
// Facebook, which have been through that); an administrator may also post a draft or a failed one. The runner
// has no person, so it posts only what is approved, scheduled or published.
export const mayPost = (
  postStatus: string,
  who: { administrator: boolean } | "runner",
) =>
  postStatus === "approved" ||
  postStatus === "scheduled" ||
  postStatus === "published" ||
  (who !== "runner" &&
    who.administrator &&
    ["draft", "failed"].includes(postStatus));

export type Destination = {
  id: number;
  state: string;
  scheduled_for: string | null;
};

// A scheduled destination whose time has come.
export const isDue = (d: Destination, now: number) =>
  d.state === "scheduled" &&
  d.scheduled_for !== null &&
  Date.parse(d.scheduled_for) <= now;

// A destination can be sent from these states; a published one has already gone.
export const canSend = (state: string) =>
  ["planned", "scheduled", "failed"].includes(state);

// What is saved on a failed destination: short, and without anything long or odd from outside.
export const failureNote = (message: string) =>
  message.replace(/\s+/g, " ").trim().slice(0, 300);
