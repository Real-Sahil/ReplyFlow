import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";

// True once the business has records (invoices, money entries, bills, claims, orders or payments). From then on
// its currency cannot change, because that would relabel what is already there. The database enforces it; this
// lets Settings say so before anyone tries.
export const useCurrencyLocked = (): boolean => {
  const { data } = useQuery({
    queryKey: ["currency_locked"],
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc(
        "business_currency_locked",
      );
      if (error) throw error;
      return data === true;
    },
  });
  return data === true;
};
