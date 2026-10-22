import { useState } from "react";
import { useGetIdentity, useGetList } from "ra-core";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { MessengerConversation } from "../contacts/MessengerConversation";

type InboxRow = {
  id: number;
  contact_id: number;
  first_name: string;
  last_name: string | null;
  last_body: string | null;
  last_direction: "inbound" | "outbound";
  last_sent_at: string;
  window_open: boolean;
  unread: boolean;
};

type Filter = "all" | "unread" | "open";

const timeLabel = (iso: string) => {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

export const InboxList = () => {
  const { identity } = useGetIdentity();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const { data } = useGetList<InboxRow>(
    "messenger_inbox",
    {
      sort: { field: "last_sent_at", order: "DESC" },
      pagination: { page: 1, perPage: 100 },
    },
    { refetchInterval: 15000 },
  );
  if (!identity) return null;

  const rows = (data ?? [])
    .map((row) => ({ ...row, id: row.contact_id }))
    .filter((row) => {
      if (filter === "unread" && !row.unread) return false;
      if (filter === "open" && !row.window_open) return false;
      const name = `${row.first_name} ${row.last_name ?? ""}`.toLowerCase();
      const needle = search.trim().toLowerCase();
      return (
        !needle ||
        name.includes(needle) ||
        (row.last_body ?? "").toLowerCase().includes(needle)
      );
    });
  const active = rows.find((row) => row.contact_id === selected) ?? rows[0];

  return (
    <div className="mt-2 grid h-[calc(100vh-9rem)] min-h-96 grid-cols-1 gap-3 md:grid-cols-[340px_1fr]">
      <Card
        className={cn(
          "gap-0 overflow-hidden py-0",
          selected && "hidden md:flex",
        )}
      >
        <div className="flex flex-col gap-2 border-b p-3">
          <Input
            placeholder="Search conversations"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="flex gap-1">
            {(
              [
                ["all", "All"],
                ["unread", "Unread"],
                ["open", "Can reply"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? "default" : "outline"}
                onClick={() => setFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              {data?.length
                ? "No conversations match."
                : "No Messenger conversations yet. New messages to your Page appear here."}
            </p>
          )}
          {rows.map((row) => (
            <button
              key={row.contact_id}
              type="button"
              onClick={() => setSelected(row.contact_id)}
              className={cn(
                "flex w-full flex-col gap-0.5 border-b px-3 py-2.5 text-left hover:bg-accent",
                active?.contact_id === row.contact_id && "bg-accent",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "truncate text-sm",
                    row.unread ? "font-semibold" : "font-medium",
                  )}
                >
                  {row.first_name} {row.last_name}
                </span>
                {row.unread && (
                  <span className="size-2 shrink-0 rounded-full bg-primary" />
                )}
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {timeLabel(row.last_sent_at)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="line-clamp-1 flex-1 text-xs text-muted-foreground">
                  {row.last_direction === "outbound" ? "You: " : ""}
                  {row.last_body}
                </span>
                {!row.window_open && (
                  <Badge variant="outline">24h passed</Badge>
                )}
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card className={cn("min-h-0 p-4", !selected && "hidden md:flex")}>
        {active ? (
          <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden"
                onClick={() => setSelected(null)}
              >
                Back
              </Button>
              <h2 className="text-lg font-semibold">
                {active.first_name} {active.last_name}
              </h2>
              <Button asChild variant="outline" size="sm" className="ml-auto">
                <Link to={`/contacts/${active.contact_id}/show`}>
                  Open contact
                </Link>
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <MessengerConversation
                key={active.contact_id}
                contactId={active.contact_id}
                firstName={active.first_name}
                markRead
                embedded
              />
            </div>
          </div>
        ) : (
          <p className="m-auto text-sm text-muted-foreground">
            Select a conversation
          </p>
        )}
      </Card>
    </div>
  );
};
