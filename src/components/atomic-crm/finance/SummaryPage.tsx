import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { CalendarCheck, RefreshCw } from "lucide-react";
import { useNotify } from "ra-core";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPence } from "../quotes/quoteMath";

type Summary = {
  week_from: string;
  week_to: string;
  money_in_pence: number;
  money_out_pence: number;
  owed_to_you_pence: number;
  owed_to_you_count: number;
  owed_late_pence: number;
  owed_late_count: number;
  you_owe_pence: number;
  bills_late_count: number;
  bills_due_week_count: number;
  bills_due_week_pence: number;
  low_stock_count: number;
  orders_due_count: number;
  customers_waiting_count: number;
};

type Row = { id: number; week_from: string; week_to: string; data: Summary };

const KEY = ["weekly_summaries"];

const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

const Tile = ({
  to,
  label,
  value,
  detail,
  warn,
}: {
  to?: string;
  label: string;
  value: string;
  detail?: string;
  warn?: boolean;
}) => {
  const inner = (
    <div className="flex h-full flex-col gap-1 rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums tracking-tight",
          warn && "text-warning",
        )}
      >
        {value}
      </span>
      {detail ? (
        <span className="text-sm text-muted-foreground">{detail}</span>
      ) : null}
    </div>
  );
  return to ? (
    <Link to={to} className="press block">
      {inner}
    </Link>
  ) : (
    inner
  );
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

// The owner's weekly read. The latest week is shown in full; earlier weeks are kept below.
// The week's LinkedIn: ad spend, views and clicks (saved by the daily LinkedIn check, shown only when the business has
// connected LinkedIn for ads) and how many posts ReplyFlow sent to LinkedIn. Nothing shows when there is nothing.
const LinkedInWeek = ({ from, to }: { from: string; to: string }) => {
  const { data } = useQuery({
    queryKey: ["summary_linkedin", from, to],
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      const until = new Date(Date.parse(to) + 86_400_000).toISOString();
      const [spend, sent] = await Promise.all([
        client
          .from("linkedin_ad_spend")
          .select("spend, impressions, clicks, currency")
          .gte("day", from)
          .lte("day", to),
        client
          .from("post_destinations")
          .select("id", { count: "exact", head: true })
          .eq("state", "published")
          .gte("posted_at", from)
          .lt("posted_at", until),
      ]);
      const rows = spend.data ?? [];
      return {
        spend: rows.reduce((t, r) => t + Number(r.spend), 0),
        impressions: rows.reduce((t, r) => t + Number(r.impressions), 0),
        clicks: rows.reduce((t, r) => t + Number(r.clicks), 0),
        currencies: [...new Set(rows.map((r) => String(r.currency ?? "")))],
        hasSpend: rows.length > 0,
        posts: sent.count ?? 0,
      };
    },
  });
  if (!data || (!data.hasSpend && data.posts === 0)) return null;
  // Spend is in the ad account's own currency; with more than one currency a single total would be wrong.
  const one = data.currencies.length === 1 ? data.currencies[0] : null;
  const spend =
    data.hasSpend && one
      ? new Intl.NumberFormat("en-GB", {
          style: "currency",
          currency: one,
        }).format(data.spend)
      : null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-sm font-semibold text-muted-foreground">
        LinkedIn
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          to="/linkedin_ads"
          label="Ad spend"
          value={spend ?? "–"}
          detail={
            data.hasSpend
              ? spend
                ? `${data.impressions.toLocaleString("en-GB")} views, ${data.clicks.toLocaleString("en-GB")} clicks`
                : "Several currencies: see the ads report"
              : "LinkedIn ads not connected"
          }
        />
        <Tile
          label="Posts to LinkedIn"
          value={String(data.posts)}
          detail="Sent from ReplyFlow this week"
        />
      </div>
    </section>
  );
};

