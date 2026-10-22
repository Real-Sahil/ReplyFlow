import { useEffect, useState } from "react";
import { useDataProvider, useGetList, useNotify } from "ra-core";
import { Image as ImageIcon, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPrice } from "../products/formatPrice";

type MessengerMessage = {
  id: number;
  body: string | null;
  direction: "inbound" | "outbound";
  sent_at: string;
};

type SavedReply = { id: number; title: string; body: string };
type ProductChoice = {
  id: number;
  title: string;
  reference: string;
  price_pence: number | null;
  image_url: string | null;
};

const WINDOW_MS = 24 * 60 * 60 * 1000;

const send = async (
  contactId: number,
  payload: { text?: string; product_id?: number },
) => {
  const { data, error } = await getSupabaseClient().functions.invoke(
    "messenger_send",
    { method: "POST", body: { contact_id: contactId, ...payload } },
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

const fillPlaceholders = (body: string, firstName?: string) =>
  body.replace(/\{\{\s*first_name\s*\}\}/g, firstName ?? "there");

const ProductPicker = ({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (product: ProductChoice) => void;
}) => {
  const [query, setQuery] = useState("");
  const { data } = useGetList<ProductChoice>(
    "products",
    {
      filter: { active: true, ...(query ? { q: query } : {}) },
      sort: { field: "collection", order: "ASC" },
      pagination: { page: 1, perPage: 30 },
    },
    { enabled: open },
  );
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send a product</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Search by name, colour or reference"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
          {data?.map((product) => (
            <button
              key={product.id}
              type="button"
              className="flex items-center gap-3 rounded-lg p-2 text-left hover:bg-accent"
              onClick={() => onPick(product)}
            >
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="size-12 rounded-md object-cover"
                />
              ) : (
                <div className="size-12 rounded-md bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {product.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {product.reference} · {formatPrice(product.price_pence)}
                </div>
              </div>
            </button>
          ))}
          {data && data.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">
              No products found
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const MessengerConversation = ({
  contactId,
  firstName,
  markRead = false,
  embedded = false,
}: {
  contactId: number;
  firstName?: string;
  /** Marks the conversation as read for the whole team while it is open. */
  markRead?: boolean;
  /** Drops the card chrome when shown inside the inbox. */
  embedded?: boolean;
}) => {
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data, refetch } = useGetList<MessengerMessage>(
    "messenger_messages",
    {
      filter: { contact_id: contactId },
      sort: { field: "sent_at", order: "ASC" },
      pagination: { page: 1, perPage: 200 },
    },
    { refetchInterval: 15000 },
  );
  const { data: savedReplies } = useGetList<SavedReply>("saved_replies", {
    sort: { field: "title", order: "ASC" },
    pagination: { page: 1, perPage: 50 },
  });
  const latestInbound = data
    ? [...data].reverse().find((m) => m.direction === "inbound")?.sent_at
    : undefined;

  useEffect(() => {
    if (!markRead || !latestInbound) return;
    // Viewers cannot edit contacts; for them this quietly does nothing.
    void dataProvider
      .update("contacts", {
        id: contactId,
        data: { messenger_read_at: new Date().toISOString() },
        previousData: {},
      })
      .catch(() => undefined);
  }, [markRead, contactId, latestInbound, dataProvider]);

  // Hidden for contacts that never wrote to the Page on Messenger.
  if (!data?.length) return null;

  const windowEndsAt = latestInbound
    ? new Date(latestInbound).getTime() + WINDOW_MS
    : 0;
  const canReply = windowEndsAt > Date.now();

  const submit = async (payload: { text?: string; product_id?: number }) => {
    if (sending) return;
    setSending(true);
    try {
      await send(contactId, payload);
      if (payload.text) setText("");
      await refetch();
    } catch (error) {
      notify((error as Error).message, { type: "error" });
    } finally {
      setSending(false);
    }
  };

  const body = (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {!embedded && <h6 className="text-lg font-semibold">Messenger</h6>}
      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto">
        {data.map((message) => (
          <div
            key={message.id}
            className={cn(
              "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
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
                if (text.trim()) void submit({ text: text.trim() });
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            {savedReplies && savedReplies.length > 0 && (
              <select
                aria-label="Insert a saved reply"
                className="h-8 rounded-md border bg-transparent px-2 text-sm"
                value=""
                onChange={(event) => {
                  const reply = savedReplies.find(
                    (r) => String(r.id) === event.target.value,
                  );
                  if (reply) setText(fillPlaceholders(reply.body, firstName));
                }}
              >
                <option value="">Saved replies</option>
                {savedReplies.map((reply) => (
                  <option key={reply.id} value={reply.id}>
                    {reply.title}
                  </option>
                ))}
              </select>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(true)}
              disabled={sending}
            >
              <ImageIcon /> Send a product
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              Reply until{" "}
              {new Date(windowEndsAt).toLocaleString("en-GB", {
                weekday: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <Button
              size="sm"
              onClick={() => submit({ text: text.trim() })}
              disabled={sending || !text.trim()}
            >
              <Send /> Send
            </Button>
          </div>
          <ProductPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onPick={(product) => {
              setPickerOpen(false);
              void submit({
                product_id: product.id,
                text: text.trim() || undefined,
              });
            }}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          More than 24 hours have passed since their last message, so Messenger
          will not deliver a reply from here. Wait for them to write again, or
          contact them another way.
        </p>
      )}
    </div>
  );

  if (embedded) return body;
  return (
    <Card className="mt-4">
      <CardContent>{body}</CardContent>
    </Card>
  );
};
