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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { PostComposer } from "./PostComposer";

type PostRow = {
  id: number;
  message: string;
  image_url: string | null;
  status: "draft" | "scheduled" | "published" | "failed";
  scheduled_for: string | null;
  published_at: string | null;
  fb_post_id: string | null;
  error: string | null;
};

const tone: Record<PostRow["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  published: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-destructive/10 text-destructive",
};

export const PostList = () => {
  const { identity } = useGetIdentity();
  const notify = useNotify();
  const [busyId, setBusyId] = useState<number | null>(null);
  const { data, refetch } = useGetList<PostRow>("page_posts", {
    sort: { field: "id", order: "DESC" },
    pagination: { page: 1, perPage: 50 },
  });
  if (!identity) return null;

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
      const details = await (async () => {
        try {
          return (await error.context?.json()) ?? {};
        } catch {
          return {};
        }
      })();
      notify(details.message || "Could not remove it from Facebook", {
        type: "error",
      });
    } else {
      notify("Removed from Facebook and kept as a draft");
      void refetch();
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-4">
      <div className="flex items-center">
        <h1 className="flex-1 text-2xl font-semibold tracking-tight">Posts</h1>
        <Button asChild>
          <Link to="/page_posts/create">
            <Plus /> New post
          </Link>
        </Button>
      </div>
      {data?.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">
          No posts yet. Write one, pick a product, and post it now or schedule
          it.
        </Card>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {data?.map((post) => (
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
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn("border-0 capitalize", tone[post.status])}
                >
                  {post.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {post.status === "scheduled" && post.scheduled_for
                    ? new Date(post.scheduled_for).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : post.published_at
                      ? new Date(post.published_at).toLocaleDateString(
                          "en-GB",
                          { day: "numeric", month: "short" },
                        )
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
                {(post.status === "draft" || post.status === "failed") && (
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/page_posts/${post.id}`}>Edit</Link>
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
                    {post.status === "scheduled"
                      ? "Cancel schedule"
                      : "Remove from Facebook"}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
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