export const SummaryPage = () => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const {
    data: rows = [],
    isPending,
    error,
  } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error: loadError } = await getSupabaseClient()
        .from("weekly_summaries")
        .select("id, week_from, week_to, data")
        .order("week_from", { ascending: false })
        .limit(12);
      if (loadError) throw loadError;
      return (data ?? []) as unknown as Row[];
    },
  });
  const refresh = useMutation({
    mutationFn: async () => {
      const { error: rpcError } = await getSupabaseClient().rpc(
        "refresh_my_weekly_summary",
      );
      if (rpcError) throw rpcError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  const [latest, ...earlier] = rows;
  const d = latest?.data;
  const net = d ? d.money_in_pence - d.money_out_pence : 0;

  return (
    <div className="mt-2 flex flex-col gap-5 px-4 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title flex min-w-0 basis-full items-center gap-2 text-2xl font-semibold tracking-tight sm:basis-0 sm:flex-1">
          <CalendarCheck className="size-6 text-muted-foreground" /> Weekly
          summary
        </h1>
        <Button
          size="sm"
          variant="outline"
          disabled={refresh.isPending}
          onClick={() => refresh.mutate()}
        >
          <RefreshCw className={cn(refresh.isPending && "animate-spin")} />
          Build this week now
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          The summary could not be loaded. Only administrators can read it.
        </p>
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !latest || !d ? (
        <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          No summary yet. One is built every Monday morning for the week just
          gone. Use “Build this week now” to see the last seven days straight
          away.
        </p>
      ) : (
        <>
          <p className="px-1 text-sm text-muted-foreground">
            {day(latest.week_from)} to {day(latest.week_to)}
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile
              to="/money"
              label="Money in"
              value={formatPence(d.money_in_pence)}
              detail="Customer payments and other money in"
            />
            <Tile
              to="/money"
              label="Money out"
              value={formatPence(d.money_out_pence)}
              detail="Bills paid and other money out"
            />
            <Tile
              label="Net"
              value={formatPence(net)}
              detail="In less out, before tax"
              warn={net < 0}
            />
            <Tile
              to="/owed"
              label="Owed to you"
              value={formatPence(d.owed_to_you_pence)}
              detail={
                d.owed_late_count > 0
                  ? `${d.owed_late_count} late (${formatPence(d.owed_late_pence)})`
                  : plural(
                      d.owed_to_you_count,
                      "unpaid invoice",
                      "unpaid invoices",
                    )
              }
              warn={d.owed_late_count > 0}
            />
            <Tile
              to="/owed"
              label="You owe suppliers"
              value={formatPence(d.you_owe_pence)}
              detail={
                d.bills_late_count > 0
                  ? `${d.bills_late_count} late`
                  : d.bills_due_week_count > 0
                    ? `${plural(d.bills_due_week_count, "bill", "bills")} due this week (${formatPence(d.bills_due_week_pence)})`
                    : "Nothing due this week"
              }
              warn={d.bills_late_count > 0}
            />
            <Tile
              to="/stock"
              label="Low stock"
              value={String(d.low_stock_count)}
              detail={
                d.low_stock_count === 1 ? "item to reorder" : "items to reorder"
              }
              warn={d.low_stock_count > 0}
            />
            <Tile
              to="/orders"
              label="Orders due"
              value={String(d.orders_due_count)}
              detail="Delivery due in the next 7 days"
            />
            <Tile
              to="/messenger_inbox"
              label="Waiting on you"
              value={String(d.customers_waiting_count)}
              detail="Customers whose last message is unanswered"
              warn={d.customers_waiting_count > 0}
            />
          </div>

          <LinkedInWeek from={latest.week_from} to={latest.week_to} />

          {earlier.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="px-1 text-sm font-semibold text-muted-foreground">
                Earlier weeks
              </h2>
              <div className="divide-y overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)]">
                {earlier.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"
                  >
                    <span className="w-28 font-medium">
                      {day(r.week_from)} to {day(r.week_to)}
                    </span>
                    <span className="tabular-nums">
                      In {formatPence(r.data.money_in_pence)}
                    </span>
                    <span className="tabular-nums">
                      Out {formatPence(r.data.money_out_pence)}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      Owed to you {formatPence(r.data.owed_to_you_pence)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
};
