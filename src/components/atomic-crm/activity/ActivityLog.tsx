import { InfiniteListBase, ListBase } from "ra-core";
import type { Identifier } from "ra-core";

import { useIsMobile } from "@/hooks/use-mobile";
import { ActivityLogContext } from "./ActivityLogContext";
import { ActivityLogIterator } from "./ActivityLogIterator";
import { ActivityLogPaged } from "./ActivityLogPaged";

type ActivityLogProps = {
  companyId?: Identifier;
  pageSize?: number;
  context?: "company" | "contact" | "deal" | "all";
};

// Desktop: numbered pages with a page-size choice. Phone: the list grows as you scroll.
export function ActivityLog({
  companyId,
  pageSize = 20,
  context = "all",
}: ActivityLogProps) {
  const isMobile = useIsMobile();
  const filter = companyId ? { company_id: companyId } : {};
  const sort = { field: "date", order: "DESC" as const };

  return (
    <ActivityLogContext.Provider value={context}>
      {isMobile ? (
        <InfiniteListBase
          resource="activity_log"
          filter={filter}
          sort={sort}
          perPage={pageSize}
          disableSyncWithLocation
        >
          <ActivityLogIterator />
        </InfiniteListBase>
      ) : (
        <ListBase
          resource="activity_log"
          filter={filter}
          sort={sort}
          perPage={pageSize}
          disableSyncWithLocation
        >
          <ActivityLogPaged />
        </ListBase>
      )}
    </ActivityLogContext.Provider>
  );
}
