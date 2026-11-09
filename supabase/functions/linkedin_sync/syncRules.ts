// The parts of the daily LinkedIn check that need no network. Pure, so they can be tested.

import { dateRangeParam, accountUrn } from "../linkedin_ads/adsRules.ts";

// Daily results for every campaign of one ad account, for a range of days.
export const dailyAnalyticsUrl = (
  accountId: string,
  startIso: string,
  endIso: string,
) =>
  "https://api.linkedin.com/rest/adAnalytics?" +
  [
    "q=analytics",
    "pivot=CAMPAIGN",
    "timeGranularity=DAILY",
    `dateRange=${dateRangeParam(startIso, endIso)}`,
    `accounts=List(${encodeURIComponent(accountUrn(accountId))})`,
    "fields=impressions,clicks,costInLocalCurrency,pivotValues,dateRange",
  ].join("&");

export type DayRow = {
  campaignId: string;
  day: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  clicks: number;
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pad = (n: number) => String(n).padStart(2, "0");

export const parseDaily = (json: {
  elements?: Record<string, unknown>[];
}): DayRow[] => {
  const rows: DayRow[] = [];
  for (const e of json.elements ?? []) {
    const start = (
      e.dateRange as { start?: Record<string, unknown> } | undefined
    )?.start;
    const urn = (e.pivotValues as string[] | undefined)?.[0];
    if (!start || !urn) continue;
    const year = num(start.year);
    const month = num(start.month);
    const day = num(start.day);
    if (!year || !month || !day) continue;
    rows.push({
      campaignId: urn.split(":").pop() ?? urn,
      day: `${year}-${pad(month)}-${pad(day)}`,
      spend: num(e.costInLocalCurrency),
      impressions: num(e.impressions),
      clicks: num(e.clicks),
    });
  }
  return rows;
};

export type DayTotal = {
  day: string;
  spend: number;
  impressions: number;
  clicks: number;
};

// One row per day for the whole account, oldest first.
export const dailyTotals = (rows: DayRow[]): DayTotal[] => {
  const byDay = new Map<string, DayTotal>();
  for (const r of rows) {
    const t = byDay.get(r.day) ?? {
      day: r.day,
      spend: 0,
      impressions: 0,
      clicks: 0,
    };
    t.spend += r.spend;
    t.impressions += r.impressions;
    t.clicks += r.clicks;
    byDay.set(r.day, t);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
};

export type Spike = {
  campaignId: string;
  yesterday: number;
  usual: number;
  times: number;
};

export const SPIKE_FACTOR = 2;
export const SPIKE_MIN_SPEND = 5; // in the account's own currency; below this a jump is noise
export const SPIKE_MIN_DAYS = 3; // days of history needed to say what "usual" is

// A campaign whose spend yesterday was at least double its usual (the average of the seven days before) and
// not trivial. Needs a few days of history, so a new campaign is not flagged for starting.
export const findSpikes = (rows: DayRow[], yesterday: string): Spike[] => {
  const by = new Map<string, DayRow[]>();
  for (const r of rows)
    by.set(r.campaignId, [...(by.get(r.campaignId) ?? []), r]);
  const spikes: Spike[] = [];
  for (const [campaignId, list] of by) {
    const y = list.find((r) => r.day === yesterday)?.spend ?? 0;
    const before = list
      .filter((r) => r.day < yesterday)
      .sort((a, b) => b.day.localeCompare(a.day))
      .slice(0, 7);
    if (before.length < SPIKE_MIN_DAYS) continue;
    const usual = before.reduce((t, r) => t + r.spend, 0) / before.length;
    if (usual > 0 && y >= SPIKE_MIN_SPEND && y >= usual * SPIKE_FACTOR) {
      spikes.push({ campaignId, yesterday: y, usual, times: y / usual });
    }
  }
  return spikes.sort((a, b) => b.yesterday - a.yesterday);
};

export type Expiring = {
  kind: "profile" | "page";
  id: string;
  name: string;
  days: number;
};

// Connections that stop working within a few days, with whole days left (today counts as 0).
export const expiringSoon = (
  items: {
    kind: "profile" | "page";
    id: string;
    name: string;
    expires_at: string;
  }[],
  now: number,
  withinDays = 3,
): Expiring[] =>
  items
    .map((i) => ({
      kind: i.kind,
      id: i.id,
      name: i.name,
      days: Math.ceil((Date.parse(i.expires_at) - now) / 86_400_000),
    }))
    .filter((i) => i.days >= 0 && i.days <= withinDays);
