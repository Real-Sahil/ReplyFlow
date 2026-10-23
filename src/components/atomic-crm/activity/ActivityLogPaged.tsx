import { Fragment } from "react";
import { useListContext, useTranslate } from "ra-core";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ListPagination } from "@/components/admin/list-pagination";
import type { Activity } from "../types";
import { ActivityItem } from "./ActivityLogIterator";

// The activity list with numbered pages, for desktop. Phones use the scrolling list instead.
export function ActivityLogPaged() {
  const { data, isPending, error, refetch } = useListContext<Activity>();
  const translate = useTranslate();

  if (isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error && !data?.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-sm text-muted-foreground">
        <p>
          {translate("crm.dashboard.latest_activity_error", {
            _: "Error loading latest activity",
          })}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="underline hover:no-underline"
        >
          {translate("crm.common.retry")}
        </button>
      </div>
    );
  }

  if (!data?.length) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No activity yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-4">
        {data.map((activity, index) => (
          <Fragment key={activity.id ?? index}>
            <ActivityItem activity={activity} />
            {index < data.length - 1 && <Separator />}
          </Fragment>
        ))}
      </div>
      <ListPagination rowsPerPageOptions={[10, 20, 50]} />
    </div>
  );
}
