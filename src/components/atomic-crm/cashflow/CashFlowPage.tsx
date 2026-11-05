import { lazy, Suspense, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TrendingDown, TrendingUp, Waves } from "lucide-react";
import { useGetIdentity, useNotify } from "ra-core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { useBills } from "../finance/useBills";
import { useMoney } from "../finance/useMoney";
import { useOwedByCustomers } from "../finance/useOwed";
import { todayIso } from "../importer/engine";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPence } from "../quotes/quoteMath";
import { balanceAgeDays, buildForecast } from "./forecast";
import { CASH_BALANCE_KEY, useCashBalance } from "./useCashBalance";
import {
  exclusionKeys,
  useExclusions,
  useInvoicedMonths,
  useLeaveOut,
} from "./useForecastLinks";

const BalanceChart = lazy(() =>
  import("./BalanceChart").then((m) => ({ default: m.BalanceChart })),
);

const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

const Tile = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bad" | "good";
}) => (
  <div className="rounded-xl bg-card p-3 shadow-[var(--shadow-card)]">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p
      className={cn(
        "mt-1 text-xl font-semibold tabular-nums",
        tone === "bad" && "text-destructive",
      )}
    >
      {value}
    </p>
  </div>
);

// Parse "1,250.50" or "-300" into pence. Negative balances (an overdraft) are allowed.
const parseBalance = (text: string): number | null => {
  const cleaned = text.replace(/[£,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number.parseFloat(cleaned) * 100);
};

const BalanceEntry = ({ onDone }: { onDone: () => void }) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const pence = parseBalance(text);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseClient()
        .from("cash_balances")
        .insert({ balance_pence: pence, as_at: todayIso() });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CASH_BALANCE_KEY });
      onDone();
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cf-balance">Money in the bank today (£)</Label>
        <Input
          id="cf-balance"
          inputMode="decimal"
          autoFocus
          placeholder="4,250.00"
          className="w-44"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <Button
        disabled={pence === null || save.isPending}
        onClick={() => save.mutate()}
      >
        Save
      </Button>
      <Button variant="ghost" onClick={onDone}>
        Cancel
      </Button>
    </div>
  );
};

