import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";
import type { RecurringItem } from "./recurring";

export const RECURRING_KEY = ["recurring_items"];

export const useRecurring = (enabled = true) =>
  useQuery({
    queryKey: RECURRING_KEY,
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("recurring_items")
        .select("*")
        .order("next_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as RecurringItem[];
    },
  });
