import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify } from "ra-core";
import { ExternalLink, MessageSquare } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { linkedInPostUrl } from "./useLinkedIn";
import { useLinkedInPages } from "./useLinkedInPages";

type Post = { urn: string; text: string; publishedAt: number | null };
type Comment = {
  urn: string;
  text: string;
  at: number | null;
  fromPage: boolean;
};
type Stats = {
  impressions: number;
  clicks: number;
  reactions: number;
  comments: number;
  shares: number;
  engagementRate: number | null;
};

class ActivityError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

const call = async <T,>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await getSupabaseClient().functions.invoke(
    "linkedin_page_activity",
    { method: "POST", body },
  );
  if (error) {
    const details = (await error.context?.json?.().catch(() => ({}))) as
      | { message?: string; code?: string }
      | undefined;
    throw new ActivityError(
      details?.message ?? "Could not reach LinkedIn right now.",
      details?.code,
    );
  }
  return data.data as T;
};

const count = (n: number) => n.toLocaleString("en-GB");
const percent = (n: number | null) =>
  n === null ? "–" : `${(n * 100).toFixed(2)}%`;
const when = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const Problem = ({ error }: { error: ActivityError }) => (
  <p role="alert" className="text-sm">
    {error.message}{" "}
    {["expired", "not_connected"].includes(error.code ?? "") ? (
      <Link to="/linkedin" className="font-medium underline">
        Go to the LinkedIn connection
      </Link>
    ) : null}
  </p>
);

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-xl font-semibold tabular-nums">{value}</span>
  </div>
);

const Overview = ({ orgId }: { orgId: string }) => {
  const q = useQuery({
    queryKey: ["linkedin_page", orgId, "analytics"],
    retry: false,
    queryFn: () =>
      call<{ followers: number | null; stats: Stats | null }>({
        action: "analytics",
        org_id: orgId,
      }),
  });
  if (q.error) return <Problem error={q.error as ActivityError} />;
  if (q.isPending)
    return <p className="text-sm text-muted-foreground">Asking LinkedIn…</p>;
  const { followers, stats } = q.data;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat
            label="Followers"
            value={followers === null ? "–" : count(followers)}
          />
          <Stat
            label="Views of posts"
            value={stats ? count(stats.impressions) : "–"}
          />
          <Stat label="Clicks" value={stats ? count(stats.clicks) : "–"} />
          <Stat
            label="Engagement"
            value={stats ? percent(stats.engagementRate) : "–"}
          />
          <Stat
            label="Reactions"
            value={stats ? count(stats.reactions) : "–"}
          />
          <Stat label="Comments" value={stats ? count(stats.comments) : "–"} />
          <Stat label="Shares" value={stats ? count(stats.shares) : "–"} />
        </div>
        <p className="text-xs text-muted-foreground">
          Totals across all of the Page's posts, as LinkedIn reports them. A
          figure shown as a dash means LinkedIn did not return it for this Page.
        </p>
      </CardContent>
    </Card>
  );
};

