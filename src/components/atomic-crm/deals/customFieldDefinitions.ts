import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";

// A field each deal category adds on top of the standard deal fields. Definitions
// live in custom_field_definitions; values are stored per deal in deals.custom_fields.
export type CustomFieldDefinition = {
  id: number;
  pipeline: string;
  field_key: string;
  label: string;
  field_type: "text" | "number" | "date" | "select";
  options: string[];
  position: number;
};

export const useCustomFieldDefinitions = (pipeline?: string) =>
  useQuery({
    queryKey: ["custom_field_definitions", pipeline ?? ""],
    enabled: !!pipeline,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("custom_field_definitions")
        .select("*")
        .eq("pipeline", pipeline)
        .order("position");
      if (error) throw error;
      return (data ?? []) as CustomFieldDefinition[];
    },
  });
