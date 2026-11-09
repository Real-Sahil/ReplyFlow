import type { ReactNode } from "react";
import { Linkedin } from "lucide-react";
import { Link } from "react-router";

import { cn } from "@/lib/utils";

import {
  health,
  stateText,
  stateTone,
  type Channel,
  type DestinationRow,
} from "./destinations";

const TONE = {
  good: "text-primary",
  wait: "text-muted-foreground",
  bad: "text-destructive",
  quiet: "text-muted-foreground",
};

// One channel in a list of where a post can go: a tick box (unless it has already been posted), the channel's
// name, what the person needs to know (where it stands, or that the connection needs renewing), and any actions.
export const ChannelRow = ({
  channel,
  row,
  checked,
  onCheck,
  locked,
  actions,
}: {
  channel: Channel;
  row?: DestinationRow;
  checked: boolean;
  onCheck: (on: boolean) => void;
  locked?: boolean;
  actions?: ReactNode;
}) => {
  const posted = row?.state === "published";
  const expired = health(channel.expires_at) === "expired";
  const soon = health(channel.expires_at) === "soon";
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <label className="flex min-w-0 items-center gap-3">
        {posted ? (
          <span className="size-4 shrink-0" aria-hidden />
        ) : (
          <input
            type="checkbox"
            className="size-4 shrink-0"
            checked={checked}
            disabled={locked || (expired && !checked)}
            onChange={(e) => onCheck(e.target.checked)}
          />
        )}
        <Linkedin
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {channel.name || "LinkedIn"}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {channel.kind === "profile" ? "your profile" : "company Page"}
            </span>
          </span>
          <span
            className={cn(
              "block text-xs",
              row ? TONE[stateTone(row.state)] : "text-muted-foreground",
            )}
          >
            {expired ? (
              <>
                Connection expired.{" "}
                <Link to="/linkedin" className="underline">
                  Connect again
                </Link>
              </>
            ) : row && row.state !== "removed" ? (
              stateText(row)
            ) : (
              "Not posted"
            )}
            {soon && !expired ? (
              <>
                {" · "}
                <Link to="/linkedin" className="underline">
                  Connection ends soon
                </Link>
              </>
            ) : null}
          </span>
        </span>
      </label>
      <div className="flex shrink-0 items-center gap-1">{actions}</div>
    </li>
  );
};
