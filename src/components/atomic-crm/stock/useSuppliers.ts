import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";
import type { ItemExtras, SupplierInfo } from "./shopping";

export const SUPPLIERS_KEY = ["suppliers"];

export const useSuppliers = () =>
  useQuery({
    queryKey: SUPPLIERS_KEY,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("suppliers")
        .select("id, name, contact_name, phone, email, terms, notes, active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as (SupplierInfo & {
        notes: string | null;
      })[];
    },
  });

// Which supplier each stock item is bought from, and how much to buy.
export const useItemExtras = () =>
  useQuery({
    queryKey: [...SUPPLIERS_KEY, "item_extras"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("stock_items")
        .select("id, supplier_id, reorder_quantity");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: Number(r.id),
        supplier_id: r.supplier_id == null ? null : Number(r.supplier_id),
        reorder_quantity:
          r.reorder_quantity == null ? null : Number(r.reorder_quantity),
      })) as ItemExtras[];
    },
  });
