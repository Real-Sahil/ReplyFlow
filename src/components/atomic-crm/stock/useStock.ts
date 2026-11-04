import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { STOCK_KEY, type StockLevel, type StockMovement } from "./stockTypes";

export const useStockLevels = () =>
  useQuery({
    queryKey: [...STOCK_KEY, "levels"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("stock_levels")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as StockLevel[];
    },
  });

export const useStockMovements = (itemId: number | null) =>
  useQuery({
    queryKey: [...STOCK_KEY, "movements", itemId],
    enabled: itemId !== null,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("stock_movements")
        .select("*")
        .eq("item_id", itemId!)
        .order("moved_on", { ascending: false })
        .order("id", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as StockMovement[];
    },
  });
