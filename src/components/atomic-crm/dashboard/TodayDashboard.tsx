import { useGetIdentity, useGetList } from "ra-core";
import { Link } from "react-router";
import {
  ArrowRight,
  Clock,
  MessageCircle,
  Package,
  Receipt,
  Reply,
} from "lucide-react";
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

const Tile = ({
  to,
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "alert";
}) => (
  <Link to={to} className="group block">
    <Card className="h-full gap-2 p-5 transition-all group-hover:-translate-y-0.5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full bg-accent text-accent-foreground",
            tone === "alert" && "bg-destructive/10 text-destructive",
          )}
        >
          <Icon className="size-4" />
        </span>
        {label}
      </div>
      <div className="text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </Card>
  </Link>
);

const SectionTitle = ({
  icon: Icon,
  children,
  to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  to?: string;
}) => (
  <div className="mb-2 flex items-center">
    <Icon className="mr-3 size-5 text-muted-foreground" />
    <h2 className="flex-1 text-lg font-semibold">{children}</h2>
    {to && (
      <Link to={to} className="flex items-center gap-1 text-sm text-primary">
        View all <ArrowRight className="size-3.5" />
      </Link>
    )}
  </div>
);

export const TodayDashboard = () => {
  const { identity } = useGetIdentity();
  const { currency, dealStages } = useConfigurationContext();

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
  const { data: orders } = useGetList<OrderRow>("orders", {
    sort: { field: "id", order: "DESC" },
    pagination: { page: 1, perPage: 200 },
  });

  const needsReply = (inbox ?? []).filter((c) => c.unread && c.window_open);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
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
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {greeting()}
          {identity?.fullName
            ? `, ${String(identity.fullName).split(" ")[0]}`
            : ""}
        </h1>
        <p className="text-muted-foreground">
          {new Date().toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          to="/messenger_inbox"
          icon={MessageCircle}
          label="Need a reply"
          value={needsReply.length}
          hint={
            needsReply.length
              ? "Customers waiting on Messenger"
              : "All caught up"
          }
          tone={needsReply.length ? "alert" : undefined}
        />
        <Tile
          to="/"
          icon={Clock}
          label="Follow-ups due"
          value={dueTasks.length}
          hint="Due today or overdue"
          tone={dueTasks.length ? "alert" : undefined}
        />
        <Tile
          to="/deals"
          icon={Receipt}
          label="Quotes out"
          value={quotes.length}
          hint={
            quoteValue
              ? `${formatPrice(quoteValue * 100, currency)} awaiting a reply`
              : "Awaiting a reply"
          }
        />
        <Tile
          to="/orders"
          icon={Package}
          label="Orders in progress"
          value={activeOrders.length}
          hint={
            orderUpdates.length
              ? `${orderUpdates.length} need a customer update`
              : "No updates overdue"
          }
          tone={orderUpdates.length ? "alert" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <div>
            <SectionTitle icon={Reply} to="/messenger_inbox">
              Needs a reply
            </SectionTitle>
            <Card className="gap-0 overflow-hidden py-0">
              {needsReply.length === 0 && (
                <p className="p-5 text-sm text-muted-foreground">
                  No unread conversations with an open reply window.
                </p>
              )}
              {needsReply.slice(0, 6).map((c) => (
                <Link
                  key={c.contact_id}
                  to="/messenger_inbox"
                  className="flex items-center gap-3 border-b px-5 py-3 last:border-b-0 hover:bg-accent/60"
                >
                  <span className="size-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {c.first_name} {c.last_name}
                    </div>
                    <div className="line-clamp-1 text-sm text-muted-foreground">
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
            </Card>
          </div>

          <div>
            <SectionTitle icon={Package} to="/orders">
              Orders to keep moving
            </SectionTitle>
            <Card className="gap-0 overflow-hidden py-0">
              {activeOrders.length === 0 && (
                <p className="p-5 text-sm text-muted-foreground">
                  No orders in progress.
                </p>
              )}
              {activeOrders.slice(0, 5).map((o) => (
                <Link
                  key={o.id}
                  to={`/orders/${o.id}`}
                  className="flex items-center gap-3 border-b px-5 py-3 last:border-b-0 hover:bg-accent/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {o.reference} · {o.product_summary ?? "Order"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {orderStatusLabel(o.status)}
                      {o.balance_pence
                        ? ` · ${formatPrice(o.balance_pence, currency)} to pay`
                        : ""}
                    </div>
                  </div>
                  {o.next_update_due && o.next_update_due <= today && (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                      Update due
                    </span>
                  )}
                </Link>
              ))}
            </Card>
          </div>

          <div>
            <SectionTitle icon={Receipt} to="/deals">
              Enquiries in the pipeline
            </SectionTitle>
            <Card className="gap-3 p-5">
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

        <div className="flex flex-col gap-6 lg:col-span-2">
          <TasksList />
          <DashboardActivityLog />
        </div>
      </div>
    </div>
  );
};
