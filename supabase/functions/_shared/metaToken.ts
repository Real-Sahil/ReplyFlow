import { supabaseAdmin } from "./supabaseAdmin.ts";

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

// The Page and token used when a post does not name one: the default on the list, if any.
export const getDefaultPage = async (): Promise<{
  pageId: string;
  token: string;
} | null> => {
  const { data } = await supabaseAdmin
    .from("meta_pages")
    .select("page_id")
    .eq("is_default", true)
    .maybeSingle();
  if (!data?.page_id) return null;
  const token = await getPageTokenFor(String(data.page_id));
  return token ? { pageId: String(data.page_id), token } : null;
};

// The token for functions that act for the business as a whole. The token pasted by an
// administrator wins while it is still set; then the default connected Page; then the
// META_PAGE_ACCESS_TOKEN secret, so every way of connecting still works.
export const getPageToken = async (): Promise<string | null> => {
  const { data } = await supabaseAdmin
    .from("meta_connection")
    .select("page_access_token")
    .eq("id", 1)
    .maybeSingle();
  if (data?.page_access_token) return data.page_access_token as string;
  const fallback = await getDefaultPage();
  if (fallback) return fallback.token;
  return Deno.env.get("META_PAGE_ACCESS_TOKEN") || null;
};
