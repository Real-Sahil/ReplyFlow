import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";

export type LinkedInPage = {
  org_id: string;
  name: string;
  expires_at: string;
};

// The business's connected LinkedIn company Pages. Row security keeps
// this to the signed-in person's own business; tokens are only ever read by the server.
export const useLinkedInPages = () => {
  const pages = useQuery({
    queryKey: ["linkedin_pages"],
    queryFn: async (): Promise<LinkedInPage[]> => {
      const { data, error } = await getSupabaseClient()
        .from("linkedin_pages")
        .select("org_id, name, expires_at")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  return {
    pages: pages.data ?? [],
    loading: pages.isPending,
    refetch: () => {
      void pages.refetch();
    },
  };
};
