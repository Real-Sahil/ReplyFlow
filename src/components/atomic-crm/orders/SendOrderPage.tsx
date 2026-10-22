import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNotify, useRecordContext, useRefresh } from "ra-core";
import { MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import { send } from "../contacts/messengerSend";
import { getSupabaseClient } from "../providers/supabase/supabase";
import {
  MESSENGER_TEXT_LIMIT,
  orderPageMessage,
  trackingLink,
} from "./customerPageMessage";

const DAY_MS = 24 * 60 * 60 * 1000;

export type OrderForSend = {
  id: number;
  reference: string;
  status: string;
  contact_id: number | null;
  tracking_token: string;
};

// Only confirmed or later orders have a page the customer can open.
const isLive = (status: string) =>
  status !== "quoted" && status !== "cancelled";

// Opens a dialog with the exact text to send. Nothing goes out until staff press Send.
export const SendOrderPage = () => {
  const order = useRecordContext<OrderForSend>();
  const [open, setOpen] = useState(false);
  if (!order?.contact_id) return null;
  const live = isLive(order.status);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!live}
        onClick={() => setOpen(true)}
        title={live ? undefined : "Available once the order is confirmed"}
      >
        <MessageCircle /> Send to customer on Messenger
      </Button>
      {open && (
        <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
          <DialogContent className="p-4 sm:max-w-lg">
            <SendDialogBody
              order={order}
              contactId={order.contact_id}
              onDone={() => setOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

// Loads the customer's name and last message, then shows the text to send. Rendered
// only while the dialog is open, so the lookups run on demand.
const SendDialogBody = ({
  order,
  contactId,
  onDone,
}: {
  order: OrderForSend;
  contactId: number;
  onDone: () => void;
}) => {
  const { data, isPending, error } = useQuery({
    queryKey: ["order_send_context", contactId],
    queryFn: async () => {
      const client = getSupabaseClient();
      const [{ data: contact }, { data: lastIn }] = await Promise.all([
        client
          .from("contacts")
          .select("first_name")
          .eq("id", contactId)
          .maybeSingle(),
        client
          .from("messenger_messages")
          .select("sent_at")
          .eq("contact_id", contactId)
          .eq("direction", "inbound")
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      return {
        firstName: (contact?.first_name as string | null) ?? null,
        lastInbound: (lastIn?.sent_at as string | null) ?? null,
      };
    },
  });

  if (isPending) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Checking the Messenger conversation…
      </p>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-destructive">
        The conversation could not be checked. Try again.
      </p>
    );
  }
  return (
    <SendForm
      order={order}
      contactId={contactId}
      firstName={data.firstName}
      lastInbound={data.lastInbound}
      onDone={onDone}
    />
  );
};

const SendForm = ({
  order,
  contactId,
  firstName,
  lastInbound,
  onDone,
}: {
  order: OrderForSend;
  contactId: number;
  firstName: string | null;
  lastInbound: string | null;
  onDone: () => void;
}) => {
  const notify = useNotify();
  const refresh = useRefresh();
  const [text, setText] = useState(() =>
    orderPageMessage({
      firstName,
      reference: order.reference,
      link: trackingLink(
        import.meta.env.VITE_SUPABASE_URL,
        order.tracking_token,
      ),
    }),
  );
  const [sending, setSending] = useState(false);

  const lastMs = lastInbound ? Date.parse(lastInbound) : null;
  const windowOpen = lastMs !== null && Date.now() - lastMs < DAY_MS;
  const tooLong = text.length > MESSENGER_TEXT_LIMIT;
  const canSend = windowOpen && text.trim().length > 0 && !tooLong && !sending;

  const submit = async () => {
    setSending(true);
    try {
      await send(contactId, { text: text.trim() });
    } catch (error) {
      setSending(false);
      notify(
        error instanceof Error
          ? error.message
          : "The message could not be sent",
        {
          type: "error",
        },
      );
      return;
    }
    // The message is already sent; a failure to note the time must not hide that.
    await getSupabaseClient()
      .from("orders")
      .update({ customer_page_sent_at: new Date().toISOString() })
      .eq("id", order.id);
    setSending(false);
    notify(`Sent to ${firstName ?? "the customer"} on Messenger`);
    refresh();
    onDone();
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Send order page on Messenger</h2>

      {!lastInbound && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          This customer has not messaged the Page yet, so there is no Messenger
          conversation to send into. Send the link by email or ask them to
          message the Page first.
        </p>
      )}
      {lastInbound && !windowOpen && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Their last message was on{" "}
          {new Date(lastInbound).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
          . Messenger only delivers replies within 24 hours of that message, so
          this will not arrive. Ask them to message the Page first.
        </p>
      )}
      {windowOpen && (
        <p className="text-sm text-muted-foreground">
          Their last message was within the last 24 hours, so this will be
          delivered. It is logged on their profile and on the deal.
        </p>
      )}

      <Textarea
        aria-label="Message to send"
        rows={6}
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={!windowOpen}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {tooLong ? "Too long for Messenger. Shorten the message." : ""}
        </span>
        <span className="tabular-nums">
          {text.length} / {MESSENGER_TEXT_LIMIT}
        </span>
      </div>

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={!canSend}>
          <Send /> {sending ? "Sending…" : "Send on Messenger"}
        </Button>
      </div>
    </div>
  );
};
