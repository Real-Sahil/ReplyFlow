import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";

export type LinkedInMember = {
  name: string;
  expires_at: string;
  connected_at: string;
  scopes: string;
};

// Whether the connection was made with the permission to read ad results.
export const hasAdsScope = (scopes: string | null | undefined) =>
  (scopes ?? "").split(/[ ,]+/).includes("r_ads_reporting");

// Whole days until the token stops working, never below zero. LinkedIn tokens last about 60 days and
// cannot be renewed in the background, so the person has to connect again.
export const daysLeft = (expiresAt: string, now = Date.now()) =>
  Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000));

export const linkedInPostUrl = (urn: string) =>
  `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}/`;

// What the browser may read: the signed-in person's own connection (never the token). Row security does the filtering; the token is only ever read by the server.
export const useLinkedIn = () => {
  const member = useQuery({
    queryKey: ["linkedin_member"],
    queryFn: async (): Promise<LinkedInMember | null> => {
      const { data, error } = await getSupabaseClient()
        .from("linkedin_members")
        .select("name, expires_at, connected_at, scopes")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return {
    member: member.data ?? null,
    loading: member.isPending,
    refetch: () => {
      void member.refetch();
    },
  };
};

// What to add to the confirmation when the post had a photo: it went too, or it could not be used (LinkedIn
// takes JPEG and PNG) and the post went as text.
export const photoNote = (photo: string | undefined) =>
  photo === "sent"
    ? " with its photo"
    : photo === "skipped"
      ? " as text only (its photo could not be sent)"
      : "";
