import { useMemo, useState } from "react";
import { useDataProvider, useGetList, useNotify } from "ra-core";
import { useNavigate } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { PostStatusBadge, type PostRow } from "./postStatus";

// Posts with a date go on the calendar. Drafts and approved posts can be moved
// by dragging them to another day; scheduled posts are changed by cancelling
// and rescheduling, because Facebook holds the scheduled time.
const DRAGGABLE = ["draft", "pending_review", "approved", "failed"];

const startOfWeek = (date: Date) => {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday first
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const dayOf = (post: PostRow) => {
  const iso = post.scheduled_for ?? post.published_at ?? null;
  return iso ? new Date(iso) : null;
};

export const PostCalendar = () => {
  const navigate = useNavigate();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [view, setView] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dragId, setDragId] = useState<number | null>(null);
  const { data, refetch } = useGetList<PostRow>(
    "page_posts",
    {
      sort: { field: "id", order: "DESC" },
      pagination: { page: 1, perPage: 500 },
    },
    { refetchInterval: 30000 },
  );

  const posts = useMemo(
    () =>
      (data ?? []).filter(
        (p) => statusFilter === "all" || p.status === statusFilter,
      ),
    [data, statusFilter],
  );
  const unscheduled = posts.filter((p) => !dayOf(p));

  const days = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(cursor);
      return Array.from(
        { length: 7 },
        (_, i) =>
          new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
      );
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = startOfWeek(first);
    return Array.from(
      { length: 42 },
      (_, i) =>
        new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
    );
  }, [view, cursor]);

  const agenda = useMemo(() => {
    const first = days[0].getTime();
    const last = days[days.length - 1].getTime() + 24 * 60 * 60 * 1000;
    return posts
      .filter((p) => {
        const d = dayOf(p);
        return d && d.getTime() >= first && d.getTime() < last;
      })
      .sort((a, b) => dayOf(a)!.getTime() - dayOf(b)!.getTime());
  }, [posts, days]);

  const step = (direction: number) => {
    setCursor((c) =>
      view === "week"
        ? new Date(c.getFullYear(), c.getMonth(), c.getDate() + 7 * direction)
        : new Date(c.getFullYear(), c.getMonth() + direction, 1),
    );
  };

  const moveTo = async (post: PostRow, day: Date) => {
    if (!DRAGGABLE.includes(post.status)) {
      notify(
        "Scheduled posts can only be changed by cancelling the schedule.",
        { type: "error" },
      );
      return;
    }
    // Keep the existing time of day, or 9:00 for a post that had none.
    const old = dayOf(post);
    const when = new Date(day);
    when.setHours(old ? old.getHours() : 9, old ? old.getMinutes() : 0, 0, 0);
    try {
      await dataProvider.update("page_posts", {
        id: post.id,
        data: { scheduled_for: when.toISOString() },
        previousData: post,
      });
      void refetch();
    } catch (error) {
      notify((error as Error).message, { type: "error" });
    }
  };

  const title =
    view === "week"
      ? `Week of ${days[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
      : cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous"
          onClick={() => step(-1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCursor(new Date())}
        >
          Today
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next"
          onClick={() => step(1)}
        >
          <ChevronRight />
        </Button>
        <h2 className="ml-1 text-lg font-semibold">{title}</h2>
        <div className="ml-auto flex items-center gap-2">
          <select
            aria-label="Filter by status"
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="pending_review">Waiting for review</option>
            <option value="approved">Approved</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
            <option value="failed">Failed</option>
          </select>
          <div className="flex rounded-md border p-0.5">
            {(["month", "week"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded px-2.5 py-1 text-sm capitalize",
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
        <Card className="hidden gap-0 overflow-hidden p-0 md:flex md:flex-col">
          <div className="grid grid-cols-7 border-b text-xs font-medium text-muted-foreground">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="px-2 py-1.5">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const inMonth =
                view === "week" || day.getMonth() === cursor.getMonth();
              const today = sameDay(day, new Date());
              const dayPosts = posts
                .filter((p) => {
                  const d = dayOf(p);
                  return d && sameDay(d, day);
                })
                .sort((a, b) => dayOf(a)!.getTime() - dayOf(b)!.getTime());
              return (
                <div
                  key={day.toISOString()}
                  onDragOver={(event) => dragId && event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const post = posts.find((p) => p.id === dragId);
                    setDragId(null);
                    if (post) void moveTo(post, day);
                  }}
                  className={cn(
                    "min-h-28 border-b border-r p-1.5 transition-colors",
                    view === "week" ? "min-h-48" : "",
                    !inMonth && "bg-muted/40 text-muted-foreground",
                    dragId && "hover:bg-accent/50",
                  )}
                >
                  <div className="mb-1 flex justify-end">
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                        today && "bg-primary text-primary-foreground",
                      )}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {dayPosts.map((post) => {
                      const time = dayOf(post)!.toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      const draggable = DRAGGABLE.includes(post.status);
                      return (
                        <button
                          key={post.id}
                          type="button"
                          draggable={draggable}
                          onDragStart={() => setDragId(post.id)}
                          onDragEnd={() => setDragId(null)}
                          onClick={() => navigate(`/page_posts/${post.id}`)}
                          className={cn(
                            "flex w-full min-w-0 items-center gap-1.5 truncate rounded-md border bg-card px-1.5 py-1 text-left text-xs hover:bg-accent",
                            draggable && "cursor-grab",
                          )}
                          title={post.message}
                        >
                          {post.image_url && (
                            <img
                              src={post.image_url}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="size-5 shrink-0 rounded object-cover"
                            />
                          )}
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {time}
                          </span>
                          <span className="truncate">{post.message}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Phones: the month grid is too narrow, so the same posts read as a list by day. */}
        <Card className="gap-0 p-0 md:hidden">
          {agenda.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              Nothing planned in this period.
            </p>
          )}
          <ul className="divide-y">
            {agenda.map((post) => {
              const when = dayOf(post)!;
              return (
                <li key={post.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/page_posts/${post.id}`)}
                    className="flex w-full min-w-0 items-center gap-3 p-3 text-left hover:bg-accent"
                  >
                    {post.image_url ? (
                      <img
                        src={post.image_url}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="size-12 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="size-12 shrink-0 rounded-lg bg-muted"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {when.toLocaleString("en-GB", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="truncate text-sm font-medium">
                        {post.message.split("\n")[0]}
                      </p>
                    </div>
                    <PostStatusBadge status={post.status} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="h-fit gap-3 p-3">
          <h3 className="text-sm font-semibold">Unscheduled</h3>
          <p className="text-xs text-muted-foreground">
            Drag a post onto a day to plan it. Drafts without a date stay here.
          </p>
          <div className="flex flex-col gap-1.5">
            {unscheduled.length === 0 && (
              <p className="text-xs text-muted-foreground">Nothing waiting.</p>
            )}
            {unscheduled.map((post) => (
              <button
                key={post.id}
                type="button"
                draggable={DRAGGABLE.includes(post.status)}
                onDragStart={() => setDragId(post.id)}
                onDragEnd={() => setDragId(null)}
                onClick={() => navigate(`/page_posts/${post.id}`)}
                className="flex flex-col gap-1 rounded-md border bg-card p-2 text-left hover:bg-accent"
              >
                <PostStatusBadge status={post.status} />
                <span className="line-clamp-2 text-xs">{post.message}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
