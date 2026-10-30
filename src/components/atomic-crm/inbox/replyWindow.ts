// Messenger lets a business reply for 24 hours after a customer writes.
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

// "2h left", "34m left", "Closed": how long a conversation can still be answered.
export const windowLeft = (lastSentAt: string, now = Date.now()) => {
  const ms = new Date(lastSentAt).getTime() + REPLY_WINDOW_MS - now;
  if (ms <= 0) return { label: "Closed", urgent: true };
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return { label: `${hours}h left`, urgent: hours < 3 };
  return {
    label: `${Math.max(1, Math.round(ms / 60000))}m left`,
    urgent: true,
  };
};
