import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";
import type { HolidayRequest, TimeEntry } from "./time";

export const TIME_KEY = ["time_entries"];
export const HOLIDAY_KEY = ["holiday_requests"];

// An administrator sees everyone's, a staff sign-in only its own: the database decides.
export const useTimeEntries = (enabled = true) =>
  useQuery({
    queryKey: TIME_KEY,
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("time_entries")
        .select(
          "*, staff:sales!time_entries_staff_id_fkey(first_name,last_name)",
        )
        .order("work_date", { ascending: false })
        .order("id", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as TimeEntry[];
    },
  });

export const useHolidayRequests = (enabled = true) =>
  useQuery({
    queryKey: HOLIDAY_KEY,
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("holiday_requests")
        .select(
          "*, staff:sales!holiday_requests_staff_id_fkey(first_name,last_name)",
        )
        .order("from_date", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as HolidayRequest[];
    },
  });
