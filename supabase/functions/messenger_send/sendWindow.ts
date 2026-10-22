// Automatic messages to customers only go out inside business hours, in the
// organisation's time zone. A message sent at night to a new contact looks automated,
// so the gate reports the next opening instead of sending.
// Replies to a customer who wrote in are reactive and are not held by this rule.

import {
  type AutoReplySettings,
  isOpenNow,
} from "../messenger_webhook/autoReply.ts";

const MINUTE_MS = 60 * 1000;
// Opening hours repeat weekly, so one week of minutes always contains an opening.
const MAX_MINUTES = 8 * 24 * 60;

// The first moment at or after `from` that falls inside business hours, or null when
// the settings never open (for example, no open days).
export const nextOpening = (
  settings: AutoReplySettings,
  from: Date,
): Date | null => {
  for (let i = 0; i <= MAX_MINUTES; i++) {
    const at = new Date(from.getTime() + i * MINUTE_MS);
    if (isOpenNow(settings, at)) return at;
  }
  return null;
};
