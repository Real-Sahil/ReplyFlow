import { supabaseAdmin } from "./supabaseAdmin.ts";

// Mere & Row is organisation 1. Only it may use the older shared token below.
const MERE_AND_ROW = 1;

// The token for one Page the team has connected (see meta_pages). Tokens live in Supabase
// Vault and are decrypted only here, on the server. Null if that Page is not on the list.
export const getPageTokenFor = async (
  pageId: string,
): Promise<string | null> => {
  const { data, error } = await supabaseAdmin.rpc("meta_page_token", {
    p_page_id: pageId,
  });
  if (error) {
    console.error("Page token lookup failed", error.message);
    return null;
  }
  return (data as string | null) ?? null;
};

// The default Page of one organisation, with its token. Null when that organisation has none.
export const getDefaultPage = async (
  organisationId: number,
): Promise<{
  pageId: string;
  token: string;
} | null> => {
  const { data } = await supabaseAdmin
    .from("meta_pages")
    .select("page_id")
    .eq("organisation_id", organisationId)
    .eq("is_default", true)
    .maybeSingle();
  if (!data?.page_id) return null;
  const token = await getPageTokenFor(String(data.page_id));
  return token ? { pageId: String(data.page_id), token } : null;
};

// The token that acts for one organisation as a whole: its default Page. Only Mere & Row
// also falls back to the token pasted by hand and the META_PAGE_ACCESS_TOKEN secret, which
// were set up before several businesses existed. No other organisation ever gets them.
export const getPageToken = async (
  organisationId: number,
): Promise<string | null> => {
  const fallback = await getDefaultPage(organisationId);
  if (fallback) return fallback.token;
  if (organisationId !== MERE_AND_ROW) return null;

  const { data } = await supabaseAdmin
    .from("meta_connection")
    .select("page_access_token")
    .eq("id", 1)
    .maybeSingle();
  if (data?.page_access_token) return data.page_access_token as string;
  return Deno.env.get("META_PAGE_ACCESS_TOKEN") || null;
};
