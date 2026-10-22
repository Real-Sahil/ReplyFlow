import { useState } from "react";
import { useGetList, useNotify } from "ra-core";
import { Link } from "react-router";
import { EyeOff, ExternalLink, MessageCircle, Reply } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { getSupabaseClient } from "../providers/supabase/supabase";

type PageComment = {
  id: number;
  post_id: string;
  parent_id: string | null;
  author_name: string | null;
  body: string | null;
  commented_at: string;
  status: "new" | "replied" | "hidden" | "handled";
  reply_text: string | null;
  private_reply_at: string | null;
  contact_id: number | null;
};

const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const act = async (
  id: number,
  action: string,
  text?: string,
): Promise<{ contact_id?: number }> => {
  const { data, error } = await getSupabaseClient().functions.invoke(
    "comments_action",
    { method: "POST", body: { id, action, text } },
  );
  if (error) {
    const details = await (async () => {
      try {
        return (await error.context?.json()) ?? {};
      } catch {
        return {};
      }
    })();
    throw new Error(details.message || "That did not work");
  }
  return data?.data ?? {};
};

const CommentCard = ({
  comment,
  onChanged,
}: {
  comment: PageComment;
  onChanged: () => void;
}) => {
  const notify = useNotify();
  const [mode, setMode] = useState<"reply" | "private" | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const canPrivate =
    !comment.private_reply_at &&
    Date.now() - Date.parse(comment.commented_at) <= PRIVATE_REPLY_WINDOW_MS;

  const run = async (action: string, body?: string, success?: string) => {
    setBusy(true);
    try {
      await act(comment.id, action, body);
      if (success) notify(success);
      setMode(null);
      setText("");
      onChanged();
    } catch (error) {
      notify((error as Error).message, { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      className={cn(
        "gap-3 p-4",
        comment.status === "new" && "ring-1 ring-primary/30",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {comment.author_name ?? "Facebook user"}
        </span>
        {comment.parent_id && (
          <Badge variant="outline">Reply in a thread</Badge>
        )}
        <Badge
          variant={comment.status === "new" ? "default" : "secondary"}
          className="capitalize"
        >
          {comment.status}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(comment.commented_at).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
      {comment.reply_text && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          You replied: {comment.reply_text}
        </p>
      )}

      {mode ? (
        <div className="flex flex-col gap-2">
          <Textarea
            autoFocus
            rows={3}
            maxLength={2000}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              mode === "reply"
                ? "Public reply under the comment"
                : "Private message to this person on Messenger (sent once)"
            }
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || !text.trim()}
              onClick={() =>
                run(
                  mode === "reply" ? "reply" : "private_reply",
                  text,
                  mode === "reply" ? "Reply posted" : "Private reply sent",
                )
              }
            >
              Send
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setMode("reply")}>
            <Reply /> Reply
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canPrivate}
            title={
              canPrivate
                ? "Send one private Messenger message"
                : "A private reply can be sent once, within 7 days"
            }
            onClick={() => setMode("private")}
          >
            <MessageCircle /> Reply privately
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run(comment.status === "hidden" ? "unhide" : "hide")}
          >
            <EyeOff /> {comment.status === "hidden" ? "Unhide" : "Hide"}
          </Button>
          {comment.contact_id ? (
            <Button asChild size="sm" variant="outline">
              <Link to={`/contacts/${comment.contact_id}/show`}>
                Open contact
              </Link>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => run("to_enquiry", undefined, "Enquiry created")}
            >
              Create enquiry
            </Button>
          )}
          {comment.status !== "handled" && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => run("handled")}
            >
              Mark handled
            </Button>
          )}
          <Button asChild size="sm" variant="ghost" className="ml-auto">
            <a
              href={`https://www.facebook.com/${comment.post_id}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink /> View post
            </a>
          </Button>
        </div>
      )}
    </Card>
  );
};

export const CommentsPanel = () => {
  const [filter, setFilter] = useState<"open" | "all">("open");
  const { data, refetch } = useGetList<PageComment>(
    "page_comments",
    {
      sort: { field: "commented_at", order: "DESC" },
      pagination: { page: 1, perPage: 100 },
    },
    { refetchInterval: 20000 },
  );
  const rows = (data ?? []).filter(
    (c) => filter === "all" || c.status === "new",
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1">
        <Button
          size="sm"
          variant={filter === "open" ? "default" : "outline"}
          onClick={() => setFilter("open")}
        >
          Needs attention
        </Button>
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
        >
          All comments
        </Button>
      </div>
      {rows.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">
          {data?.length
            ? "Nothing needs attention."
            : "No comments yet. New comments on your Page posts appear here once the Page is subscribed to the feed field."}
        </Card>
      )}
      {rows.map((comment) => (
        <CommentCard
          key={comment.id}
          comment={comment}
          onChanged={() => void refetch()}
        />
      ))}
    </div>
  );
};
