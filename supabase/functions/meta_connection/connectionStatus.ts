// What the app needs from Facebook, and a plain comparison against what the
// current token and Page subscriptions actually have.

export const REQUIRED_PERMISSIONS = [
  { name: "pages_messaging", why: "Send and receive Messenger messages" },
  { name: "pages_show_list", why: "See the Pages the token belongs to" },
  { name: "pages_manage_metadata", why: "Subscribe the Page to webhooks" },
  { name: "pages_read_engagement", why: "Read posts and comments" },
  { name: "pages_manage_posts", why: "Publish, schedule and delete posts" },
  { name: "pages_manage_engagement", why: "Reply to and hide comments" },
  { name: "pages_read_user_content", why: "Read comments left by customers" },
] as const;

export const REQUIRED_SUBSCRIPTIONS = [
  { name: "messages", why: "Customer messages" },
  { name: "messaging_referrals", why: "Which ad or link started a chat" },
  { name: "messaging_postbacks", why: "Button taps" },
  { name: "message_echoes", why: "Replies typed in the Facebook Page inbox" },
  { name: "feed", why: "Comments on Page posts" },
] as const;

export type CheckItem = { name: string; why: string; ok: boolean };

export const compareRequirements = (
  grantedScopes: string[] | null,
  subscribedFields: string[] | null,
) => ({
  permissions: REQUIRED_PERMISSIONS.map((p) => ({
    ...p,
    ok: grantedScopes === null ? false : grantedScopes.includes(p.name),
  })) as CheckItem[],
  subscriptions: REQUIRED_SUBSCRIPTIONS.map((s) => ({
    ...s,
    ok: subscribedFields === null ? false : subscribedFields.includes(s.name),
  })) as CheckItem[],
});

// debug_token reports expires_at 0 for tokens that do not expire.
export const describeExpiry = (
  expiresAt: number | undefined,
  now = Date.now(),
) => {
  if (!expiresAt) return { never: true, at: null, daysLeft: null };
  const at = new Date(expiresAt * 1000);
  return {
    never: false,
    at: at.toISOString(),
    daysLeft: Math.floor((at.getTime() - now) / 86_400_000),
  };
};

// Pasted tokens often carry stray spaces, quotes or line breaks.
export const cleanToken = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const token = raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, "");
  return /^[A-Za-z0-9_\-|.]{40,}$/.test(token) ? token : null;
};
