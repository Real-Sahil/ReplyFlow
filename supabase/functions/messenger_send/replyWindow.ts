// Messenger allows free-form replies for 24 hours after the customer's last message.
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export const isWithinReplyWindow = (
  lastInboundAt: string | null | undefined,
  now: number = Date.now(),
) => {
  if (!lastInboundAt) return false;
  const sent = Date.parse(lastInboundAt);
  if (Number.isNaN(sent)) return false;
  return now - sent >= 0 && now - sent <= REPLY_WINDOW_MS;
};

export const validateReplyText = (text: unknown): string | null => {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  // Messenger text messages are limited to 2000 characters.
  return trimmed.length > 0 && trimmed.length <= 2000 ? trimmed : null;
};
