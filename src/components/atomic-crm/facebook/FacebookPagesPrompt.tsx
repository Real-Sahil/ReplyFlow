import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Facebook } from "lucide-react";

import { listPages } from "./metaPages";

// Shown on the dashboard until the organisation has connected at least one Facebook Page.
export const FacebookPagesPrompt = () => {
  const { data: pages, isPending } = useQuery({
    queryKey: ["meta_pages"],
    queryFn: listPages,
  });
  if (isPending || (pages?.length ?? 0) > 0) return null;

  return (
    <Link
      to="/facebook"
      className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm hover:bg-muted"
    >
      <Facebook className="size-5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Connect your Facebook Pages</span>
        <span className="text-muted-foreground">
          Sign in to Facebook, tick the Pages you manage, and posts and messages
          will reach them here.
        </span>
      </span>
    </Link>
  );
};
