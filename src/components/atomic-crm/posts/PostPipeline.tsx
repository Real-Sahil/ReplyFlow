import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

import { PostStatusBadge, type PostRow } from "./postStatus";

type Stage = PostRow["status"];

// The five stages a post moves through, left to right.
const STAGES: { key: Stage; hint: string }[] = [
  { key: "draft", hint: "Not yet sent for review" },
  { key: "pending_review", hint: "Waiting for an administrator" },
  { key: "approved", hint: "Goes out on its slot" },
  { key: "scheduled", hint: "Held by Facebook until its time" },
  { key: "published", hint: "Live on the Page" },
];

// Counts per stage across all posts. Tapping a stage filters the list; tapping it
// again clears the filter. On phones the cards scroll sideways rather than wrap.
export const PostPipeline = ({
  posts,
  stage,
  onPick,
}: {
  posts: PostRow[];
  stage: Stage | null;
  onPick: (stage: Stage | null) => void;
}) => (
  <div className="flex items-stretch gap-2 overflow-x-auto pb-1 md:overflow-visible">
    {STAGES.map(({ key, hint }, index) => {
      const count = posts.filter((post) => post.status === key).length;
      const active = stage === key;
      return (
        <Fragment key={key}>
          <button
            type="button"
            aria-pressed={active}
            onClick={() => onPick(active ? null : key)}
            className={cn(
              "flex min-w-40 flex-1 flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent md:min-w-0",
              active && "border-2 border-foreground",
            )}
          >
            <span className="flex">
              <PostStatusBadge status={key} />
            </span>
            <span className="text-3xl font-semibold tabular-nums">{count}</span>
            <span className="text-xs text-muted-foreground">{hint}</span>
          </button>
          {index < STAGES.length - 1 && (
            <ChevronRight
              aria-hidden="true"
              className="hidden shrink-0 self-center text-muted-foreground md:block"
            />
          )}
        </Fragment>
      );
    })}
  </div>
);
