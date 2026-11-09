// Connects a business's LinkedIn company Pages (the Community Management API, which lives on its own
// LinkedIn app). An administrator approves ReplyFlow on LinkedIn's own screen. LinkedIn sends them back
// to /callback here, the server swaps that approval for an access token, lists the Pages the person
// administers, and keeps a token per Page encrypted in Vault. Tokens are never shown to the browser.
// LinkedIn tokens last about 60 days, so the expiry is stored and the app asks for a reconnect.
//
// POST { action: "start" } (administrators): returns { url }, LinkedIn's approval link.
// POST { action: "disconnect", org_id }: forgets one Page.
// GET /callback: where LinkedIn returns the approval. Redirects back to the app with the outcome.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import {
  detailFor,
  expiryFrom,
  outcomeFor,
} from "../linkedin_connect/rules.ts";
import { signState, verifyState } from "../meta_connect/state.ts";
import { orgIdsFromAcls, pageName, pagesAuthorizeUrl } from "./rules.ts";

const CLIENT_ID = Deno.env.get("LINKEDIN_PAGES_CLIENT_ID") ?? "78be0ffl37c4od";
const APP_URL = Deno.env.get("APP_URL") ?? "https://replyflow-sahil.vercel.app";
const REDIRECT_URI = `${Deno.env.get("SUPABASE_URL")}/functions/v1/linkedin_pages_connect/callback`;
// LinkedIn versions its API by month and retires each version after about a year. If calls start failing
// with a "version not active" message in the logs, set LINKEDIN_API_VERSION to a newer month (YYYYMM).
const LINKEDIN_VERSION = Deno.env.get("LINKEDIN_API_VERSION") ?? "202605";

const ok = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const back = (query: string) =>
  Response.redirect(`${APP_URL}/app#/linkedin?${query}`, 302);

const get = async (token: string, url: string) => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    signal: AbortSignal.timeout(10000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("LinkedIn Pages call failed", response.status, json?.message);
    throw new Error(`LinkedIn ${response.status}`);
  }
  return json;
};

const callback = async (url: URL) => {
  const error = url.searchParams.get("error");
  if (error) {
    const detail = detailFor(url.searchParams.get("error_description"));
    console.error("LinkedIn refused the connection", error, detail);
    return back(
      `${outcomeFor(error)}${detail ? `&detail=${encodeURIComponent(detail)}` : ""}`,
    );
  }

  const secret = Deno.env.get("LINKEDIN_PAGES_CLIENT_SECRET") ?? "";
  const saleId = await verifyState(
    secret,
    url.searchParams.get("state") ?? "",
    Date.now(),
  );
  if (!saleId) return back("connect=expired");
  const code = url.searchParams.get("code");
  if (!code) return back("connect=failed");

  try {
    const { data: sale } = await supabaseAdmin
      .from("sales")
      .select("organisation_id, disabled, administrator")
      .eq("id", Number(saleId))
      .maybeSingle();
    if (!sale?.organisation_id || sale.disabled || !sale.administrator) {
      return back("connect=failed");
    }
    const organisationId = Number(sale.organisation_id);

    const tokenResponse = await fetch(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: CLIENT_ID,
          client_secret: secret,
          redirect_uri: REDIRECT_URI,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    const token = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !token.access_token) {
      console.error(
        "LinkedIn Pages token exchange failed",
        tokenResponse.status,
      );
      return back("connect=failed");
    }
    const accessToken = String(token.access_token);
    const expiresAt = expiryFrom(Date.now(), token.expires_in).toISOString();

    // The Pages this person administers.
    const acls = await get(
      accessToken,
      "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100",
    );
    const orgIds = orgIdsFromAcls(acls);
    if (orgIds.length === 0) return back("pages=0");

    let saved = 0;
    let taken = 0;
    for (const orgId of orgIds) {
      const details = await get(
        accessToken,
        `https://api.linkedin.com/rest/organizations/${orgId}`,
      ).catch(() => ({}));
      const { error: storeError } = await supabaseAdmin.rpc(
        "linkedin_page_store",
        {
          p_organisation_id: organisationId,
          p_org_id: orgId,
          p_name: pageName(details, orgId),
          p_token: accessToken,
          p_expires_at: expiresAt,
          p_sale_id: Number(saleId),
        },
      );
      if (storeError) {
        // A Page already connected to another business is skipped; the rest are still saved.
        if (storeError.code === "42501") {
          taken++;
          continue;
        }
        throw new Error(storeError.message);
      }
      saved++;
    }
    if (saved === 0) return back("connect=page_taken");
    return back(`pages=${saved}${taken ? `&taken=${taken}` : ""}`);
  } catch (e) {
    console.error("LinkedIn Pages connect failed", (e as Error).message);
    return back("connect=failed");
  }
};

Deno.serve((req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    if (!url.pathname.endsWith("/callback")) {
      return createErrorResponse(404, "Not found");
    }
    return callback(url);
  }

  return OptionsMiddleware(req, (req) =>
    AuthMiddleware(req, (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }
        const sale = await getUserSale(user!);
        if (!sale || sale.disabled || !sale.administrator) {
          return createErrorResponse(
            403,
            "Only administrators can connect LinkedIn Pages",
          );
        }
        let input: { action?: string; org_id?: string };
        try {
          input = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid request");
        }

        if (input.action === "disconnect") {
          if (!/^\d{1,20}$/.test(String(input.org_id ?? ""))) {
            return createErrorResponse(400, "A Page is required");
          }
          await supabaseAdmin.rpc("linkedin_page_forget", {
            p_organisation_id: Number(sale.organisation_id),
            p_org_id: String(input.org_id),
          });
          return ok({ disconnected: true });
        }

        if (input.action !== "start") {
          return createErrorResponse(400, "Unknown action");
        }
        const secret = Deno.env.get("LINKEDIN_PAGES_CLIENT_SECRET") ?? "";
        if (!secret) {
          return createErrorResponse(
            503,
            "The LinkedIn Pages app secret is not set, so Pages cannot be connected yet.",
            { code: "not_configured" },
          );
        }
        const nonce = crypto.randomUUID().replaceAll("-", "");
        const state = await signState(
          secret,
          String(sale.id),
          Date.now(),
          nonce,
        );
        return ok({
          url: pagesAuthorizeUrl({
            clientId: CLIENT_ID,
            redirectUri: REDIRECT_URI,
            state,
          }),
          valid_days: 7,
        });
      }),
    ),
  );
});
