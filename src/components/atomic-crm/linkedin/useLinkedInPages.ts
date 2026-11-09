import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";

export type LinkedInPage = {
  org_id: string;
  name: string;
  expires_at: string;
};
export type LinkedInPageSent = { post_id: number; org_id: string; urn: string };

// The business's connected LinkedIn company Pages and where posts went on them. Row security keeps
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
  const sent = useQuery({
    queryKey: ["linkedin_page_posts"],
    queryFn: async (): Promise<LinkedInPageSent[]> => {
      const { data, error } = await getSupabaseClient()
        .from("linkedin_page_posts")
        .select("post_id, org_id, urn")
        .is("removed_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });
  return {
    pages: pages.data ?? [],
    sent: sent.data ?? [],
    loading: pages.isPending,
    refetch: () => {
      void pages.refetch();
      void sent.refetch();
    },
  };
};
