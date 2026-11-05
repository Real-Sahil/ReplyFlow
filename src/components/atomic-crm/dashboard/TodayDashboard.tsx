import { useGetIdentity, useGetList } from "ra-core";
import { Link } from "react-router";
import { ArrowRight, ChevronRight } from "lucide-react";
import { FacebookPagesPrompt } from "../facebook/FacebookPagesPrompt";
import { cn } from "@/lib/utils";
import { windowLeft } from "../inbox/replyWindow";

import { formatPrice } from "../products/formatPrice";
import { orderStatusLabel } from "../orders/statuses";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal, Task } from "../types";
import { overdue, total } from "../finance/owed";
import { expiryLabel, expiryState, needingAttention } from "../people/people";
import { usePeople, usePersonDocuments } from "../people/usePeople";
import {
  flaggedCount,
  owedToStaff,
  waiting,
  waitingTotal,
} from "../claims/claims";
import { useClaims } from "../claims/useClaims";
import { useCashAlert } from "../cashflow/useCashAlert";
import { useHolidayRequests, useTimeEntries } from "../time/useTime";
import {
  assetsNeedingAttention,
  docsNeedingAttention,
  dueLabel,
} from "../paperwork/paperwork";
import { useAssets, useBusinessDocuments } from "../paperwork/usePaperwork";
import { useOwedByCustomers, useOwedToSuppliers } from "../finance/useOwed";
import { formatPence } from "../quotes/quoteMath";
import { DashboardActivityLog } from "./DashboardActivityLog";
import { SetupChecklist } from "./SetupChecklist";
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

const DAY = 24 * 60 * 60 * 1000;

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

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

