import { supabaseAdmin } from "./supabaseAdmin.ts";

// The name a business goes by: its trading name, then its legal name, then its organisation
// name. Used wherever the server speaks for a business (customer pages, AI writing), so no text
// ever names another business. Null when nothing is set; callers then leave the name out.
export const businessNameOf = async (
  organisationId: number,
): Promise<string | null> => {
  const { data: settings } = await supabaseAdmin
    .from("business_settings")
    .select("trading_name, legal_name")
    .eq("organisation_id", organisationId)
    .maybeSingle();
  const fromSettings = settings?.trading_name || settings?.legal_name;
  if (fromSettings) return String(fromSettings);
  const { data: organisation } = await supabaseAdmin
    .from("organisations")
    .select("name")
    .eq("id", organisationId)
    .maybeSingle();
  return organisation?.name ? String(organisation.name) : null;
};
