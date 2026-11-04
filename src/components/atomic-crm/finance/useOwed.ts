import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";
import type { OwedByCustomer, OwedToSupplier } from "./owed";

export const OWED_KEY = ["owed"];

export const useOwedByCustomers = () =>
  useQuery({
    queryKey: [...OWED_KEY, "customers"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("owed_by_customers")
        .select("*")
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as OwedByCustomer[];
    },
  });

export const useOwedToSuppliers = () =>
  useQuery({
    queryKey: [...OWED_KEY, "suppliers"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("owed_to_suppliers")
        .select("*")
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as OwedToSupplier[];
    },
  });
