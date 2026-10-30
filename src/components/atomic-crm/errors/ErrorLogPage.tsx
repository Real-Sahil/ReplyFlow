import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { getSupabaseClient } from "../providers/supabase/supabase";

type ErrorRow = {
  id: number;
  created_at: string;
  source: string;
  message: string;
  context: { page?: string } | null;
};

const LIMIT = 100;

const loadErrors = async (): Promise<ErrorRow[]> => {
  const { data, error } = await getSupabaseClient()
    .from("error_log")
    .select("id, created_at, source, message, context")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) throw error;
  return (data ?? []) as ErrorRow[];
};

// What went wrong in the app, newest first. Only administrators can read it, and it keeps
// the last 60 days.
export const ErrorLogPage = () => {
  const {
    data = [],
    isPending,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["error_log"],
    queryFn: loadErrors,
  });

  return (
    <div className="mx-auto mt-2 flex max-w-4xl flex-col gap-4">
      <div className="flex items-center">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Error log</h1>
          <p className="text-sm text-muted-foreground">
            Problems found in the app and its background services. The most
            recent {LIMIT} are shown and entries are kept for 60 days.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={isFetching ? "animate-spin" : undefined} />{" "}
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent>
          {isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p role="alert" className="text-sm text-destructive">
              The error log could not be loaded.
            </p>
          ) : data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No errors recorded. That is good news.
            </p>
          ) : (
            <ul className="divide-y">
              {data.map((row) => (
                <li key={row.id} className="flex flex-col gap-1 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {row.source}
                    </span>
                    <time
                      className="text-xs text-muted-foreground"
                      dateTime={row.created_at}
                    >
                      {new Date(row.created_at).toLocaleString("en-GB")}
                    </time>
                    {row.context?.page ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {row.context.page}
                      </span>
                    ) : null}
                  </div>
                  <p className="break-words">{row.message}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
