// Facebook connection status and token management, for administrators only.
// Actions: status (check the token, permissions and Page subscriptions),
// save_token (validate and store a pasted Page token), clear_token.
// The token itself is never sent back to the browser.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import { getPageToken } from "../_shared/metaToken.ts";
import { circuitState, recordIfActionBlock } from "../_shared/metaCircuit.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import {
  cleanToken,
  compareRequirements,
  describeExpiry,
} from "./connectionStatus.ts";

const GRAPH = "https://graph.facebook.com/v21.0";
const APP_ID = Deno.env.get("META_APP_ID") ?? "1407701608185434";

const get = async (path: string, token: string) => {
  try {
    const response = await fetch(`${GRAPH}/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) await recordIfActionBlock(json);
    return { ok: response.ok, json };
  } catch {
    return {
      ok: false,
      json: { error: { message: "Could not reach Facebook" } },
    };
  }
};

const ok = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const checkConnection = async () => {
  // While Meta has blocked the Page, send no Graph traffic at all: report the block only.
  const circuit = await circuitState();
  if (circuit.blocked) {
    return {
      source: "none",
      circuit,
      secrets: {
        app_secret: !!Deno.env.get("META_APP_SECRET"),
        verify_token: !!Deno.env.get("META_VERIFY_TOKEN"),
      },
      token_valid: false,
      problem:
        "Facebook has blocked actions from this Page. Nothing is sent until you clear the block below, after checking the Page in Facebook.",
      page: null,
      saved_at: null,
      expiry: null,
      ...compareRequirements(null, null),
    };
  }
  const { data: stored } = await supabaseAdmin
    .from("meta_connection")
    .select("page_access_token, page_id, page_name, saved_at")
    .eq("id", 1)
    .maybeSingle();
  const token = await getPageToken();
  const source = stored?.page_access_token
    ? "app"
    : Deno.env.get("META_PAGE_ACCESS_TOKEN")
      ? "secret"
      : "none";
  const secrets = {
    app_secret: !!Deno.env.get("META_APP_SECRET"),
    verify_token: !!Deno.env.get("META_VERIFY_TOKEN"),
  };
  if (!token) {
    return {
      source,
      circuit,
      secrets,
      token_valid: false,
      problem: "No page token is saved yet.",
      ...compareRequirements(null, null),
    };
  }

  const appSecret = Deno.env.get("META_APP_SECRET");
  let scopes: string[] | null = null;
  let expiry: ReturnType<typeof describeExpiry> | null = null;
  let tokenValid = false;
  let problem: string | null = null;

  // debug_token needs the app's own credentials, and reports the granted scopes.
  if (appSecret) {
    const debug = await get(
      `debug_token?input_token=${encodeURIComponent(token)}`,
      `${APP_ID}|${appSecret}`,
    );
    const info = debug.json?.data;
    if (debug.ok && info) {
      tokenValid = !!info.is_valid;
      scopes = Array.isArray(info.scopes) ? info.scopes : [];
      expiry = describeExpiry(info.expires_at);
      if (!info.is_valid)
        problem =
          info.error?.message ?? "Facebook says this token is no longer valid.";
    } else {
      problem =
        debug.json?.error?.message ?? "Facebook could not check the token.";
    }
  } else {
    problem = "META_APP_SECRET is not set, so permissions cannot be checked.";
  }

  const me = await get("me?fields=id,name", token);
  const page = me.ok
    ? { id: String(me.json.id), name: String(me.json.name ?? "") }
    : null;
  if (!me.ok && !problem)
    problem = me.json?.error?.message ?? "Facebook rejected the token.";
  if (!appSecret && me.ok) tokenValid = true;

  let subscribed: string[] | null = null;
  if (page) {
    const subs = await get(`${page.id}/subscribed_apps`, token);
    if (subs.ok && Array.isArray(subs.json?.data)) {
      const ours = subs.json.data.find(
        (app: { id?: string }) => String(app.id) === APP_ID,
      );
      subscribed = ours?.subscribed_fields ?? [];
    }
  }

  return {
    source,
    secrets,
    token_valid: tokenValid,
    problem,
    page,
    saved_at: stored?.saved_at ?? null,
    expiry,
    circuit,
    ...compareRequirements(scopes, subscribed),
  };
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
            "Only administrators can manage the Facebook connection",
          );
        }

        let input: { action?: string; token?: unknown };
        try {
          input = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid request");
        }

        if (input.action === "status") return ok(await checkConnection());

        if (input.action === "clear_block") {
          await supabaseAdmin
            .from("meta_circuit")
            .update({
              blocked: false,
              reason: null,
              blocked_at: null,
              cleared_by: sale.id,
              cleared_at: new Date().toISOString(),
            })
            .eq("id", 1);
          return ok(await checkConnection());
        }

        if (input.action === "clear_token") {
          await supabaseAdmin
            .from("meta_connection")
            .update({
              page_access_token: null,
              page_id: null,
              page_name: null,
              saved_by: sale.id,
              saved_at: new Date().toISOString(),
            })
            .eq("id", 1);
          return ok(await checkConnection());
        }

        if (input.action === "save_token") {
          const token = cleanToken(input.token);
          if (!token) {
            return createErrorResponse(
              400,
              "That does not look like a Facebook token. Copy the whole value, without spaces.",
            );
          }
          const me = await get("me?fields=id,name", token);
          if (!me.ok || !me.json?.id) {
            return createErrorResponse(
              400,
              me.json?.error?.message ?? "Facebook rejected that token.",
            );
          }
          // A user token would also pass /me, but cannot post or reply as the Page.
          const appSecret = Deno.env.get("META_APP_SECRET");
          if (appSecret) {
            const debug = await get(
              `debug_token?input_token=${encodeURIComponent(token)}`,
              `${APP_ID}|${appSecret}`,
            );
            if (
              debug.ok &&
              debug.json?.data?.type &&
              debug.json.data.type !== "PAGE"
            ) {
              return createErrorResponse(
                400,
                "That is a user token. Generate the token for the Page (Messenger API settings, Generate token).",
              );
            }
          }
          await supabaseAdmin
            .from("meta_connection")
            .update({
              page_access_token: token,
              page_id: String(me.json.id),
              page_name: String(me.json.name ?? ""),
              saved_by: sale.id,
              saved_at: new Date().toISOString(),
            })
            .eq("id", 1);
          return ok(await checkConnection());
        }

        return createErrorResponse(400, "Unknown action");
      }),
    ),
  ),
);
