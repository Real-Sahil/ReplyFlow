import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";

export type BusinessRow = {
  id: number;
  name: string;
  created_at: string;
  people: number;
  administrators: string[];
};

export type NewBusinessInput = {
  organisation_name: string;
  first_name: string;
  last_name: string;
  email: string;
};

export type CreatedBusiness = {
  organisation_id: number;
  organisation_name: string;
  email: string;
  first_name: string;
  last_name: string;
  temporary_password: string;
};

export const BUSINESSES_KEY = ["platform_businesses"];

// Whether the signed-in person may set up businesses for customers (the platform_owners list). Only used to
// decide whether to show the screen; the create_business function checks it again on its own.
export const useIsPlatformOwner = (): boolean => {
  const { data } = useQuery({
    queryKey: ["is_platform_owner"],
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } =
        await getSupabaseClient().rpc("is_platform_owner");
      if (error) throw error;
      return data === true;
    },
  });
  return data === true;
};

const reason = async (error: unknown, fallback: string) => {
  try {
    const body = await (error as { context?: Response })?.context?.json();
    return (body?.message as string | undefined) ?? fallback;
  } catch {
    return fallback;
  }
};

export const useBusinessList = (enabled: boolean) =>
  useQuery({
    queryKey: BUSINESSES_KEY,
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().functions.invoke<{
        data: BusinessRow[];
      }>("create_business", { method: "GET" });
      if (error || !data)
        throw new Error(await reason(error, "Could not load the businesses."));
      return data.data;
    },
  });

export const useCreateBusiness = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewBusinessInput): Promise<CreatedBusiness> => {
      const { data, error } = await getSupabaseClient().functions.invoke<{
        data: CreatedBusiness;
      }>("create_business", { method: "POST", body: input });
      if (error || !data)
        throw new Error(await reason(error, "Could not set up the business."));
      return data.data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: BUSINESSES_KEY }),
  });
};