// A grouped list: rows share one white cell and are split by inset hairlines.
const Group = ({
  title,
  to,
  action,
  tone = "card",
  lead,
  children,
}: {
  title: string;
  to?: string;
  action?: string;
  tone?: "card" | "peach" | "cool";
  lead?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section aria-label={title} className="reveal flex flex-col gap-2">
    <div className="flex items-baseline justify-between gap-3 px-1">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      {to && action ? (
        <Link
          to={to}
          className="rounded-md text-sm text-primary hover:underline"
        >
          {action}
        </Link>
      ) : null}
    </div>
    <div
      className={cn(
        "overflow-hidden rounded-2xl [&>a+a]:relative [&>a+a]:before:absolute [&>a+a]:before:inset-x-5 [&>a+a]:before:top-0 [&>a+a]:before:h-px",
        tone === "card" &&
          "bg-card shadow-[var(--shadow-card)] [&>a+a]:before:bg-border",
        tone === "peach" && "bg-peach [&>a+a]:before:bg-white/70",
        tone === "cool" && "bg-cool [&>a+a]:before:bg-white/70",
      )}
    >
      {lead}
      {children}
    </div>
  </section>
);

const Row = ({
  to,
  title,
  detail,
  trailing,
  urgent,
  lead,
}: {
  to: string;
  title: React.ReactNode;
  detail?: React.ReactNode;
  trailing?: React.ReactNode;
  urgent?: boolean;
  lead?: React.ReactNode;
}) => (
  <Link
    to={to}
    className="press group flex min-h-14 items-center gap-3 px-5 py-3 hover:bg-foreground/[0.04] active:bg-foreground/[0.07]"
  >
    {lead}
    <div className="min-w-0 flex-1">
      <div className="truncate text-[15px] font-medium">{title}</div>
      {detail ? (
        <div className="truncate text-sm text-muted-foreground">{detail}</div>
      ) : null}
    </div>
    {trailing ? (
      <span
        className={cn(
          "shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums",
          urgent ? "bg-warning-soft text-warning" : "text-muted-foreground",
        )}
      >
        {trailing}
      </span>
    ) : null}
    <ChevronRight
      aria-hidden
      className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
    />
  </Link>
);

const Avatar = ({ first, last }: { first: string; last: string | null }) => (
  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-xs font-semibold text-accent-foreground shadow-[var(--shadow-card)]">
    {initials(first, last)}
  </span>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="px-4 py-4 text-sm text-muted-foreground">{children}</p>
);

export const TodayDashboard = () => {
  const { identity } = useGetIdentity();
  const { data: owedCustomers = [] } = useOwedByCustomers();
  const { data: owedSuppliers = [] } = useOwedToSuppliers();
  // Documents running out are for administrators only.
  const isAdmin = !!identity?.administrator;
  const { data: people = [] } = usePeople(isAdmin);
  const { data: claims = [] } = useClaims(isAdmin);
  const cashAlert = useCashAlert(isAdmin);
  const { data: timeEntries = [] } = useTimeEntries(isAdmin);
  const { data: holidayRequests = [] } = useHolidayRequests(isAdmin);
  const hoursWaiting = timeEntries.filter((e) => e.status === "pending");
  const holidayWaiting = holidayRequests.filter((r) => r.status === "pending");
  const { data: businessDocs = [] } = useBusinessDocuments(isAdmin);
  const { data: equipment = [] } = useAssets(isAdmin);
  const paperworkDue = docsNeedingAttention(businessDocs, new Date());
  const serviceDue = assetsNeedingAttention(equipment, new Date());
  const { data: personDocuments = [] } = usePersonDocuments(isAdmin);
  const expiring = needingAttention(personDocuments, people, new Date());
  const { currency, dealStages } = useConfigurationContext();
  const now = Date.now();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const { data: inbox } = useGetList<InboxRow>("messenger_inbox", {
    sort: { field: "last_sent_at", order: "DESC" },
    pagination: { page: 1, perPage: 100 },
  });
  const { data: deals } = useGetList<Deal>("deals", {
    filter: { "archived_at@is": null },
    pagination: { page: 1, perPage: 500 },
  });
  const { data: tasks } = useGetList<Task>("tasks", {
    filter: { "done_date@is": null },
    pagination: { page: 1, perPage: 300 },
  });
  // Counts come from the server, so they are right beyond the rows fetched above.
  const { total: quoteTotal } = useGetList<Deal>("deals", {
    filter: { "archived_at@is": null, stage: "proposal-sent" },
    pagination: { page: 1, perPage: 1 },
  });
  const { data: orders } = useGetList<OrderRow>("orders", {
    sort: { field: "id", order: "DESC" },
    pagination: { page: 1, perPage: 200 },
  });

  // Soonest window to close first: that is the order to answer in.
  const needsReply = (inbox ?? [])
    .filter((c) => c.unread && c.window_open)
    .sort(
      (a, b) =>
        new Date(a.last_sent_at).getTime() - new Date(b.last_sent_at).getTime(),
    );
  const dueTasks = (tasks ?? [])
    .filter(
      (t) =>
        t.due_date && new Date(t.due_date).getTime() <= endOfToday.getTime(),
    )
    .sort(
      (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime(),
    );
  const quotes = (deals ?? []).filter((d) => d.stage === "proposal-sent");
  const quoteValue = quotes.reduce((sum, d) => sum + (d.amount ?? 0), 0);
  const quotesLongest = [...quotes]
    .sort(
      (a, b) =>
        new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime(),
    )
    .slice(0, 4);
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

  const closingSoon = needsReply.filter(
    (c) => windowLeft(c.last_sent_at, now).urgent,
  ).length;
  const summary = [
    needsReply.length
      ? `${plural(needsReply.length, "person is", "people are")} waiting on a reply${
          closingSoon
            ? `, and ${closingSoon} close${closingSoon === 1 ? "s" : ""} soon`
            : ""
        }.`
      : "Nobody is waiting on a reply.",
    quotes.length
      ? `You have ${plural(quoteTotal ?? quotes.length, "quote")} out, worth ${formatPrice(quoteValue * 100, currency)}.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const attentionCount =
    needsReply.length + dueTasks.length + orderUpdates.length;

  return (
    <div className="flex flex-col gap-8">
      <FacebookPagesPrompt />

      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {greeting()}
          {identity?.fullName
            ? `, ${String(identity.fullName).split(" ")[0]}`
            : ""}
        </h1>
        <p className="max-w-[60ch] text-base text-muted-foreground">
          {summary}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex min-w-0 flex-col gap-8">
          {isAdmin ? <SetupChecklist /> : null}

          <Group
            title="Needs attention"
            to="/messenger_inbox"
            action="Open inbox"
            tone="peach"
            lead={
              needsReply[0] ? (
                <div className="p-3 pb-1">
                  <Link
                    to="/messenger_inbox"
                    className="glass press group flex items-center gap-3 rounded-2xl p-3 pl-4 hover:shadow-[var(--shadow-lift)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted-foreground">
                        Reply first
                      </span>
                      <span className="block truncate text-[15px] font-medium">
                        {`${needsReply[0].first_name} ${needsReply[0].last_name ?? ""}`.trim()}
                        <span className="ml-2 font-mono text-xs text-warning tabular-nums">
                          {windowLeft(needsReply[0].last_sent_at, now).label}
                        </span>
                      </span>
                    </span>
                    <span className="icon-tile flex size-9 shrink-0 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5">
                      <ArrowRight aria-hidden className="size-4" />
                    </span>
                  </Link>
                </div>
              ) : null
            }
          >
            {attentionCount === 0 ? (
              <Empty>You are all caught up. Nothing is waiting on you.</Empty>
            ) : null}
            {needsReply.slice(0, 5).map((c) => {
              const left = windowLeft(c.last_sent_at, now);
              return (
                <Row
                  key={`c${c.contact_id}`}
                  to="/messenger_inbox"
                  lead={<Avatar first={c.first_name} last={c.last_name} />}
                  title={`${c.first_name} ${c.last_name ?? ""}`.trim()}
                  detail={c.last_body}
                  trailing={left.label}
                  urgent={left.urgent}
                />
              );
            })}
            {dueTasks.slice(0, 4).map((t) => (
              <Row
                key={`t${t.id}`}
                to={`/contacts/${t.contact_id}/show`}
                title={t.text}
                detail={
                  new Date(t.due_date).getTime() < now - DAY
                    ? "Follow-up, overdue"
                    : "Follow-up, due today"
                }
                trailing={new Date(t.due_date).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}
              />
            ))}
            {orderUpdates.slice(0, 3).map((o) => (
              <Row
                key={`o${o.id}`}
                to={`/orders/${o.id}`}
                title={o.product_summary ?? "Order"}
                detail={`${o.reference}, customer update due`}
                trailing="Update due"
                urgent
              />
            ))}
          </Group>

          <Group title="Orders in progress" to="/orders" action="See all">
            {activeOrders.length === 0 ? (
              <Empty>No orders in progress.</Empty>
            ) : null}
            {activeOrders.slice(0, 4).map((o) => (
              <Row
                key={o.id}
                to={`/orders/${o.id}`}
                title={o.product_summary ?? "Order"}
                detail={`${o.reference}, ${orderStatusLabel(o.status)}`}
                trailing={
                  o.balance_pence
                    ? `${formatPrice(o.balance_pence, currency)} to pay`
                    : "Paid"
                }
              />
            ))}
          </Group>

          {cashAlert?.firstBelowZero ? (
            <Group title="Cash flow" to="/cashflow" action="See the forecast">
              <Row
                to="/cashflow"
                title="Money may run short"
                detail={`Around ${new Date(`${cashAlert.firstBelowZero}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}. Chase what is owed or move a payment.`}
                trailing={formatPence(cashAlert.lowest.balance)}
                urgent
              />
            </Group>
          ) : null}

          {owedCustomers.length > 0 || owedSuppliers.length > 0 ? (
            <Group title="Money" to="/owed" action="See all">
              {owedCustomers.length > 0 ? (
                <Row
                  to="/owed"
                  title="Owed to you"
                  detail={
                    overdue(owedCustomers, new Date()).length > 0
                      ? `${overdue(owedCustomers, new Date()).length} late, ${owedCustomers.length} unpaid in all`
                      : `${owedCustomers.length} unpaid`
                  }
                  trailing={formatPence(total(owedCustomers))}
                  urgent={overdue(owedCustomers, new Date()).length > 0}
                />
              ) : null}
              {owedSuppliers.length > 0 ? (
                <Row
                  to="/owed"
                  title="You owe suppliers"
                  detail={
                    overdue(owedSuppliers, new Date()).length > 0
                      ? `${overdue(owedSuppliers, new Date()).length} late, ${owedSuppliers.length} unpaid in all`
                      : `${owedSuppliers.length} unpaid`
                  }
                  trailing={formatPence(total(owedSuppliers))}
                  urgent={overdue(owedSuppliers, new Date()).length > 0}
                />
              ) : null}
            </Group>
          ) : null}

          {isAdmin &&
          (waiting(claims).length > 0 || owedToStaff(claims) > 0) ? (
            <Group title="Staff expenses" to="/claims" action="See all">
              {waiting(claims).length > 0 ? (
                <Row
                  to="/claims"
                  title="Claims waiting for you"
                  detail={`${waiting(claims).length} to approve${flaggedCount(claims) > 0 ? `, ${flaggedCount(claims)} may be duplicates` : ""}`}
                  trailing={formatPence(waitingTotal(claims))}
                  urgent
                />
              ) : null}
              {owedToStaff(claims) > 0 ? (
                <Row
                  to="/claims"
                  title="Approved, to pay back"
                  detail="Mark as paid once you have sent the money"
                  trailing={formatPence(owedToStaff(claims))}
                />
              ) : null}
            </Group>
          ) : null}

          {isAdmin && (hoursWaiting.length > 0 || holidayWaiting.length > 0) ? (
            <Group title="Staff time" to="/hours" action="See all">
              {hoursWaiting.length > 0 ? (
                <Row
                  to="/hours"
                  title="Hours waiting for you"
                  detail={`${hoursWaiting.length} ${hoursWaiting.length === 1 ? "entry" : "entries"} to approve`}
                  trailing={`${Math.round(hoursWaiting.reduce((s, e) => s + Number(e.hours), 0) * 10) / 10}h`}
                  urgent
                />
              ) : null}
              {holidayWaiting.length > 0 ? (
                <Row
                  to="/holiday"
                  title="Holiday requests"
                  detail={`${holidayWaiting.length} to decide`}
                  trailing={`${holidayWaiting.reduce((s, r) => s + Number(r.days), 0)} days`}
                  urgent
                />
              ) : null}
            </Group>
          ) : null}

          {isAdmin && (paperworkDue.length > 0 || serviceDue.length > 0) ? (
            <Group title="Business paperwork" to="/paperwork" action="See all">
              {paperworkDue.slice(0, 3).map((d) => (
                <Row
                  key={`doc-${d.id}`}
                  to="/paperwork"
                  title={d.title}
                  detail={expiryLabel(d.expires_on, new Date())}
                  trailing={
                    expiryState(d.expires_on, new Date()) === "expired"
                      ? "Expired"
                      : "Soon"
                  }
                  urgent
                />
              ))}
              {serviceDue.slice(0, 3).map((a) => (
                <Row
                  key={`asset-${a.id}`}
                  to="/assets"
                  title={`${a.name}: service or test`}
                  detail={dueLabel(a.next_service_date, new Date())}
                  trailing={
                    expiryState(a.next_service_date, new Date()) === "expired"
                      ? "Overdue"
                      : "Soon"
                  }
                  urgent
                />
              ))}
            </Group>
          ) : null}

          {isAdmin && expiring.length > 0 ? (
            <Group title="People" to="/people" action="See all">
              {expiring.slice(0, 4).map((d) => (
                <Row
                  key={d.id}
                  to="/people"
                  title={`${people.find((p) => p.id === d.person_id)?.full_name ?? "Someone"}: ${d.title}`}
                  detail={expiryLabel(d.expires_on, new Date())}
                  trailing={
                    expiryState(d.expires_on, new Date()) === "expired"
                      ? "Expired"
                      : "Soon"
                  }
                  urgent
                />
              ))}
            </Group>
          ) : null}

          <Group
            title="Enquiries in the pipeline"
            to="/deals"
            action="Open pipeline"
          >
            {stageCounts.map((stage) => (
              <Link
                key={stage.value}
                to="/deals"
                className="group flex min-h-12 items-center gap-3 px-4 py-2 text-sm hover:bg-muted/70"
              >
                <span className="w-32 shrink-0 font-medium">{stage.label}</span>
                <span
                  aria-hidden
                  className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                >
                  <span
                    className="block h-full origin-left rounded-full bg-primary transition-transform duration-700 ease-[var(--spring)]"
                    style={{ transform: `scaleX(${stage.count / maxCount})` }}
                  />
                </span>
                <span className="w-8 text-right font-mono tabular-nums">
                  {stage.count}
                </span>
              </Link>
            ))}
          </Group>
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          <Group
            title="Quotes waiting longest"
            to="/deals"
            action="See all"
            tone="cool"
          >
            {quotesLongest.length === 0 ? (
              <Empty>No quotes are out.</Empty>
            ) : null}
            {quotesLongest.map((d) => {
              const days = Math.max(
                0,
                Math.floor((now - new Date(d.updated_at).getTime()) / DAY),
              );
              return (
                <Row
                  key={d.id}
                  to={`/deals/${d.id}/show`}
                  title={d.name}
                  detail={`${plural(days, "day")} with no change`}
                  trailing={formatPrice(d.amount * 100, currency)}
                />
              );
            })}
          </Group>
          <TasksList />
          <DashboardActivityLog />
        </div>
      </div>
    </div>
  );
};
