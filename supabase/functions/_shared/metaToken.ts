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
