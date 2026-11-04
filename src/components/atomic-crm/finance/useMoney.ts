import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { MONEY_KEY, type MoneyCategory, type MoneyEntry } from "./moneyTypes";

export const useMoney = (options: {
  from?: string | null;
  to?: string | null;
  direction?: string;
  state?: string;
  category?: string;
}) =>
  useQuery({
    queryKey: [...MONEY_KEY, options],
    queryFn: async () => {
      let query = getSupabaseClient()
        .from("money_ledger")
        .select("*")
        .order("entry_date", { ascending: false })
        .order("id", { ascending: false })
        .limit(1000);
      if (options.from) query = query.gte("entry_date", options.from);
      if (options.to) query = query.lte("entry_date", options.to);
      if (options.direction) query = query.eq("direction", options.direction);
      if (options.state) query = query.eq("state", options.state);
      if (options.category) query = query.eq("category", options.category);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as MoneyEntry[];
    },
  });

export const useMoneyCategories = () =>
  useQuery({
    queryKey: ["money_categories"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("money_categories")
        .select("code, label, direction, grp, regulated, admin_only")
        .order("sort");
      if (error) throw error;
      return (data ?? []) as MoneyCategory[];
    },
  });
