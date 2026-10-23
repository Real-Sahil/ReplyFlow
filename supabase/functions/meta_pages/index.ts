// Manages the Facebook Pages the team can post to and reply from (see meta_pages).
// Administrators only. A Page is added with its access token; Facebook confirms the token is
// a Page token before anything is saved, so a wrong or personal token cannot be stored.
// Body: { action: "add", token } | { action: "default", page_id } | { action: "remove", page_id }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";

const GRAPH = "https://graph.facebook.com/v21.0";

const ok = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

// Facebook returns the Page's id and name for a Page token. A personal token returns a person.
const checkPageToken = async (token: string) => {
  const response = await fetch(`${GRAPH}/me?fields=id,name`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json?.id) return null;
  return { pageId: String(json.id), name: String(json.name ?? "") };
};

// True when the Page is on this organisation's list. Pages of other organisations are invisible.
const ownsPage = async (pageId: string, organisationId: number) => {
  const { data } = await supabaseAdmin
    .from("meta_pages")
    .select("page_id")
    .eq("page_id", pageId)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  return !!data;
};

const setDefault = async (pageId: string, organisationId: number) => {
  await supabaseAdmin
    .from("meta_pages")
    .update({ is_default: false })
    .eq("organisation_id", organisationId)
    .eq("is_default", true);
  const { error, count } = await supabaseAdmin
    .from("meta_pages")
    .update({ is_default: true }, { count: "exact" })
    .eq("organisation_id", organisationId)
    .eq("page_id", pageId);
  return !error && (count ?? 1) > 0;
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
            "Only administrators can manage Pages",
          );
        }

        let input: { action?: unknown; token?: unknown; page_id?: unknown };
        try {
          input = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid request");
        }

        if (input.action === "add") {
          const token =
            typeof input.token === "string" ? input.token.trim() : "";
          if (token.length < 20) {
            return createErrorResponse(400, "Paste the Page access token.");
          }
          const page = await checkPageToken(token);
          if (!page) {
            return createErrorResponse(
              422,
              "Facebook did not accept that as a Page token. Generate a Page token for this Page and try again.",
              { code: "not_a_page_token" },
            );
          }
          const { error } = await supabaseAdmin.rpc("meta_page_store", {
            p_page_id: page.pageId,
            p_name: page.name,
            p_token: token,
            p_organisation_id: Number(sale.organisation_id),
          });
          if (error) {
            return createErrorResponse(500, "The Page could not be saved");
          }
          return ok({ page_id: page.pageId, name: page.name });
        }

        const pageId = typeof input.page_id === "string" ? input.page_id : "";
        if (!pageId) return createErrorResponse(400, "Choose a Page.");

        if (input.action === "default") {
          if (!(await ownsPage(pageId, Number(sale.organisation_id)))) {
            return createErrorResponse(404, "That Page is not on the list");
          }
          if (!(await setDefault(pageId, Number(sale.organisation_id)))) {
            return createErrorResponse(404, "That Page is not on the list");
          }
          return ok({ page_id: pageId });
        }

        if (input.action === "remove") {
          if (!(await ownsPage(pageId, Number(sale.organisation_id)))) {
            return createErrorResponse(404, "That Page is not on the list");
          }
          const { data: removed, error } = await supabaseAdmin.rpc(
            "meta_page_forget",
            { p_page_id: pageId },
          );
          if (error || !removed) {
            return createErrorResponse(404, "That Page is not on the list");
          }
          return ok({ removed: pageId });
        }

        return createErrorResponse(400, "A known action is required");
      }),
    ),
  ),
);
