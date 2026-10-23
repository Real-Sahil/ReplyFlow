import { supabaseAdmin } from "./supabaseAdmin.ts";

// The token an administrator pasted into the app wins; the META_PAGE_ACCESS_TOKEN
// secret is the fallback, so either way of setting it works.
export const getPageToken = async (): Promise<string | null> => {
  const { data } = await supabaseAdmin
    .from("meta_connection")
    .select("page_access_token")
    .eq("id", 1)
    .maybeSingle();
  return (
    (data?.page_access_token as string | null) ||
    Deno.env.get("META_PAGE_ACCESS_TOKEN") ||
    null
  );
};

// The token for one Page the team has added (see meta_pages). Null if that Page is not on
// the list.
export const getPageTokenFor = async (
  pageId: string,
): Promise<string | null> => {
  const { data } = await supabaseAdmin
    .from("meta_pages")
    .select("access_token")
    .eq("page_id", pageId)
    .maybeSingle();
  return (data?.access_token as string | null) ?? null;
};

// The Page and token used when a post does not name one: the default on the list, if any.
export const getDefaultPage = async (): Promise<{
  pageId: string;
  token: string;
} | null> => {
  const { data } = await supabaseAdmin
    .from("meta_pages")
    .select("page_id, access_token")
    .eq("is_default", true)
    .maybeSingle();
  if (!data?.access_token) return null;
  return {
    pageId: String(data.page_id),
    token: String(data.access_token),
  };
};
