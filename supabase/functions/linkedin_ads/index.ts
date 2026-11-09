// A read-only LinkedIn ads report for administrators: which ad accounts the connected LinkedIn
// account can see, and for one of them each campaign's spend, views and clicks over a date range.
// Nothing is created or changed on LinkedIn. It uses the administrator's own LinkedIn connection (made
// with the ads permission) and the token never leaves the server.
//
// POST { action: "accounts" }: returns { accounts: [{ id, name, currency, status }] }
// POST { action: "report", account_id, start, end }: returns { currency, rows, totals }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { hasAdsScope } from "../linkedin_connect/rules.ts";
import {
  analyticsUrl,
  buildRows,
  totals,
  validRange,
  type Campaign,
} from "./adsRules.ts";

const BASE = "https://api.linkedin.com/rest";
// LinkedIn versions its API by month and retires each version after about a year. If calls start failing
// with a "version not active" message in the logs, set LINKEDIN_API_VERSION to a newer month (YYYYMM).
const LINKEDIN_VERSION = Deno.env.get("LINKEDIN_API_VERSION") ?? "202605";

const ok = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

class LinkedInError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const get = async (token: string, url: string) => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    signal: AbortSignal.timeout(15000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("LinkedIn ads call failed", response.status, json?.message);
    throw new LinkedInError(
      json?.message ?? "LinkedIn refused",
      response.status,
    );
  }
  return json;
};

Deno.serve((req: Request) =>
  OptionsMiddleware(req, (req) =>
    AuthMiddleware(req, (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }
        const sale = await getUserSale(user!);
        if (!sale || sale.disabled || !sale.administrator) {
          return createErrorResponse(
            403,
            "Only administrators can see ad results",
          );
        }
        let input: {
          action?: string;
          account_id?: string;
          start?: string;
          end?: string;
        };
        try {
          input = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid request");
        }
        if (!["accounts", "report"].includes(String(input.action))) {
          return createErrorResponse(400, "Unknown action");
        }

        const organisationId = Number(sale.organisation_id);
        const { data: member } = await supabaseAdmin
          .from("linkedin_members")
          .select("scopes")
          .eq("organisation_id", organisationId)
          .eq("sale_id", sale.id)
          .maybeSingle();
        if (!member || !hasAdsScope(member.scopes)) {
          return createErrorResponse(
            409,
            "Connect LinkedIn for ads reports first.",
            { code: "needs_ads_connect" },
          );
        }
        const { data: token } = await supabaseAdmin.rpc(
          "linkedin_member_token",
          {
            p_organisation_id: organisationId,
            p_sale_id: Number(sale.id),
          },
        );
        if (!token) {
          return createErrorResponse(
            409,
            "Your LinkedIn connection has expired. Connect again.",
            { code: "expired" },
          );
        }

        try {
          if (input.action === "accounts") {
            const json = await get(
              String(token),
              `${BASE}/adAccounts?q=search&count=100`,
            );
            const accounts = (json.elements ?? []).map(
              (a: Record<string, unknown>) => ({
                id: String(a.id),
                name: String(a.name ?? `Account ${a.id}`),
                currency: String(a.currency ?? ""),
                status: String(a.status ?? ""),
              }),
            );
            return ok({ accounts });
          }

          const accountId = String(input.account_id ?? "");
          if (!/^\d{1,20}$/.test(accountId)) {
            return createErrorResponse(400, "An ad account is required");
          }
          if (!validRange(input.start, input.end)) {
            return createErrorResponse(
              400,
              "Choose a start and end date (up to a year).",
            );
          }
          const [account, campaignJson, analytics] = await Promise.all([
            get(String(token), `${BASE}/adAccounts/${accountId}`),
            get(
              String(token),
              `${BASE}/adAccounts/${accountId}/adCampaigns?q=search&count=100`,
            ),
            get(
              String(token),
              analyticsUrl(accountId, String(input.start), String(input.end)),
            ),
          ]);
          const campaigns: Campaign[] = (campaignJson.elements ?? []).map(
            (c: Record<string, unknown>) => ({
              id: String(c.id),
              name: String(c.name ?? `Campaign ${c.id}`),
              status: String(c.status ?? ""),
            }),
          );
          const rows = buildRows(campaigns, analytics);
          return ok({
            currency: String(account.currency ?? ""),
            rows,
            totals: totals(rows),
          });
        } catch (e) {
          if (e instanceof LinkedInError) {
            if (e.status === 401) {
              return createErrorResponse(
                409,
                "Your LinkedIn connection has expired. Connect again.",
                { code: "expired" },
              );
            }
            if (e.status === 403) {
              return createErrorResponse(
                403,
                "LinkedIn says this account cannot see that ad account.",
                { code: "no_access" },
              );
            }
          }
          return createErrorResponse(
            502,
            "LinkedIn did not return the ad results.",
          );
        }
      }),
    ),
  ),
);
