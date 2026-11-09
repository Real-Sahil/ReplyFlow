import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";
import type { Channel, DestinationRow } from "./destinations";

export const CHANNELS_KEY = ["social_channels"];
export const DESTINATIONS_KEY = ["post_destinations"];

// Every channel the signed-in person can use, from every platform, in one list (the social_channels view).
export const useChannels = () =>
  useQuery({
    queryKey: CHANNELS_KEY,
    queryFn: async (): Promise<Channel[]> => {
      const { data, error } = await getSupabaseClient()
        .from("social_channels")
        .select(
          "channel_key, platform, kind, external_id, name, expires_at, is_default",
        )
        .order("platform")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Channel[];
    },
  });

const COLUMNS =
  "id, post_id, channel_key, state, text_override, scheduled_for, external_id, error, posted_at";

// The destinations of the business's posts, newest posts first. One query serves the whole list; a post's own
// rows are picked out of it.
export const useDestinations = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: DESTINATIONS_KEY,
    queryFn: async (): Promise<DestinationRow[]> => {
      const { data, error } = await getSupabaseClient()
        .from("post_destinations")
        .select(COLUMNS)
        .order("post_id", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as DestinationRow[];
    },
  });
  const rows = query.data ?? [];
  return {
    rows,
    loading: query.isPending,
    forPost: (postId: number | undefined) =>
      postId === undefined ? [] : rows.filter((r) => r.post_id === postId),
    refetch: () =>
      queryClient.invalidateQueries({ queryKey: DESTINATIONS_KEY }),
  };
};
