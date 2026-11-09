// The parts of the LinkedIn ads report that need no network. Pure, so they can be tested.

export type Day = { year: number; month: number; day: number };

export const dayOf = (iso: string): Day => {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return { year, month, day };
};

// LinkedIn's own date-range syntax. The brackets and commas are part of the format and are not escaped.
export const dateRangeParam = (startIso: string, endIso: string) => {
  const a = dayOf(startIso);
  const b = dayOf(endIso);
  return `(start:(year:${a.year},month:${a.month},day:${a.day}),end:(year:${b.year},month:${b.month},day:${b.day}))`;
};

export const accountUrn = (id: string) => `urn:li:sponsoredAccount:${id}`;
export const campaignIdFromUrn = (urn: string) => urn.split(":").pop() ?? urn;

// Built by hand, because LinkedIn's list and range syntax must not be percent-encoded, only the urn's colons.
export const analyticsUrl = (
  accountId: string,
  startIso: string,
  endIso: string,
) =>
  "https://api.linkedin.com/rest/adAnalytics?" +
  [
    "q=analytics",
    "pivot=CAMPAIGN",
    "timeGranularity=ALL",
    `dateRange=${dateRangeParam(startIso, endIso)}`,
    `accounts=List(${encodeURIComponent(accountUrn(accountId))})`,
    "fields=impressions,clicks,costInLocalCurrency,pivotValues",
  ].join("&");

export type Campaign = { id: string; name: string; status: string };
export type Row = {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null; // clicks / impressions, as a fraction
  costPerClick: number | null;
};

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// Joins the results to the campaign names, keeps campaigns that had no activity (so the list is complete),
// and puts the biggest spender first.
export const buildRows = (
  campaigns: Campaign[],
  analytics: { elements?: Record<string, unknown>[] } | null | undefined,
): Row[] => {
  const byCampaign = new Map<string, Record<string, unknown>>();
  for (const element of analytics?.elements ?? []) {
    const urn = (element.pivotValues as string[] | undefined)?.[0];
    if (urn) byCampaign.set(campaignIdFromUrn(urn), element);
  }
  return campaigns
    .map((campaign) => {
      const e = byCampaign.get(campaign.id);
      const spend = num(e?.costInLocalCurrency);
      const impressions = num(e?.impressions);
      const clicks = num(e?.clicks);
      return {
        ...campaign,
        spend,
        impressions,
        clicks,
        ctr: impressions > 0 ? clicks / impressions : null,
        costPerClick: clicks > 0 ? spend / clicks : null,
      };
    })
    .sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name));
};

export const totals = (rows: Row[]) => {
  const spend = rows.reduce((t, r) => t + r.spend, 0);
  const impressions = rows.reduce((t, r) => t + r.impressions, 0);
  const clicks = rows.reduce((t, r) => t + r.clicks, 0);
  return {
    spend,
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : null,
    costPerClick: clicks > 0 ? spend / clicks : null,
  };
};

// A date range that LinkedIn accepts and that is not silly: ISO days, start no later than end, at most a year.
export const validRange = (start: unknown, end: unknown) => {
  const ok = (v: unknown) =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
  if (!ok(start) || !ok(end)) return false;
  const a = Date.parse(String(start).slice(0, 10));
  const b = Date.parse(String(end).slice(0, 10));
  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    a <= b &&
    b - a <= 366 * 86_400_000
  );
};

// Every ad account the connected person can see, whatever its status (LinkedIn leaves some out otherwise),
// 100 at a time. The page token is LinkedIn's own and is passed back unchanged.
export const ALL_STATUSES = "ACTIVE,DRAFT,CANCELED,PENDING_DELETION,REMOVED";
export const accountsUrl = (pageToken?: string | null) =>
  "https://api.linkedin.com/rest/adAccounts?" +
  [
    "q=search",
    `search=(status:(values:List(${ALL_STATUSES})))`,
    "pageSize=100",
    ...(pageToken ? [`pageToken=${encodeURIComponent(pageToken)}`] : []),
  ].join("&");

export const campaignsUrl = (accountId: string, pageToken?: string | null) =>
  `https://api.linkedin.com/rest/adAccounts/${accountId}/adCampaigns?` +
  [
    "q=search",
    "pageSize=100",
    ...(pageToken ? [`pageToken=${encodeURIComponent(pageToken)}`] : []),
  ].join("&");

// The token for the next page, or null when that was the last one.
export const nextPageToken = (json: {
  metadata?: { nextPageToken?: unknown };
}): string | null => {
  const token = json?.metadata?.nextPageToken;
  return typeof token === "string" && token ? token : null;
};

export const MAX_PAGES = 10;
