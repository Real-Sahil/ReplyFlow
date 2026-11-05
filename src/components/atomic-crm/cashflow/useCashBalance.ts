import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";

export type CashBalance = {
  id: number;
  balance_pence: number;
  as_at: string;
  note: string | null;
  created_at: string;
};

export const CASH_BALANCE_KEY = ["cash_balances"];

// The most recent balance an administrator entered, or null if none has been.
export const useCashBalance = (enabled = true) =>
  useQuery({
    queryKey: CASH_BALANCE_KEY,
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("cash_balances")
        .select("id, balance_pence, as_at, note, created_at")
        .order("as_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as CashBalance | null;
    },
  });
