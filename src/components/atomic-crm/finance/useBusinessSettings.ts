import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";

export type BusinessSettings = {
  organisation_id: number;
  legal_name: string | null;
  trading_name: string | null;
  address: string | null;
  company_number: string | null;
  vat_registered: boolean;
  vat_number: string | null;
  vat_scheme: "standard" | "flat_rate" | "cash";
  flat_rate_percent: number | null;
  prices_include_vat: boolean;
  invoice_prefix: string;
  next_invoice_number: number;
  accounting_codes: {
    sales?: string;
    bills?: Record<string, string>;
    bank?: string;
  };
};

export const BUSINESS_SETTINGS_KEY = ["business_settings"];

// The signed-in person's business details and VAT choices. Null until they have been saved
// once, which means VAT is off.
export const useBusinessSettings = () =>
  useQuery({
    queryKey: BUSINESS_SETTINGS_KEY,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("business_settings")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as BusinessSettings | null;
    },
  });
