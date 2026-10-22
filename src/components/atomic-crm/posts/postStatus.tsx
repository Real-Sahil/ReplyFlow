import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type PostRow = {
  id: number;
  message: string;
  product_id: number | null;
  image_url: string | null;
  media_path: string | null;
  media_name: string | null;
  media_type: string | null;
  status:
    | "draft"
    | "pending_review"
    | "approved"
    | "scheduled"
    | "published"
    | "failed";
  scheduled_for: string | null;
  published_at: string | null;
  fb_post_id: string | null;
  error: string | null;
  submitted_at: string | null;
  approved_at: string | null;
};

const labels: Record<PostRow["status"], string> = {
  draft: "Draft",
  pending_review: "Waiting for review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
};

const tones: Record<PostRow["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  scheduled: "bg-primary/15 text-primary",
  published: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-destructive/10 text-destructive",
};

export const PostStatusBadge = ({ status }: { status: PostRow["status"] }) => (
  <Badge variant="secondary" className={cn("border-0", tones[status])}>
    {labels[status]}
  </Badge>
);
