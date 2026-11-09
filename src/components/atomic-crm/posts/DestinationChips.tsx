import { Facebook, Linkedin } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  stateText,
  stateTone,
  type Channel,
  type DestinationRow,
} from "./destinations";

const CHIP = {
  good: "border-primary/40 bg-primary/10 text-primary",
  wait: "border-border bg-muted text-muted-foreground",
  bad: "border-destructive/40 bg-destructive/10 text-destructive",
  quiet: "border-border text-muted-foreground line-through",
};

// A small tag for each place a post is going or has been: the platform, the channel's name, and its state in the
// tooltip, coloured so a failure stands out in the list.
export const DestinationChips = ({
  rows,
  channels,
  facebook,
}: {
  rows: DestinationRow[];
  channels: Channel[];
  // Facebook is the post's main destination until it becomes an ordinary one.
  facebook?: { name: string; state: string } | null;
}) => {
  const visible = rows.filter((r) => r.state !== "removed");
  if (!visible.length && !facebook) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {facebook ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
            facebook.state === "On Facebook" ? CHIP.good : CHIP.wait,
          )}
          title={facebook.state}
        >
          <Facebook className="size-3" aria-hidden />
          {facebook.name}
        </span>
      ) : null}
      {visible.map((row) => {
        const channel = channels.find((c) => c.channel_key === row.channel_key);
        return (
          <span
            key={row.id}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
              CHIP[stateTone(row.state)],
            )}
            title={stateText(row)}
          >
            <Linkedin className="size-3" aria-hidden />
            {channel?.kind === "profile"
              ? "Your profile"
              : (channel?.name ?? "LinkedIn Page")}
          </span>
        );
      })}
    </span>
  );
};
