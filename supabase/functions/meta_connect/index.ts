// Connects Facebook Pages with Facebook Login, so nobody has to find or paste a token.
// The person approves ReplyFlow on Facebook's own screen and ticks the Pages to connect.
// Facebook sends them back to /callback here. The server swaps that approval for Page tokens,
// stores them encrypted in Vault and subscribes each Page to our webhooks. Tokens are never
// shown to the browser.
//
// POST { action: "start" } (administrators): returns { url }, a Facebook link. Open it to
// connect now, or copy it to send to whoever runs the Page. The link works for 7 days.
// GET /callback: where Facebook returns the approval. Redirects back to the app with the outcome.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import { assertMetaOpen, recordIfActionBlock } from "../_shared/metaCircuit.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import {
  REQUIRED_PERMISSIONS,
  REQUIRED_SUBSCRIPTIONS,
} from "../meta_connection/connectionStatus.ts";
import { signState, verifyState } from "./state.ts";

const API = "v21.0";
const GRAPH = `https://graph.facebook.com/${API}`;
const APP_ID = Deno.env.get("META_APP_ID") ?? "1407701608185434";
const APP_URL =
  Deno.env.get("APP_URL") ?? "https://replyflow-nine-gamma.vercel.app";
const REDIRECT_URI = `${Deno.env.get("SUPABASE_URL")}/functions/v1/meta_connect/callback`;
const MAX_PAGE_LISTS = 10;

const ok = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const back = (query: string) =>
  Response.redirect(`${APP_URL}/#/facebook?${query}`, 302);

const dialogUrl = (state: string) =>
  `https://www.facebook.com/${API}/dialog/oauth?${new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: REDIRECT_URI,
    state,
    response_type: "code",
    scope: REQUIRED_PERMISSIONS.map((p) => p.name).join(","),
  })}`;

// One Graph call. Throws with Facebook's message when the call fails.
const graph = async (
  path: string,
  params: Record<string, string>,
  init: { method?: string; token?: string } = {},
) => {
  await assertMetaOpen();
  const url = new URL(`${GRAPH}/${path}`);
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (init.method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(params).toString();
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
  } else {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers,
    body,
    signal: AbortSignal.timeout(10000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    await recordIfActionBlock(json);
    throw new Error(json?.error?.message ?? `Facebook ${response.status}`);
  }
  return json;
};

// Lists every Page the person approved, with its Page token.
const listPages = async (userToken: string) => {
  const pages: { id: string; name: string; access_token: string }[] = [];
  let after: string | undefined;
  for (let i = 0; i < MAX_PAGE_LISTS; i++) {
    const params: Record<string, string> = {
      fields: "id,name,access_token",
      limit: "100",
      access_token: userToken,
    };
    if (after) params.after = after;
    const json = await graph("me/accounts", params);
    for (const page of json.data ?? []) {
      if (page.id && page.access_token) {
        pages.push({
          id: String(page.id),
          name: String(page.name ?? ""),
          access_token: String(page.access_token),
        });
      }
    }
    after = json.paging?.cursors?.after;
    if (!json.paging?.next || !after) break;
  }
  return pages;
};

// Subscribes one Page to the webhook fields the app uses. Returns false on failure.
const subscribePage = async (pageId: string, pageToken: string) => {
  try {
    const json = await graph(
      `${pageId}/subscribed_apps`,
      {
        subscribed_fields: REQUIRED_SUBSCRIPTIONS.map((s) => s.name).join(","),
      },
      { method: "POST", token: pageToken },
    );
    return json.success === true;
  } catch (error) {
    console.error("Subscribe failed", pageId, (error as Error).message);
    return false;
  }
};

const callback = async (url: URL) => {
  if (url.searchParams.get("error")) {
    return back("connect=cancelled");
  }
  const secret = Deno.env.get("META_APP_SECRET") ?? "";
  const saleId = await verifyState(
    secret,
    url.searchParams.get("state") ?? "",
    Date.now(),
  );
  if (!saleId) return back("connect=expired");
  const code = url.searchParams.get("code");
  if (!code) return back("connect=failed");

  try {
    // Short-lived approval, exchanged for a long-lived user token. Page tokens made from a
    // long-lived user token do not expire unless the person removes the app or changes password.
    const shortLived = await graph("oauth/access_token", {
      client_id: APP_ID,
      client_secret: secret,
      redirect_uri: REDIRECT_URI,
      code,
    });
    const longLived = await graph("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: APP_ID,
      client_secret: secret,
      fb_exchange_token: String(shortLived.access_token),
    });

    const pages = await listPages(String(longLived.access_token));
    if (pages.length === 0) return back("connect=no_pages");

    let subscribeFailed = 0;
    for (const page of pages) {
      const { error } = await supabaseAdmin.rpc("meta_page_store", {
        p_page_id: page.id,
        p_name: page.name,
        p_token: page.access_token,
      });
      if (error) throw new Error(error.message);
      if (!(await subscribePage(page.id, page.access_token))) subscribeFailed++;
    }

    // A token pasted by hand would otherwise keep winning over the connected Pages.
    await supabaseAdmin
      .from("meta_connection")
      .update({
        page_access_token: null,
        page_id: null,
        page_name: null,
        saved_by: Number(saleId),
        saved_at: new Date().toISOString(),
      })
      .eq("id", 1);

    const outcome = `connected=${pages.length}`;
    return back(
      subscribeFailed
        ? `${outcome}&subscribe_failed=${subscribeFailed}`
        : outcome,
    );
  } catch (error) {
    console.error("Connect failed", (error as Error).message);
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
            "Only administrators can connect Facebook Pages",
          );
        }
        const secret = Deno.env.get("META_APP_SECRET") ?? "";
        if (!secret) {
          return createErrorResponse(
            503,
            "The app secret is not set, so Facebook cannot be connected yet.",
            { code: "not_configured" },
          );
        }

        let input: { action?: string };
        try {
          input = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid request");
        }
        if (input.action !== "start") {
          return createErrorResponse(400, "Unknown action");
        }

        const nonce = crypto.randomUUID().replaceAll("-", "");
        const state = await signState(
          secret,
          String(sale.id),
          Date.now(),
          nonce,
        );
        return ok({ url: dialogUrl(state), valid_days: 7 });
      }),
    ),
  );
});
