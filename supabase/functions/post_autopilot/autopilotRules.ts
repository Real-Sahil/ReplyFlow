// Pure rules for the post autopilot: when the next posts go out, what the
// caption must look like, and whether a drafted caption can be trusted.
// Kept free of Deno-only APIs so they can be unit tested with vitest.

export const MIN_LEAD_MS = 60 * 60 * 1000;
// Facebook schedules up to 30 days ahead. Stay inside that with a margin.
const MAX_HORIZON_MS = 29 * 24 * 60 * 60 * 1000;
const CONFLICT_MS = 30 * 60 * 1000;
const MAX_SEARCH_DAYS = 60;

const SLOT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// The slot times an admin can configure, e.g. ["12:00", "18:00"].
export const validSlotTimes = (times: unknown): string[] =>
  Array.isArray(times)
    ? [...new Set(times.filter((t): t is string => typeof t === "string"))]
        .filter((t) => SLOT_PATTERN.test(t))
        .sort()
    : [];

// The offset of a time zone from UTC, in minutes, at a given instant.
const offsetMinutes = (instant: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const wallClock = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const truncated = instant.getTime() - instant.getMilliseconds();
  return (wallClock - truncated) / 60_000;
};

// Turns a wall-clock time in a time zone (e.g. 12:00 in London) into the instant
// it happens. Two passes so a time near a daylight-saving change still lands right.
export const zonedToUtc = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date => {
  const local = Date.UTC(year, month - 1, day, hour, minute);
  const first = local - offsetMinutes(new Date(local), timeZone) * 60_000;
  return new Date(local - offsetMinutes(new Date(first), timeZone) * 60_000);
};

const localDate = (instant: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
};

// The next free slots after `now`, earliest first. A slot is free when no post is
// already planned within 30 minutes of it.
export const nextFreeSlots = (input: {
  now: Date;
  slotTimes: string[];
  taken: Date[];
  count: number;
  timeZone: string;
}): Date[] => {
  const { now, timeZone, count } = input;
  const slots = validSlotTimes(input.slotTimes);
  const taken = [...input.taken];
  const out: Date[] = [];
  if (slots.length === 0 || count <= 0) return out;

  const today = localDate(now, timeZone);
  const earliest = now.getTime() + MIN_LEAD_MS;
  const latest = now.getTime() + MAX_HORIZON_MS;

  for (
    let offset = 0;
    offset < MAX_SEARCH_DAYS && out.length < count;
    offset++
  ) {
    // Walk calendar days by UTC arithmetic, then read each day's date in the zone.
    const day = new Date(
      Date.UTC(today.year, today.month - 1, today.day + offset),
    );
    const date = {
      year: day.getUTCFullYear(),
      month: day.getUTCMonth() + 1,
      day: day.getUTCDate(),
    };
    for (const time of slots) {
      if (out.length >= count) break;
      const [hour, minute] = time.split(":").map(Number);
      const candidate = zonedToUtc(
        date.year,
        date.month,
        date.day,
        hour,
        minute,
        timeZone,
      );
      const at = candidate.getTime();
      if (at < earliest || at > latest) continue;
      if (taken.some((t) => Math.abs(t.getTime() - at) < CONFLICT_MS)) continue;
      out.push(candidate);
      taken.push(candidate);
    }
  }
  return out;
};

export type ProductFacts = {
  title: string;
  collection: string | null;
  product_type: string | null;
  colour: string | null;
  price_pence: number | null;
  original_price_pence: number | null;
  source_url: string | null;
};

export const SYSTEM_PROMPT = [
  "You write Facebook Page posts for Mere & Row, a UK sofa business.",
  "You are given one product as JSON. Write one post about it.",
  "Rules:",
  "- British English. Warm, plain and confident. Two to four short sentences.",
  "- Use only the facts in the JSON. Never invent materials, sizes, fabric names, delivery times, stock levels or offers.",
  "- If a price is given, quote it exactly as given, in pounds, e.g. £499. Do not quote any other price.",
  "- Do not include a web link. The link is attached separately.",
  "- At most two hashtags, at the end. Often none.",
  'Reply with only a JSON object: {"message": "<the post>"}.',
].join("\n");

