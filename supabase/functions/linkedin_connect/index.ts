// Connects a staff member's own LinkedIn account, so they can post to their profile from ReplyFlow.
// The person approves ReplyFlow on LinkedIn's own screen. LinkedIn sends them back to /callback here,
// the server swaps that approval for an access token and keeps it encrypted in Vault. The token is
// never shown to the browser. LinkedIn tokens last about 60 days and cannot be renewed in the
// background, so the expiry is stored and the app asks the person to reconnect.
//
// POST { action: "start" }: returns { url }, LinkedIn's approval link (valid for 7 days).
// POST { action: "disconnect" }: forgets the person's LinkedIn connection.
// GET /callback: where LinkedIn returns the approval. Redirects back to the app with the outcome.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { signState, verifyState } from "../meta_connect/state.ts";
import { authorizeUrl, expiryFrom, outcomeFor } from "./rules.ts";

const CLIENT_ID = Deno.env.get("LINKEDIN_CLIENT_ID") ?? "78o4205ivav2bp";
const APP_URL = Deno.env.get("APP_URL") ?? "https://replyflow-sahil.vercel.app";
const REDIRECT_URI = `${Deno.env.get("SUPABASE_URL")}/functions/v1/linkedin_connect/callback`;

const ok = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const back = (query: string) =>
  Response.redirect(`${APP_URL}/app#/linkedin?${query}`, 302);

const callback = async (url: URL) => {
  const error = url.searchParams.get("error");
  if (error) return back(outcomeFor(error));

  const secret = Deno.env.get("LINKEDIN_CLIENT_SECRET") ?? "";
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
      .select("organisation_id, disabled")
      .eq("id", Number(saleId))
      .maybeSingle();
    if (!sale?.organisation_id || sale.disabled) return back("connect=failed");

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
      console.error("LinkedIn token exchange failed", tokenResponse.status);
      return back("connect=failed");
    }

    // Who the person is on LinkedIn. Posting needs their LinkedIn id.
    const profileResponse = await fetch(
      "https://api.linkedin.com/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(10000),
      },
    );
    const profile = await profileResponse.json().catch(() => ({}));
    if (!profileResponse.ok || !profile.sub) {
      console.error("LinkedIn profile read failed", profileResponse.status);
      return back("connect=scope");
    }

    const { error: storeError } = await supabaseAdmin.rpc(
      "linkedin_member_store",
      {
        p_sale_id: Number(saleId),
        p_organisation_id: Number(sale.organisation_id),
        p_member_id: String(profile.sub),
        p_name: String(profile.name ?? ""),
        p_token: String(token.access_token),
        p_expires_at: expiryFrom(Date.now(), token.expires_in).toISOString(),
      },
    );
    if (storeError) throw new Error(storeError.message);
    return back("connected=1");
  } catch (e) {
    console.error("LinkedIn connect failed", (e as Error).message);
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
        if (!sale || sale.disabled) {
          return createErrorResponse(403, "Not allowed");
        }
        let input: { action?: string };
        try {
          input = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid request");
        }

        if (input.action === "disconnect") {
          await supabaseAdmin.rpc("linkedin_member_forget", {
            p_organisation_id: Number(sale.organisation_id),
            p_sale_id: Number(sale.id),
          });
          return ok({ disconnected: true });
        }

        if (input.action !== "start") {
          return createErrorResponse(400, "Unknown action");
        }
        const secret = Deno.env.get("LINKEDIN_CLIENT_SECRET") ?? "";
        if (!secret) {
          return createErrorResponse(
            503,
            "The LinkedIn app secret is not set, so LinkedIn cannot be connected yet.",
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
          url: authorizeUrl({
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
