import {
  CreateBase,
  EditBase,
  useGetIdentity,
  useGetList,
  useNotify,
} from "ra-core";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { ExternalLink, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { AutopilotPanel } from "./AutopilotPanel";
import { PostCalendar } from "./PostCalendar";
import { PostComposer } from "./PostComposer";
import { PlanWithAi } from "./PlanWithAi";
import { PostPipeline } from "./PostPipeline";
import { PostStatusBadge, type PostRow } from "./postStatus";

type Stage = PostRow["status"];
type Source = "all" | "ai" | "manual";

const cancelLabel = (status: PostRow["status"]) =>
  status === "scheduled" ? "Cancel schedule" : "Remove from Facebook";

// "in 14 hours", "in 3 days", "2 hours ago": how far away a planned time is.
const relativeTime = (iso: string) => {
  const minutes = Math.round((Date.parse(iso) - Date.now()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  const abs = Math.abs(minutes);
  if (abs < 60) return formatter.format(minutes, "minute");
  if (abs < 60 * 24) return formatter.format(Math.round(minutes / 60), "hour");
  return formatter.format(Math.round(minutes / (60 * 24)), "day");
};

// What the post is waiting on, in plain words.
const stateNote = (post: PostRow) => {
  switch (post.status) {
    case "draft":
      return "Not yet sent for review";
    case "pending_review":
      return "Waiting for an administrator";
    case "approved":
      return "Approved, goes out on its slot";
    case "scheduled":
      return "Held by Facebook until its time";
    case "published":
      return "Live on the Page";
    case "failed":
      return "Needs a retry";
  }
};

const whenLabel = (post: PostRow) => {
  const iso = post.scheduled_for ?? post.published_at;
  if (!iso) return { date: "Not planned", relative: "" };
  return {
    date: new Date(iso).toLocaleString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
    relative: relativeTime(iso),
  };
};

// Two letters from the first words of the caption, for posts without a photo.
const initials = (message: string) =>
  message
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("") || "•";

const Thumb = ({ post }: { post: PostRow }) =>
  post.image_url ? (
    <img
      src={post.image_url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className="size-14 shrink-0 rounded-lg object-cover"
    />
  ) : (
    <div
      aria-hidden="true"
      className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground"
    >
      {initials(post.message)}
    </div>
  );

const SourceTag = ({ source }: { source?: PostRow["source"] }) => (
  <span
    className={cn(
      "rounded-full px-2 py-0.5 text-xs font-medium",
      source === "ai"
        ? "bg-amber-300 text-neutral-900"
        : "bg-muted text-muted-foreground",
    )}
  >
    {source === "ai" ? "AI" : "Manual"}
  </span>
);

// A published post can be offered again every 60 days as a draft (see recycle_evergreen_posts).
const EvergreenToggle = ({
  post,
  onChanged,
}: {
  post: PostRow & { evergreen?: boolean };
  onChanged: () => void;
}) => {
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const on = !!post.evergreen;
  const toggle = async () => {
    setBusy(true);
    const { error } = await getSupabaseClient().rpc("set_post_evergreen", {
      p_id: post.id,
      p_value: !on,
    });
    setBusy(false);
    if (error) {
      notify("Could not change this post", { type: "error" });
      return;
    }
    notify(
      on ? "Removed from evergreen" : "Will be offered again every 60 days",
    );
    void onChanged();
  };
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-pressed={on}
      disabled={busy}
      onClick={toggle}
    >
      {on ? "Evergreen: on" : "Make evergreen"}
    </Button>
  );
};

const ListView = ({
  posts,
  refetch,
  loading,
}: {
  posts: PostRow[];
  refetch: () => void;
  loading: boolean;
}) => {
  const notify = useNotify();
  const [busyId, setBusyId] = useState<number | null>(null);

  const remove = async (post: PostRow) => {
    setBusyId(post.id);
    const { error } = await getSupabaseClient().functions.invoke(
      "post_publish",
      {
        method: "POST",
        body: { id: post.id, action: "remove" },
      },
    );
    setBusyId(null);
    if (error) {
      notify("Could not remove it from Facebook", { type: "error" });
    } else {
      notify("Removed from Facebook and kept as a draft");
      void refetch();
    }
  };

  if (loading) {
    // Placeholder rows while the posts load, so the screen never goes blank.
    return (
      <Card className="gap-0 overflow-hidden p-0" aria-busy="true">
        <ul className="divide-y">
          {[0, 1, 2, 3].map((row) => (
            <li
              key={row}
              className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[56px_minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.6fr)]"
            >
              <div className="size-14 animate-pulse rounded-lg bg-muted" />
              <div className="min-w-0 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              </div>
              <div className="hidden h-4 w-28 animate-pulse rounded bg-muted md:block" />
              <div className="hidden h-6 w-24 animate-pulse rounded-full bg-muted md:block" />
            </li>
          ))}
        </ul>
        <span className="sr-only" role="status">
          Loading posts
        </span>
      </Card>
    );
  }

  if (!posts.length) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        No posts match these filters. Clear a filter, or write a new post.
      </Card>
    );
  }

  return (
    <Card className="gap-0 overflow-hidden p-0">
      {/* Desktop column headings; on phones each row labels itself. */}
      <div className="hidden grid-cols-[56px_minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.6fr)] gap-4 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid">
        <div />
        <div>Post</div>
        <div>Planned</div>
        <div>Status</div>
      </div>

      <ul className="divide-y">
        {posts.map((post) => {
          const when = whenLabel(post);
          return (
            <li
              key={post.id}
              className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[56px_minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.6fr)]"
            >
              <Thumb post={post} />
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {post.message.split("\n")[0]}
                </p>
                <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <SourceTag source={post.source} />
                  <span className="truncate">
                    {post.error ? (
                      <span className="text-destructive">{post.error}</span>
                    ) : (
                      stateNote(post)
                    )}
                  </span>
                </p>
              </div>

              <div className="col-span-2 text-sm md:col-span-1">
                <p className="tabular-nums">{when.date}</p>
                {when.relative && (
                  <p className="text-xs text-muted-foreground">
                    {when.relative}
                  </p>
                )}
              </div>

              <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-1">
                <PostStatusBadge status={post.status} />
                <div className="ml-auto flex flex-wrap gap-2">
                  {["draft", "failed", "pending_review", "approved"].includes(
                    post.status,
                  ) && (
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/page_posts/${post.id}`}>Open</Link>
                    </Button>
                  )}
                  {post.fb_post_id && (
                    <Button asChild size="sm" variant="ghost">
                      <a
                        href={`https://www.facebook.com/${post.fb_post_id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink /> View
                      </a>
                    </Button>
                  )}
                  {post.status === "published" && (
                    <EvergreenToggle post={post} onChanged={refetch} />
                  )}
                  {(post.status === "scheduled" ||
                    post.status === "published") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === post.id}
                      onClick={() => remove(post)}
                    >
                      {cancelLabel(post.status)}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

const FilterChip = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={cn(
      "h-8 shrink-0 rounded-full border px-3 text-sm transition-colors",
      active
        ? "border-foreground bg-foreground text-background"
        : "bg-card hover:bg-accent",
    )}
  >
    {children}
  </button>
);

const Tabs = ({
  tab,
  onChange,
}: {
  tab: "calendar" | "list";
  onChange: (t: "calendar" | "list") => void;
}) => (
  <div className="flex rounded-md border p-0.5">
    {(["calendar", "list"] as const).map((t) => (
      <button
        key={t}
        type="button"
        onClick={() => onChange(t)}
        className={cn(
          "rounded px-3 py-1 text-sm capitalize",
          tab === t
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground",
        )}
      >
        {t}
      </button>
    ))}
  </div>
);

export const PostList = () => {
  const { identity } = useGetIdentity();
  const [tab, setTab] = useState<"calendar" | "list">("calendar");
  const [stage, setStage] = useState<Stage | null>(null);
  const [source, setSource] = useState<Source>("all");
  const location = useLocation();
  const focusPlan = !!(location.state as { planWithAi?: boolean } | null)
    ?.planWithAi;
  const { data, refetch, isLoading } = useGetList<PostRow>("page_posts", {
    sort: { field: "id", order: "DESC" },
    pagination: { page: 1, perPage: 200 },
  });
  const all = useMemo(() => data ?? [], [data]);
  const visible = useMemo(
    () =>
      all.filter(
        (post) =>
          (stage === null || post.status === stage) &&
          (source === "all" || (post.source ?? "manual") === source),
      ),
    [all, stage, source],
  );

  if (!identity) return null;
  return (
    <div className="mt-2 flex flex-col gap-4 px-4 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight">
          Posts
        </h1>
        <Tabs tab={tab} onChange={setTab} />
        <Button asChild variant="outline">
          <Link to="/posts/import">Import drafts</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/links">Tracked links</Link>
        </Button>
        <Button asChild>
          <Link to="/page_posts/create">
            <Plus /> New post
          </Link>
        </Button>
      </div>

      <PostPipeline posts={all} stage={stage} onPick={setStage} />
      <PlanWithAi focus={focusPlan} />
      <AutopilotPanel />

      {tab === "calendar" ? (
        <PostCalendar />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              active={source === "all"}
              onClick={() => setSource("all")}
            >
              All posts
            </FilterChip>
            <FilterChip
              active={source === "ai"}
              onClick={() => setSource("ai")}
            >
              Written by AI
            </FilterChip>
            <FilterChip
              active={source === "manual"}
              onClick={() => setSource("manual")}
            >
              Written by a person
            </FilterChip>
            {stage && (
              <FilterChip active onClick={() => setStage(null)}>
                {stage.replace("_", " ")} &times;
              </FilterChip>
            )}
          </div>
          <ListView posts={visible} refetch={refetch} loading={isLoading} />
        </>
      )}
    </div>
  );
};

export const PostCreate = () => (
  <CreateBase redirect="list">
    <PostComposer />
  </CreateBase>
);

export const PostEdit = () => (
  <EditBase redirect="list" actions={false}>
    <PostComposer />
  </EditBase>
);
