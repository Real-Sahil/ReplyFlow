import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";
import type { Claim } from "./claims";

export const CLAIMS_KEY = ["expense-claims"];

// An administrator sees every claim of the business, a claimant only its own: the database decides.
export const useClaims = (enabled = true) =>
  useQuery({
    queryKey: CLAIMS_KEY,
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("expense_claims")
        .select(
          "*, claimant:sales!expense_claims_claimant_id_fkey(first_name,last_name)",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Claim[];
    },
  });
