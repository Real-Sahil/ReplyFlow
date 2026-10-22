import { useQuery } from "@tanstack/react-query";
import { useGetList } from "ra-core";
import { History } from "lucide-react";

import { cn } from "@/lib/utils";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { findDealLabel } from "./dealUtils";

type TimelineEvent = {
  event_id: string;
  happened_at: string;
  kind: "created" | "stage" | "note" | "message" | "comment";
  body: string | null;
  detail: {
    from?: string | null;
    to?: string | null;
    direction?: "inbound" | "outbound";
    actor_id?: number | null;
    status?: string;
    author?: string | null;
    reply?: string | null;
  } | null;
};

type Staff = { id: number; first_name: string; last_name: string };

const kindLabel = (event: TimelineEvent) => {
  switch (event.kind) {
    case "created":
      return "Deal created";
    case "stage":
      return "Stage changed";
    case "note":
      return "Note";
    case "message":
      return event.detail?.direction === "outbound"
        ? "Reply sent"
        : "Customer message";
    case "comment":
      return "Comment on a post";
  }
};

// Each row says where it came from, so a message thread and a Page comment
// are easy to tell apart at a glance.
const kindTone: Record<TimelineEvent["kind"], string> = {
  created: "bg-emerald-500",
  stage: "bg-violet-500",
  note: "bg-muted-foreground",
  message: "bg-sky-500",
  comment: "bg-amber-500",
};

export const DealTimeline = ({ dealId }: { dealId: number | string }) => {
  const { dealStages } = useConfigurationContext();
  const { data: staff } = useGetList<Staff>("sales", {
    pagination: { page: 1, perPage: 100 },
  });

  const { data, isPending, error } = useQuery({
    queryKey: ["deal_timeline", String(dealId)],
    queryFn: async () => {
      const { data: rows, error: rpcError } = await getSupabaseClient().rpc(
        "deal_timeline",
        { p_deal_id: Number(dealId) },
      );
      if (rpcError) throw rpcError;
      return (rows ?? []) as TimelineEvent[];
    },
  });

  const who = (id?: number | null) => {
    if (!id) return null;
    const person = staff?.find((s) => s.id === id);
    return person ? `${person.first_name} ${person.last_name}` : null;
  };

  const stageName = (value?: string | null) =>
    (value && findDealLabel(dealStages, value)) || value || "none";

  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <History className="size-4 text-muted-foreground" />
        Timeline
      </h3>

      {isPending && (
        <p className="text-sm text-muted-foreground" role="status">
          Loading the timeline…
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive">
          The timeline could not be loaded.
        </p>
      )}
      {data && data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing has happened yet.
        </p>
      )}

      {data && data.length > 0 && (
        <ol className="flex flex-col">
          {data
            // Notes are listed in the editable notes section below, so skip them here.
            .filter((event) => event.kind !== "note")
            .map((event) => {
              const actor =
                event.kind === "note" ||
                event.kind === "stage" ||
                event.kind === "message"
                  ? who(event.detail?.actor_id)
                  : null;
              return (
                <li
                  key={event.event_id}
                  className="relative grid grid-cols-[12px_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1.5 size-2.5 rounded-full",
                      kindTone[event.kind],
                    )}
                  />
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {kindLabel(event)}
                      </span>
                      {event.kind === "comment" && event.detail?.author && (
                        <span>· {event.detail.author}</span>
                      )}
                      {actor && <span>· {actor}</span>}
                      <time
                        dateTime={event.happened_at}
                        className="tabular-nums"
                      >
                        {new Date(event.happened_at).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>

                    {event.kind === "stage" && (
                      <p className="text-sm">
                        {stageName(event.detail?.from)} →{" "}
                        {stageName(event.detail?.to)}
                      </p>
                    )}
                    {event.body && (
                      <p className="whitespace-pre-line break-words text-sm">
                        {event.body}
                      </p>
                    )}
                    {event.kind === "comment" && event.detail?.reply && (
                      <p className="whitespace-pre-line break-words border-l-2 pl-3 text-sm text-muted-foreground">
                        Replied: {event.detail.reply}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
        </ol>
      )}
    </section>
  );
};
