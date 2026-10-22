import {
  CreateBase,
  EditBase,
  useGetIdentity,
  useGetList,
  useNotify,
} from "ra-core";
import { useState } from "react";
import { Link } from "react-router";
import { ExternalLink, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { PostCalendar } from "./PostCalendar";
import { PostComposer } from "./PostComposer";
import { PostStatusBadge, type PostRow } from "./postStatus";

const cancelLabel = (status: PostRow["status"]) =>
  status === "scheduled" ? "Cancel schedule" : "Remove from Facebook";

const ListView = () => {
  const notify = useNotify();
  const [busyId, setBusyId] = useState<number | null>(null);
  const { data, refetch } = useGetList<PostRow>("page_posts", {
    sort: { field: "id", order: "DESC" },
    pagination: { page: 1, perPage: 100 },
  });

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

  if (!data?.length) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        No posts yet. Write one, add a product or photo, then send it for review
        or post it.
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {data.map((post) => (
        <Card key={post.id} className="flex-row gap-0 overflow-hidden py-0">
          {post.image_url ? (
            <img
              src={post.image_url}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="size-28 shrink-0 object-cover"
            />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <PostStatusBadge status={post.status} />
              <span className="text-xs text-muted-foreground">
                {post.status === "scheduled" && post.scheduled_for
                  ? new Date(post.scheduled_for).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : post.published_at
                    ? new Date(post.published_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })
                    : post.scheduled_for
                      ? `Planned ${new Date(post.scheduled_for).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                      : ""}
              </span>
            </div>
            <p className="line-clamp-3 whitespace-pre-wrap text-sm">
              {post.message}
            </p>
            {post.error && (
              <p className="text-xs text-destructive">{post.error}</p>
            )}
            <div className="mt-auto flex flex-wrap gap-2">
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
              {post.fb_post_id && (
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
        </Card>
      ))}
    </div>
  );
};

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
  if (!identity) return null;
  return (
    <div className="mt-2 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold tracking-tight">Posts</h1>
        <Tabs tab={tab} onChange={setTab} />
        <Button asChild>
          <Link to="/page_posts/create">
            <Plus /> New post
          </Link>
        </Button>
      </div>
      {tab === "calendar" ? <PostCalendar /> : <ListView />}
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
