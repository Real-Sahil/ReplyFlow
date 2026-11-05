import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";
import type { Asset, BusinessDocument } from "./paperwork";

export const PAPERWORK_KEY = ["paperwork"];

export const useBusinessDocuments = (enabled = true) =>
  useQuery({
    queryKey: [...PAPERWORK_KEY, "documents"],
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("business_documents")
        .select("*")
        .order("expires_on", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as BusinessDocument[];
    },
  });

export const useAssets = (enabled = true) =>
  useQuery({
    queryKey: [...PAPERWORK_KEY, "assets"],
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("assets")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Asset[];
    },
  });
