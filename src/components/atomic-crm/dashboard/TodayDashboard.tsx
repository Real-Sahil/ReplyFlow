import { useState } from "react";
import { useGetIdentity, useGetList } from "ra-core";
import { Link } from "react-router";
import { ArrowRight, Clock, MessageCircle, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FacebookPagesPrompt } from "../facebook/FacebookPagesPrompt";
import { cn } from "@/lib/utils";

import { formatPrice } from "../products/formatPrice";
import { orderStatusLabel } from "../orders/statuses";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal, Task } from "../types";
import { DashboardActivityLog } from "./DashboardActivityLog";
import { TasksList } from "./TasksList";

type InboxRow = {
  id: number;
  contact_id: number;
  first_name: string;
  last_name: string | null;
  last_body: string | null;
  last_sent_at: string;
  window_open: boolean;
  unread: boolean;
};

type OrderRow = {
  id: number;
  reference: string;
  contact_id: number;
  product_summary: string | null;
  status: string;
  balance_pence: number | null;
  next_update_due: string | null;
};

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12
    ? "Good morning"
    : hour < 18
      ? "Good afternoon"
      : "Good evening";
};

const initials = (first: string, last: string | null) =>
  `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";

// One figure in the overview card. Each links to the list behind it.
const OverviewStat = ({
  to,
  label,
  value,
  hint,
}: {
  to: string;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) => (
  <Link to={to} className="group min-w-0">
    <div className="text-xs font-medium opacity-80">{label}</div>
    <div className="mt-1 text-2xl font-semibold tabular-nums group-hover:underline md:text-3xl">
      {value}
    </div>
    {hint && <div className="mt-0.5 truncate text-xs opacity-80">{hint}</div>}
  </Link>
);

// A summary card for one active order, in the style of the reference's activity cards.
const OrderCard = ({ order, today }: { order: OrderRow; today: string }) => {
  const { currency } = useConfigurationContext();
  const due = !!order.next_update_due && order.next_update_due <= today;
  return (
    <Link to={`/orders/${order.id}`} className="group block">
      <Card className="h-full gap-3 p-5 transition-shadow group-hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {order.product_summary ?? "Order"}
            </div>
            <div className="text-xs text-muted-foreground">
              {order.reference}
            </div>
          </div>
          {due && (
            <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
              Update due
            </span>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {orderStatusLabel(order.status)}
        </div>
        <div className="text-sm font-medium tabular-nums">
          {order.balance_pence
            ? `${formatPrice(order.balance_pence, currency)} to pay`
            : "Paid in full"}
        </div>
      </Card>
    </Link>
  );
};

// Conversations with a switch between "Need a reply" and everything in the inbox.
const ConversationsCard = ({ inbox }: { inbox: InboxRow[] }) => {
  const [view, setView] = useState<"reply" | "all">("reply");
  const needsReply = inbox.filter((c) => c.unread && c.window_open);
  const rows = view === "reply" ? needsReply : inbox;

  return (
    <Card className="gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Conversations</h2>
        <Link
          to="/messenger_inbox"
          className="flex items-center gap-1 text-sm text-primary"
        >
          View all <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <div
        role="group"
        aria-label="Show"
        className="inline-flex w-full rounded-full bg-muted p-1 text-sm"
      >
        {(
          [
            ["reply", `Need a reply (${needsReply.length})`],
            ["all", "All"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            aria-pressed={view === key}
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 transition-colors",
              view === key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {rows.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            {view === "reply"
              ? "No unread conversations with an open reply window."
              : "No Messenger conversations yet."}
          </p>
        )}
        {rows.slice(0, 6).map((c) => (
          <Link
            key={c.contact_id}
            to="/messenger_inbox"
            className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent/60"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initials(c.first_name, c.last_name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="truncate">
                  {c.first_name} {c.last_name}
                </span>
                {c.unread && (
                  <span className="size-2 shrink-0 rounded-full bg-primary" />
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {c.last_body}
              </div>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {new Date(c.last_sent_at).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
};

export const TodayDashboard = () => {
  const { identity } = useGetIdentity();
  const { currency, dealStages } = useConfigurationContext();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const { data: inbox } = useGetList<InboxRow>("messenger_inbox", {
    sort: { field: "last_sent_at", order: "DESC" },
    pagination: { page: 1, perPage: 100 },
  });
  const { data: tasks } = useGetList<Task>("tasks", {
    filter: { "done_date@is": null },
    pagination: { page: 1, perPage: 300 },
  });
  const { data: deals } = useGetList<Deal>("deals", {
    filter: { "archived_at@is": null },
    pagination: { page: 1, perPage: 500 },
  });
  // Counts come from the server, so they are right beyond the rows fetched above.
  const { total: dueTaskTotal } = useGetList<Task>("tasks", {
    filter: {
      "done_date@is": null,
      "due_date@lte": endOfToday.toISOString(),
    },
    pagination: { page: 1, perPage: 1 },
  });
  const { total: quoteTotal } = useGetList<Deal>("deals", {
    filter: { "archived_at@is": null, stage: "proposal-sent" },
    pagination: { page: 1, perPage: 1 },
  });
  const { data: orders } = useGetList<OrderRow>("orders", {
    sort: { field: "id", order: "DESC" },
    pagination: { page: 1, perPage: 200 },
  });

  const needsReply = (inbox ?? []).filter((c) => c.unread && c.window_open);
  const dueTasks = (tasks ?? []).filter(
    (t) => t.due_date && new Date(t.due_date).getTime() <= endOfToday.getTime(),
  );
  const quotes = (deals ?? []).filter((d) => d.stage === "proposal-sent");
  const quoteValue = quotes.reduce((sum, d) => sum + (d.amount ?? 0), 0);
  const activeOrders = (orders ?? []).filter(
    (o) => !["delivered", "completed", "cancelled"].includes(o.status),
  );
  const today = new Date().toISOString().slice(0, 10);
  const orderUpdates = activeOrders.filter(
    (o) => o.next_update_due && o.next_update_due <= today,
  );

  const stageCounts = dealStages
    .map((stage) => ({
      ...stage,
      count: (deals ?? []).filter((d) => d.stage === stage.value).length,
    }))
    .filter((stage) => !["won", "lost"].includes(stage.value));
  const maxCount = Math.max(1, ...stageCounts.map((s) => s.count));

  return (
    <div className="mt-2 flex flex-col gap-6">
      <FacebookPagesPrompt />

      <header>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {greeting()}
          {identity?.fullName
            ? `, ${String(identity.fullName).split(" ")[0]}`
            : ""}
        </h2>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/70 p-5 text-primary-foreground shadow-sm md:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium opacity-90">Overview</h2>
              <Link to="/deals" className="text-xs opacity-90 hover:underline">
                Pipeline
              </Link>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3 md:gap-6">
              <OverviewStat
                to="/messenger_inbox"
                label="Need a reply"
                value={needsReply.length}
              />
              <OverviewStat
                to="/"
                label="Follow-ups due"
                value={dueTaskTotal ?? dueTasks.length}
              />
              <OverviewStat
                to="/deals"
                label="Quotes out"
                value={quoteTotal ?? quotes.length}
                hint={
                  quoteValue
                    ? formatPrice(quoteValue * 100, currency)
                    : undefined
                }
              />
            </div>

            <div className="mt-6">
              <div className="flex h-28 items-end gap-2 md:gap-3">
                {stageCounts.map((stage) => (
                  <div
                    key={stage.value}
                    className="flex h-full flex-1 flex-col justify-end"
                    title={`${stage.label}: ${stage.count}`}
                  >
                    <div
                      className="rounded-t-md bg-white/80 transition-all duration-700"
                      style={{
                        height: `${Math.max(6, (stage.count / maxCount) * 100)}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2 md:gap-3">
                {stageCounts.map((stage) => (
                  <span
                    key={stage.value}
                    className="flex-1 truncate text-center text-xs opacity-80"
                  >
                    {stage.label} · {stage.count}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-3">
            <Link to="/orders" className="group block">
              <Card className="h-full gap-2 p-5 transition-shadow group-hover:shadow-md">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Package className="size-4" /> Orders in progress
                </div>
                <div className="text-3xl font-semibold tabular-nums">
                  {activeOrders.length}
                </div>
                <div className="text-xs text-muted-foreground">
                  {orderUpdates.length
                    ? `${orderUpdates.length} need a customer update`
                    : "No updates overdue"}
                </div>
              </Card>
            </Link>
            <Link to="/messenger_inbox" className="group block">
              <Card className="h-full gap-2 p-5 transition-shadow group-hover:shadow-md">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MessageCircle className="size-4" /> Need a reply
                </div>
                <div className="text-3xl font-semibold tabular-nums">
                  {needsReply.length}
                </div>
                <div className="text-xs text-muted-foreground">
                  {needsReply.length
                    ? "Customers waiting on Messenger"
                    : "All caught up"}
                </div>
              </Card>
            </Link>
            <Link to="/" className="group block">
              <Card className="h-full gap-2 p-5 transition-shadow group-hover:shadow-md">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="size-4" /> Follow-ups due
                </div>
                <div className="text-3xl font-semibold tabular-nums">
                  {dueTaskTotal ?? dueTasks.length}
                </div>
                <div className="text-xs text-muted-foreground">
                  Due today or overdue
                </div>
              </Card>
            </Link>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Orders to keep moving</h2>
              <Link
                to="/orders"
                className="flex items-center gap-1 text-sm text-primary"
              >
                View all <ArrowRight className="size-3.5" />
              </Link>
            </div>
            {activeOrders.length === 0 ? (
              <Card className="p-5 text-sm text-muted-foreground">
                No orders in progress.
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {activeOrders.slice(0, 3).map((o) => (
                  <OrderCard key={o.id} order={o} today={today} />
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Enquiries in the pipeline
              </h2>
              <Link
                to="/deals"
                className="flex items-center gap-1 text-sm text-primary"
              >
                View all <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <Card className="gap-4 p-5">
              {stageCounts.map((stage) => (
                <div
                  key={stage.value}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="w-32 shrink-0 text-muted-foreground">
                    {stage.label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-700"
                      style={{ width: `${(stage.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right tabular-nums">
                    {stage.count}
                  </span>
                </div>
              ))}
            </Card>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <ConversationsCard inbox={inbox ?? []} />
          <TasksList />
          <DashboardActivityLog />
        </div>
      </div>
    </div>
  );
};
