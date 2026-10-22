// Meta allows one private (Messenger) reply to a comment, within 7 days of it.
export const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const canPrivateReply = (
  commentedAt: string,
  alreadySent: string | null,
  now: number = Date.now(),
) => {
  if (alreadySent) return false;
  const at = Date.parse(commentedAt);
  return (
    !Number.isNaN(at) && now - at >= 0 && now - at <= PRIVATE_REPLY_WINDOW_MS
  );
};

export const ACTIONS = [
  "reply",
  "hide",
  "unhide",
  "private_reply",
  "handled",
  "to_enquiry",
] as const;
export type CommentAction = (typeof ACTIONS)[number];

export const isAction = (value: unknown): value is CommentAction =>
  typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
