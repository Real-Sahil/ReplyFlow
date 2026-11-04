import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";
import type { Leave, Person, PersonDocument } from "./people";

export const PEOPLE_KEY = ["people"];

export const usePeople = (enabled = true) =>
  useQuery({
    queryKey: [...PEOPLE_KEY, "people"],
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("people")
        .select("*")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as unknown as Person[];
    },
  });

export const usePersonDocuments = (enabled = true) =>
  useQuery({
    queryKey: [...PEOPLE_KEY, "documents"],
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("person_documents")
        .select("*")
        .order("expires_on", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as PersonDocument[];
    },
  });

export const usePersonLeave = (enabled = true) =>
  useQuery({
    queryKey: [...PEOPLE_KEY, "leave"],
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("person_leave")
        .select("*")
        .order("from_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Leave[];
    },
  });
