import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { BILLS_KEY, type Bill } from "./billTypes";

export const useBills = (options: {
  orderId?: number;
  from?: string | null;
  to?: string | null;
  status?: string;
}) =>
  useQuery({
    queryKey: [...BILLS_KEY, options],
    queryFn: async () => {
      let query = getSupabaseClient()
        .from("bill_ledger")
        .select("*")
        .order("bill_date", { ascending: false })
        .order("id", { ascending: false })
        .limit(500);
      if (options.orderId) query = query.eq("order_id", options.orderId);
      if (options.from) query = query.gte("bill_date", options.from);
      if (options.to) query = query.lte("bill_date", options.to);
      if (options.status) query = query.eq("status", options.status);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Bill[];
    },
  });

export const useExpenseCategories = () =>
  useQuery({
    queryKey: ["expense_categories"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("expense_categories")
        .select("code, label")
        .order("sort");
      if (error) throw error;
      return (data ?? []) as { code: string; label: string }[];
    },
  });
