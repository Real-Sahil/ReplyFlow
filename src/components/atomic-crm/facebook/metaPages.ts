// Access to the Facebook Pages the team manages. Tokens never reach the browser: the list
// comes from meta_pages_list (name and default only), and changes go through meta_pages.
import { getSupabaseClient } from "../providers/supabase/supabase";

export type ManagedPage = {
  page_id: string;
  name: string;
  is_default: boolean;
};

export const listPages = async (): Promise<ManagedPage[]> => {
  const { data, error } = await getSupabaseClient()
    .from("meta_pages_list")
    .select("page_id, name, is_default")
    .order("added_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ManagedPage[];
};

// Reads the error body the function sent back, so the person sees the reason.
export const pageError = async (error: unknown): Promise<string> => {
  const context = (error as { context?: { json?: () => Promise<unknown> } })
    ?.context;
  try {
    const body = (await context?.json?.()) as { message?: string } | undefined;
    if (body?.message) return body.message;
  } catch {
    // fall through to the generic message
  }
  return "The change could not be saved.";
};

export const managePage = async (body: Record<string, unknown>) => {
  const { data, error } = await getSupabaseClient().functions.invoke(
    "meta_pages",
    {
      method: "POST",
      body,
    },
  );
  if (error) throw new Error(await pageError(error));
  return data;
};
