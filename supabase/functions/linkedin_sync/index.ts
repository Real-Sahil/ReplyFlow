// A daily check of each business's LinkedIn connections. Called by the scheduled job with the same Vault key
// the autopilot and the weekly summary use; nobody else can run it.
//
// For each business whose administrator has connected LinkedIn with the ads permission, it saves yesterday
// and the 30 days before it (spend, views and clicks per day, per ad account) so the cash-flow forecast and
// the weekly summary can use them, and it tells the administrators when a campaign's spend jumps. It also
// tells them when a LinkedIn connection is about to expire, because LinkedIn tokens last about 60 days and
// cannot be renewed in the background. It reads from LinkedIn only: nothing is created or changed there.

import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sendPushToOrganisation } from "../_shared/webPush.ts";
import {
  accountsUrl,
  campaignsUrl,
  MAX_PAGES,
  nextPageToken,
} from "../linkedin_ads/adsRules.ts";
import { hasAdsScope } from "../linkedin_connect/rules.ts";
import {
  dailyAnalyticsUrl,
  dailyTotals,
  expiringSoon,
  findSpikes,
  parseDaily,
} from "./syncRules.ts";

// LinkedIn versions its API by month and retires each version after about a year. If calls start failing
// with a "version not active" message in the logs, set LINKEDIN_API_VERSION to a newer month (YYYYMM).
const LINKEDIN_VERSION = Deno.env.get("LINKEDIN_API_VERSION") ?? "202605";
const MAX_ACCOUNTS = 5;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const ymd = (d: Date) => d.toISOString().slice(0, 10);

const get = async (token: string, url: string) => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`LinkedIn ${response.status}: ${body?.message ?? ""}`);
  }
  return body;
};

const getAll = async (
  token: string,
  urlFor: (pageToken?: string | null) => string,
) => {
  const items: Record<string, unknown>[] = [];
  let pageToken: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const body = await get(token, urlFor(pageToken));
    items.push(...((body.elements ?? []) as Record<string, unknown>[]));
    pageToken = nextPageToken(body);
    if (!pageToken) break;
  }
  return items;
};

// An alert is sent once a day at most for each key.
const firstTimeToday = async (organisationId: number, key: string) => {
  const { error } = await supabaseAdmin
    .from("linkedin_alerts_sent")
    .insert({ organisation_id: organisationId, alert_key: key });
  return !error; // a duplicate key means it was already sent today
};

