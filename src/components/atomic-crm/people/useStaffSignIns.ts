import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";

export type StaffSignIn = { id: number; first_name: string; last_name: string };

// The staff sign-ins of the business (the expenses, hours and holiday login), so one can be linked to a
// person in People. Only administrators can read the list of sign-ins.
export const useStaffSignIns = (): StaffSignIn[] => {
  const { data } = useQuery({
    queryKey: ["staff_sign_ins"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("sales")
        .select("id, first_name, last_name")
        .eq("role", "claimant")
        .eq("disabled", false)
        .order("first_name");
      if (error) throw error;
      return (data ?? []) as StaffSignIn[];
    },
  });
  return data ?? [];
};
