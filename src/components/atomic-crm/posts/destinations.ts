// Destinations in the app: one post going to one channel (see docs/SOCIAL_WORKFLOW.md). Pure functions, so the
// rules can be tested.

export type DestinationState =
  | "planned"
  | "scheduled"
  | "published"
  | "failed"
  | "removed";

export type DestinationRow = {
  id: number;
  post_id: number;
  channel_key: string;
  state: DestinationState;
  text_override: string | null;
  scheduled_for: string | null;
  external_id: string | null;
  error: string | null;
  posted_at: string | null;
};

export type Channel = {
  channel_key: string;
  platform: "facebook" | "linkedin";
  kind: "page" | "profile";
  external_id: string;
  name: string;
  expires_at: string | null;
  is_default: boolean;
};

export type Health = "ok" | "soon" | "expired";

// A connection with no expiry (Facebook's) is fine. LinkedIn's last about 60 days: "soon" is a week or less.
export const health = (expiresAt: string | null, now = Date.now()): Health => {
  if (!expiresAt) return "ok";
  const days = Math.ceil((Date.parse(expiresAt) - now) / 86_400_000);
  return days <= 0 ? "expired" : days <= 7 ? "soon" : "ok";
};

const REMOVABLE: DestinationState[] = ["planned", "scheduled", "failed"];

// What to do to the saved destinations so they match the channels ticked: add the new ones, remove the ones
// un-ticked (only those not yet sent), and keep the rest. A destination already posted is never touched here.
export const planDestinations = (
  existing: DestinationRow[],
  wanted: Set<string>,
) => ({
  add: [...wanted].filter(
    (key) => !existing.some((row) => row.channel_key === key),
  ),
  remove: existing.filter(
    (row) => !wanted.has(row.channel_key) && REMOVABLE.includes(row.state),
  ),
  keep: existing.filter(
    (row) => wanted.has(row.channel_key) && row.state !== "published",
  ),
});

export type Action = "draft" | "submit" | "approve" | "schedule" | "publish";

// What state a destination is saved in: scheduled when the post is being scheduled (or approved with a time),
// otherwise planned, which waits for someone to post it.
export const targetState = (
  action: Action,
  whenIso: string | null,
): { state: "planned" | "scheduled"; scheduled_for: string | null } =>
  whenIso && (action === "schedule" || action === "approve")
    ? { state: "scheduled", scheduled_for: whenIso }
    : { state: "planned", scheduled_for: null };

const clock = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
});

export const stateText = (
  row: Pick<DestinationRow, "state" | "scheduled_for" | "error">,
) => {
  switch (row.state) {
    case "planned":
      return "Chosen, not posted yet";
    case "scheduled":
      return row.scheduled_for
        ? `Scheduled for ${clock.format(new Date(row.scheduled_for))}`
        : "Scheduled";
    case "published":
      return "Posted";
    case "removed":
      return "Taken down";
    case "failed":
      return row.error ? `Did not go out: ${row.error}` : "Did not go out";
  }
};

export type Tone = "good" | "wait" | "bad" | "quiet";
export const stateTone = (state: DestinationState): Tone =>
  state === "published"
    ? "good"
    : state === "failed"
      ? "bad"
      : state === "removed"
        ? "quiet"
        : "wait";

// The LinkedIn wording choice for a post: its own words, or one version used for every LinkedIn destination.
export type Wording = { mode: "written" | "linkedin"; text: string };

export const wordingFrom = (rows: DestinationRow[]): Wording => {
  const own = rows.find((r) => r.state !== "removed" && r.text_override);
  return own
    ? { mode: "linkedin", text: own.text_override as string }
    : { mode: "written", text: "" };
};

export const overrideFor = (w: Wording): string | null =>
  w.mode === "linkedin" && w.text.trim() ? w.text.trim() : null;

export const platformOf = (key: string): "facebook" | "linkedin" | null =>
  key.startsWith("facebook:")
    ? "facebook"
    : key.startsWith("linkedin:")
      ? "linkedin"
      : null;

// What is saved for one destination. A Facebook Page always posts the post's own words and waits to be sent
// (Facebook holds its own schedule, set by the server once Facebook accepts it); a LinkedIn destination carries
// the LinkedIn wording and, when the post is being scheduled, waits for its time.
export const valuesFor = (
  key: string,
  action: Action,
  whenIso: string | null,
  wording: Wording,
): {
  text_override: string | null;
  state: "planned" | "scheduled";
  scheduled_for: string | null;
} =>
  platformOf(key) === "facebook"
    ? { text_override: null, state: "planned", scheduled_for: null }
    : { text_override: overrideFor(wording), ...targetState(action, whenIso) };
