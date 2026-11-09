import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";

export type AdSpendRow = { day: string; spend: number; currency: string };

// Recent LinkedIn ad spend per day, saved by the daily LinkedIn check. Administrators only: the database
// hides it from everyone else, and a business that has not connected LinkedIn for ads simply has none.
export const useLinkedInAdSpend = (enabled: boolean) =>
  useQuery({
    queryKey: ["linkedin_ad_spend", "recent"],
    enabled,
    queryFn: async (): Promise<AdSpendRow[]> => {
      const since = new Date(Date.now() - 20 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const { data, error } = await getSupabaseClient()
        .from("linkedin_ad_spend")
        .select("day, spend, currency")
        .gte("day", since);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        day: String(r.day),
        spend: Number(r.spend),
        currency: String(r.currency ?? ""),
      }));
    },
  });