export const CashFlowPage = () => {
  const { identity } = useGetIdentity();
  const isAdmin = !!identity?.administrator;
  const today = todayIso();
  const [days, setDays] = useState(30);
  const [lateDays, setLateDays] = useState<string>("14");
  const [editing, setEditing] = useState(false);
  const balance = useCashBalance(isAdmin);
  const planned = useMoney({ state: "planned" });
  const bills = useBills({ status: "unpaid" });
  const owed = useOwedByCustomers();
  const exclusions = useExclusions(isAdmin);
  const invoicedMonths = useInvoicedMonths(isAdmin);
  const { leaveOut, putBack } = useLeaveOut();

  const forecast = useMemo(() => {
    if (!balance.data) return null;
    return buildForecast({
      openingPence: balance.data.balance_pence,
      today,
      days,
      leftOut: exclusionKeys(exclusions.data ?? []),
      invoiced: invoicedMonths.data ?? new Set<string>(),
      planned: (planned.data ?? []).map((e) => ({
        id: e.id,
        recurring_item_id: e.recurring_item_id,
        entry_date: e.entry_date,
        direction: e.direction,
        amount_pence: e.amount_pence,
        counterparty: e.counterparty,
        note: e.note,
      })),
      bills: (bills.data ?? []).map((b) => ({
        id: b.id,
        supplier_name: b.supplier_name,
        bill_date: b.bill_date,
        due_date: b.due_date,
        gross_pence: b.gross_pence,
        description: b.description,
      })),
      owed: (owed.data ?? []).map((o) => ({
        order_id: o.order_id,
        customer_name: o.customer_name,
        order_reference: o.order_reference,
        due_date: o.due_date,
        owed_pence: o.owed_pence,
      })),
      lateCustomerDays: lateDays === "never" ? null : Number(lateDays),
    });
  }, [
    balance.data,
    planned.data,
    bills.data,
    owed.data,
    exclusions.data,
    invoicedMonths.data,
    days,
    lateDays,
    today,
  ]);

  if (!identity) return null;
  if (!isAdmin) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Only administrators can see this page.
      </p>
    );
  }
  const select = "h-9 rounded-md border bg-transparent px-2 text-sm";
  const loading =
    balance.isPending || planned.isPending || bills.isPending || owed.isPending;
  const failed =
    balance.isError || planned.isError || bills.isError || owed.isError;
  const age = balance.data ? balanceAgeDays(balance.data.as_at, today) : 0;

  return (
    <div className="mx-auto mt-2 flex max-w-4xl flex-col gap-4 px-4 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title flex min-w-0 basis-full items-center gap-2 text-2xl font-semibold tracking-tight sm:basis-0 sm:flex-1">
          <Waves className="size-6 text-muted-foreground" /> Cash flow
        </h1>
        <select
          aria-label="How far ahead"
          className={select}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={30}>Next 30 days</option>
          <option value={60}>Next 60 days</option>
          <option value={90}>Next 90 days</option>
        </select>
      </div>

      {failed ? (
        <p className="text-sm text-muted-foreground">
          This could not be loaded. Please try again.
        </p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            {editing || !balance.data ? (
              <>
                {!balance.data ? (
                  <p className="mb-3 text-sm text-muted-foreground">
                    Enter what is in the bank today and this shows when money is
                    likely to be tight, from what is planned, what bills are due
                    and what customers owe.
                  </p>
                ) : null}
                <BalanceEntry onDone={() => setEditing(false)} />
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    In the bank, as you entered it on {day(balance.data.as_at)}
                  </p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatPence(balance.data.balance_pence)}
                  </p>
                  {age > 3 ? (
                    <p className="text-xs text-warning">
                      That was {age} days ago. Update it for a better picture.
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(true)}
                >
                  Update the balance
                </Button>
              </div>
            )}
          </div>

          {forecast ? (
            <>
              {forecast.firstBelowZero ? (
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm"
                >
                  <TrendingDown className="mt-0.5 size-5 shrink-0 text-destructive" />
                  <p>
                    <strong>
                      Money may run short on {day(forecast.firstBelowZero)}.
                    </strong>{" "}
                    The lowest point is {formatPence(forecast.lowest.balance)}{" "}
                    on {day(forecast.lowest.date)}. Chase what customers owe, or
                    move a payment, before then.
                  </p>
                </div>
              ) : (
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-xl bg-card p-3 text-sm shadow-[var(--shadow-card)]"
                >
                  <TrendingUp className="mt-0.5 size-5 shrink-0 text-primary" />
                  <p>
                    Money looks fine for the next {days} days. The lowest point
                    is {formatPence(forecast.lowest.balance)} on{" "}
                    {day(forecast.lowest.date)}.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Tile
                  label="Expected in"
                  value={formatPence(forecast.totalIn)}
                />
                <Tile
                  label="Expected out"
                  value={formatPence(forecast.totalOut)}
                />
                <Tile
                  label="Lowest point"
                  value={formatPence(forecast.lowest.balance)}
                  tone={forecast.lowest.balance < 0 ? "bad" : undefined}
                />
                <Tile
                  label={`Balance on ${day(forecast.days[forecast.days.length - 1].date)}`}
                  value={formatPence(forecast.endBalance)}
                  tone={forecast.endBalance < 0 ? "bad" : undefined}
                />
              </div>

              <div className="rounded-xl bg-card p-3 shadow-[var(--shadow-card)]">
                <Suspense fallback={<div className="h-64" />}>
                  <BalanceChart days={forecast.days} />
                </Suspense>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Label htmlFor="cf-late">
                  Customers already late pay after
                </Label>
                <select
                  id="cf-late"
                  className={select}
                  value={lateDays}
                  onChange={(e) => setLateDays(e.target.value)}
                >
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                  <option value="never">Do not count them</option>
                </select>
                {forecast.leftOutPence > 0 ? (
                  <span className="text-muted-foreground">
                    {formatPence(forecast.leftOutPence)} of late payments is
                    left out.
                  </span>
                ) : null}
              </div>

              <h2 className="text-sm font-medium text-muted-foreground">
                What is behind it
              </h2>
              {forecast.flows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing is planned, due or owed in this period.
                </p>
              ) : (
                <ul className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
                  {forecast.flows.map((f, i) => (
                    <li
                      key={`${f.date}-${i}`}
                      className="flex items-center justify-between gap-3 border-b px-4 py-2.5 text-sm last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate">{f.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {day(f.date)} ·{" "}
                          {f.source === "bill"
                            ? "Bill"
                            : f.source === "customer"
                              ? "Customer"
                              : "Planned"}
                          {f.late ? " · already late" : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <p
                          className={cn(
                            "font-medium tabular-nums",
                            f.pence < 0 ? "" : "text-primary",
                          )}
                        >
                          {f.pence < 0 ? "-" : "+"}
                          {formatPence(Math.abs(f.pence))}
                        </p>
                        {f.key ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            disabled={leaveOut.isPending}
                            onClick={() => leaveOut.mutate(f.key as string)}
                          >
                            Leave out
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {forecast.skipped.length > 0 ? (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    Not counted ({forecast.skipped.length})
                  </summary>
                  <ul className="mt-2 overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
                    {forecast.skipped.map((f) => (
                      <li
                        key={f.key ?? f.label}
                        className="flex items-center justify-between gap-3 border-b px-4 py-2.5 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate">{f.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {day(f.date)} ·{" "}
                            {f.reason === "invoiced"
                              ? "Counted through its invoice instead"
                              : "You left this out"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="tabular-nums text-muted-foreground">
                            {f.pence < 0 ? "-" : "+"}
                            {formatPence(Math.abs(f.pence))}
                          </span>
                          {f.reason === "left_out" && f.key ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              disabled={putBack.isPending}
                              onClick={() => putBack.mutate(f.key as string)}
                            >
                              Put back
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <p className="text-xs text-muted-foreground">
                A guide, not a promise. Link a repeating invoice to its
                repeating money-in entry and, once the invoice is issued, that
                month is counted through the invoice only. Use Leave out for
                anything else that should not count.
              </p>
            </>
          ) : null}
        </>
      )}
    </div>
  );
};