const Comments = ({
  orgId,
  post,
  canReply,
}: {
  orgId: string;
  post: Post;
  canReply: boolean;
}) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const [parent, setParent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = ["linkedin_page", orgId, "comments", post.urn];
  const q = useQuery({
    queryKey: key,
    retry: false,
    queryFn: () =>
      call<{ comments: Comment[] }>({
        action: "comments",
        org_id: orgId,
        post_urn: post.urn,
      }),
  });

  const send = async () => {
    setBusy(true);
    try {
      await call({
        action: "reply",
        org_id: orgId,
        post_urn: post.urn,
        text: reply,
        parent_comment: parent ?? undefined,
      });
      notify("Reply posted");
      setReply("");
      setParent(null);
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (e) {
      notify((e as Error).message, { type: "error" });
    }
    setBusy(false);
  };

  if (q.error) return <Problem error={q.error as ActivityError} />;
  if (q.isPending)
    return <p className="text-sm text-muted-foreground">Loading comments…</p>;
  const comments = q.data.comments;
  return (
    <div className="flex flex-col gap-3">
      {comments.length ? (
        <ul className="flex flex-col gap-2">
          {comments.map((c) => (
            <li
              key={c.urn}
              className={
                c.fromPage
                  ? "ml-6 rounded-lg bg-primary/10 px-3 py-2 text-sm"
                  : "rounded-lg bg-muted px-3 py-2 text-sm"
              }
            >
              <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                <span>{c.fromPage ? "Your Page" : "A LinkedIn member"}</span>
                <span>{when(c.at)}</span>
              </div>
              <p className="whitespace-pre-wrap">{c.text}</p>
              {!c.fromPage && canReply ? (
                <button
                  type="button"
                  className="mt-1 text-xs font-medium underline"
                  onClick={() => setParent(c.urn)}
                >
                  Reply to this
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      )}
      {canReply ? (
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label="Reply as the Page"
            rows={3}
            placeholder={
              parent ? "Reply to the comment…" : "Comment on the post…"
            }
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={busy || !reply.trim()}
              onClick={() => void send()}
            >
              Reply as the Page
            </Button>
            {parent ? (
              <button
                type="button"
                className="text-xs underline"
                onClick={() => setParent(null)}
              >
                Reply to the post instead
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const Posts = ({ orgId, canReply }: { orgId: string; canReply: boolean }) => {
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["linkedin_page", orgId, "posts"],
    retry: false,
    queryFn: () => call<{ posts: Post[] }>({ action: "posts", org_id: orgId }),
  });
  if (q.error) return <Problem error={q.error as ActivityError} />;
  if (q.isPending)
    return <p className="text-sm text-muted-foreground">Asking LinkedIn…</p>;
  if (!q.data.posts.length)
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          LinkedIn returned no posts for this Page.
        </CardContent>
      </Card>
    );
  return (
    <Card className="gap-0 p-0">
      <ul className="divide-y">
        {q.data.posts.map((post) => (
          <li key={post.urn} className="flex flex-col gap-3 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-3 whitespace-pre-wrap text-sm">
                  {post.text || "(no text)"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {when(post.publishedAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button asChild size="sm" variant="ghost">
                  <a
                    href={linkedInPostUrl(post.urn)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open on LinkedIn"
                  >
                    <ExternalLink />
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-expanded={open === post.urn}
                  onClick={() => setOpen(open === post.urn ? null : post.urn)}
                >
                  <MessageSquare /> Comments
                </Button>
              </div>
            </div>
            {open === post.urn ? (
              <Comments orgId={orgId} post={post} canReply={canReply} />
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
};

export const LinkedInPagesPage = () => {
  const { pages, loading } = useLinkedInPages();
  const [chosen, setChosen] = useState<string | null>(null);
  const orgId = chosen ?? pages[0]?.org_id ?? null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">LinkedIn Pages</h1>
        <p className="text-sm text-muted-foreground">
          How your company Pages are doing, and the comments on their posts.
          Read live from LinkedIn.
        </p>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : !orgId ? (
        <Card>
          <CardContent className="text-sm">
            No LinkedIn Page is connected yet. An administrator can connect one
            on the{" "}
            <Link to="/linkedin" className="font-medium underline">
              LinkedIn screen
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <>
          {pages.length > 1 ? (
            <select
              aria-label="Page"
              className="h-9 self-start rounded-md border bg-background px-3 text-sm"
              value={orgId}
              onChange={(e) => setChosen(e.target.value)}
            >
              {pages.map((p) => (
                <option key={p.org_id} value={p.org_id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <h2 className="font-medium">{pages[0].name}</h2>
          )}
          <Overview orgId={orgId} />
          <Posts orgId={orgId} canReply />
        </>
      )}
    </div>
  );
};