const money = (value: number, currency: string) =>
  currency
    ? new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
        value,
      )
    : value.toFixed(2);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST")
    return json(405, { message: "Method Not Allowed" });
  const given = req.headers.get("x-autopilot-key");
  if (!given) return json(401, { message: "Unauthorized" });
  const { data: allowed } = await supabaseAdmin.rpc("post_autopilot_key_ok", {
    candidate: given,
  });
  if (allowed !== true) return json(401, { message: "Unauthorized" });

  const now = new Date();
  const yesterday = ymd(new Date(now.getTime() - 86_400_000));
  const start = ymd(new Date(now.getTime() - 31 * 86_400_000));
  let synced = 0;
  let alerts = 0;

  // 1. Ad spend and spikes, for each business with an administrator connected for ads.
  const { data: members } = await supabaseAdmin
    .from("linkedin_members")
    .select("organisation_id, sale_id, scopes, expires_at")
    .gt("expires_at", now.toISOString());
  const adsMembers = (members ?? []).filter((m) => hasAdsScope(m.scopes));
  const { data: admins } = adsMembers.length
    ? await supabaseAdmin
        .from("sales")
        .select("id")
        .in(
          "id",
          adsMembers.map((m) => m.sale_id),
        )
        .eq("administrator", true)
        .eq("disabled", false)
    : { data: [] };
  const adminIds = new Set((admins ?? []).map((a) => a.id));
  const byOrganisation = new Map<number, number>(); // organisation -> an administrator's sale id
  for (const m of adsMembers) {
    if (adminIds.has(m.sale_id) && !byOrganisation.has(m.organisation_id)) {
      byOrganisation.set(m.organisation_id, m.sale_id);
    }
  }

  for (const [organisationId, saleId] of byOrganisation) {
    // One business failing never stops the rest.
    try {
      const { data: token } = await supabaseAdmin.rpc("linkedin_member_token", {
        p_organisation_id: organisationId,
        p_sale_id: saleId,
      });
      if (!token) continue;
      const accounts = (await getAll(String(token), accountsUrl))
        .filter((a) => String(a.status) === "ACTIVE")
        .slice(0, MAX_ACCOUNTS);

      for (const account of accounts) {
        const accountId = String(account.id);
        const currency = String(account.currency ?? "");
        const rows = parseDaily(
          await get(
            String(token),
            dailyAnalyticsUrl(accountId, start, yesterday),
          ),
        );
        const totals = dailyTotals(rows);
        if (totals.length) {
          const { error } = await supabaseAdmin
            .from("linkedin_ad_spend")
            .upsert(
              totals.map((t) => ({
                organisation_id: organisationId,
                account_id: accountId,
                day: t.day,
                spend: Number(t.spend.toFixed(2)),
                currency,
                impressions: Math.round(t.impressions),
                clicks: Math.round(t.clicks),
              })),
              { onConflict: "organisation_id,account_id,day" },
            );
          if (error) throw new Error(error.message);
          synced += totals.length;
        }

        const spikes = findSpikes(rows, yesterday);
        if (spikes.length) {
          const names = new Map(
            (
              await getAll(String(token), (t) => campaignsUrl(accountId, t))
            ).map((c) => [String(c.id), String(c.name ?? `Campaign ${c.id}`)]),
          );
          for (const spike of spikes.slice(0, 3)) {
            if (
              !(await firstTimeToday(
                organisationId,
                `spike:${spike.campaignId}`,
              ))
            )
              continue;
            await sendPushToOrganisation(
              organisationId,
              {
                title: "LinkedIn ad spend jumped",
                body: `"${names.get(spike.campaignId) ?? "A campaign"}" spent ${money(spike.yesterday, currency)} yesterday, about ${spike.times.toFixed(1)} times its usual.`,
                url: "/app#/linkedin_ads",
                tag: `linkedin-spike-${spike.campaignId}`,
              },
              { administratorsOnly: true },
            );
            alerts++;
          }
        }
      }
    } catch (error) {
      console.error(
        "LinkedIn sync failed for a business",
        organisationId,
        (error as Error).message,
      );
    }
  }

  // 2. Connections that are about to stop working.
  try {
    const { data: people } = await supabaseAdmin
      .from("linkedin_members")
      .select("organisation_id, sale_id, name, expires_at");
    const { data: pages } = await supabaseAdmin
      .from("linkedin_pages")
      .select("organisation_id, org_id, name, expires_at");
    const items = [
      ...(people ?? []).map((p) => ({
        organisationId: p.organisation_id as number,
        kind: "profile" as const,
        id: String(p.sale_id),
        name: String(p.name || "a profile"),
        expires_at: String(p.expires_at),
      })),
      ...(pages ?? []).map((p) => ({
        organisationId: p.organisation_id as number,
        kind: "page" as const,
        id: String(p.org_id),
        name: String(p.name || "a Page"),
        expires_at: String(p.expires_at),
      })),
    ];
    for (const e of expiringSoon(items, now.getTime())) {
      const item = items.find((i) => i.kind === e.kind && i.id === e.id)!;
      if (
        !(await firstTimeToday(item.organisationId, `expiry:${e.kind}:${e.id}`))
      )
        continue;
      await sendPushToOrganisation(
        item.organisationId,
        {
          title: "A LinkedIn connection is about to stop",
          body: `${e.kind === "page" ? "The Page" : "The profile"} ${e.name} stops working ${e.days === 0 ? "today" : `in ${e.days} ${e.days === 1 ? "day" : "days"}`}. Connect again on the LinkedIn screen.`,
          url: "/app#/linkedin",
          tag: `linkedin-expiry-${e.kind}-${e.id}`,
        },
        { administratorsOnly: true },
      );
      alerts++;
    }
  } catch (error) {
    console.error("LinkedIn expiry check failed", (error as Error).message);
  }

  return json(200, { synced, alerts });
});