export const buildUserPrompt = (product: ProductFacts) => {
  const pounds = (pence: number | null) =>
    pence == null
      ? null
      : `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;
  return JSON.stringify({
    name: product.title,
    collection: product.collection,
    type: product.product_type,
    colour: product.colour,
    price: pounds(product.price_pence),
    was_price:
      product.original_price_pence != null &&
      product.price_pence != null &&
      product.original_price_pence > product.price_pence
        ? pounds(product.original_price_pence)
        : null,
  });
};

// Pulls the post text out of the model's reply. Returns null when it is not usable.
export const parseDraft = (raw: string): string | null => {
  let message: unknown;
  try {
    message = (JSON.parse(raw) as { message?: unknown }).message;
  } catch {
    return null;
  }
  if (typeof message !== "string") return null;
  const trimmed = message.trim();
  return trimmed.length > 0 && trimmed.length <= 2000 ? trimmed : null;
};

// Every £ amount in the caption must be one of the product's own prices. A wrong
// price on a public Page is the one mistake we cannot afford, so anything else fails.
export const checkDraft = (
  message: string,
  product: ProductFacts,
): { ok: true } | { ok: false; reason: string } => {
  if (/https?:\/\/|www\./i.test(message)) {
    return { ok: false, reason: "The caption contains a link." };
  }
  const allowed = [product.price_pence, product.original_price_pence]
    .filter((p): p is number => p != null)
    .map((p) => p / 100);
  const amounts = [...message.matchAll(/£\s?(\d[\d,]*(?:\.\d{1,2})?)/g)].map(
    (match) => Number(match[1].replace(/,/g, "")),
  );
  const stray = amounts.find((amount) => !allowed.includes(amount));
  if (stray !== undefined) {
    return {
      ok: false,
      reason: `The caption quotes £${stray}, which is not a price for this product.`,
    };
  }
  return { ok: true };
};

export const CURATION_PROMPT = [
  "You choose which products Mere & Row, a UK sofa business, should feature in its next Facebook posts.",
  "You are given a JSON list of candidate products. Pick the ones most worth a post now.",
  "Rules:",
  "- Pick distinct products. Spread the picks across collections rather than repeating one.",
  "- Favour products with a clear name, a price, and a colour or type a customer can picture.",
  "- Use only ids from the list. Never invent an id.",
  'Reply with only a JSON object: {"picks": [{"id": <number>, "reason": "<short reason>"}]}.',
].join("\n");

export const buildCurationPrompt = (
  products: Array<ProductFacts & { id: number }>,
  count: number,
) =>
  JSON.stringify({
    pick_up_to: count,
    candidates: products.map((p) => ({
      id: p.id,
      name: p.title,
      collection: p.collection,
      type: p.product_type,
      colour: p.colour,
      price: p.price_pence != null ? p.price_pence / 100 : null,
    })),
  });

// Reads the model's picks and keeps only real candidates, once each, up to `count`.
// Returns null when the reply cannot be used, so the caller can fall back.
export const parsePicks = (
  raw: string,
  candidateIds: number[],
  count: number,
): number[] | null => {
  let picks: unknown;
  try {
    picks = (JSON.parse(raw) as { picks?: unknown }).picks;
  } catch {
    return null;
  }
  if (!Array.isArray(picks)) return null;
  const allowed = new Set(candidateIds);
  const chosen: number[] = [];
  for (const pick of picks) {
    const id = Number((pick as { id?: unknown })?.id);
    if (!Number.isInteger(id) || !allowed.has(id) || chosen.includes(id))
      continue;
    chosen.push(id);
    if (chosen.length >= count) break;
  }
  return chosen.length > 0 ? chosen : null;
};

// A photo Facebook can fetch: a reachable JPEG or PNG. Checked before a post is
// planned, so a dead or non-image link never reaches the queue.
export const isImageContentType = (contentType: string | null) =>
  !!contentType && /^image\/(jpeg|png)\b/i.test(contentType);
