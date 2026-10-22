import { useState } from "react";
import { useGetList, useNotify } from "ra-core";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { getSupabaseClient } from "../providers/supabase/supabase";

type MessengerMessage = {
  id: number;
  body: string | null;
  direction: "inbound" | "outbound";
  sent_at: string;
};

const WINDOW_MS = 24 * 60 * 60 * 1000;

const sendReply = async (contactId: number, text: string) => {
  const { data, error } = await getSupabaseClient().functions.invoke(
    "messenger_send",
    { method: "POST", body: { contact_id: contactId, text } },
  );
  if (error) {
    const details = await (async () => {
      try {
        return (await error.context?.json()) ?? {};
      } catch {
        return {};
      }
    })();
    throw new Error(details.message || "Could not send the message");
  }
  return data;
};

export const MessengerConversation = ({ contactId }: { contactId: number }) => {
  const notify = useNotify();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const { data, refetch } = useGetList<MessengerMessage>(
    "messenger_messages",
    {
      filter: { contact_id: contactId },
      sort: { field: "sent_at", order: "ASC" },
      pagination: { page: 1, perPage: 200 },
    },
    { refetchInterval: 15000 },
  );

  // Hidden for contacts that never wrote to the Page on Messenger.
  if (!data?.length) return null;

  const lastInbound = [...data]
    .reverse()
    .find((message) => message.direction === "inbound");
  const windowEndsAt = lastInbound
    ? new Date(lastInbound.sent_at).getTime() + WINDOW_MS
    : 0;
  const canReply = windowEndsAt > Date.now();

  const submit = async () => {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    try {
      await sendReply(contactId, message);
      setText("");
      await refetch();
    } catch (error) {
      notify((error as Error).message, { type: "error" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="mt-4">
      <CardContent className="flex flex-col gap-3">
        <h6 className="text-lg font-semibold">Messenger</h6>
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {data.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                message.direction === "inbound"
                  ? "self-start bg-muted"
                  : "self-end bg-primary text-primary-foreground",
              )}
              title={new Date(message.sent_at).toLocaleString("en-GB")}
            >
              {message.body}
            </div>
          ))}
        </div>
        {canReply ? (
          <div className="flex flex-col gap-2">
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Reply on Messenger"
              maxLength={2000}
              rows={3}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                You can reply until{" "}
                {new Date(windowEndsAt).toLocaleString("en-GB", {
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                . Ctrl or Cmd + Enter sends.
              </span>
              <Button
                size="sm"
                onClick={submit}
                disabled={sending || !text.trim()}
              >
                <Send /> Send
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            More than 24 hours have passed since their last message, so
            Messenger will not deliver a reply from here. Wait for them to write
            again, or contact them another way.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
