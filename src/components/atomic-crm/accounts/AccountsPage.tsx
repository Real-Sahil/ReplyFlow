import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ExportDialogButton } from "../exports/ExportDialog";
import { accountExport } from "../exports/exportConfigs";
import { fetchAllRows } from "../exports/exportPaging";
import { periodBounds, type PeriodPreset } from "../exports/periods";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPence } from "../quotes/quoteMath";

export type AccountLine = {
  order_id: number;
  reference: string;
  product: string | null;
  customer: string | null;
  price_pence: number;
  paid_pence: number;
  entry_at: string;
};

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "month", label: "A chosen month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last three months" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom dates" },
  { value: "all", label: "All dates" },
];

const thisMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

// Start of the first day and start of the day after the last, in the browser's local time.
const moments = (range: { from: string | null; to: string | null }) => {
  if (!range.from) return { from: null, toExclusive: null };
  const next = new Date(`${range.to ?? range.from}T00:00:00`);
  next.setDate(next.getDate() + 1);
  return {
    from: new Date(`${range.from}T00:00:00`).toISOString(),
    toExclusive: next.toISOString(),
  };
};

// The account: each order that has been delivered and paid in full, newest last, with the
// totals worked out from those lines. There is no VAT.
export const AccountsPage = () => {
  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  const [month, setMonth] = useState(thisMonth());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range = periodBounds(preset, { month, from, to });
  const bounds = moments(range);

  const {
    data: lines = [],
    isPending,
    error,
  } = useQuery({
    queryKey: ["account_lines", preset, month, from, to],
    queryFn: () =>
      fetchAllRows<AccountLine>(async (start, end) => {
        let query = getSupabaseClient()
          .from("account_ledger")
          .select(
            "order_id, reference, product, customer, price_pence, paid_pence, entry_at",
          );
        if (bounds.from) query = query.gte("entry_at", bounds.from);
        if (bounds.toExclusive)
          query = query.lt("entry_at", bounds.toExclusive);
        const response = await query
          .order("entry_at", { ascending: true })
          .range(start, end);
        return {
          data: (response.data ?? null) as unknown as AccountLine[] | null,
          error: response.error,
        };
      }),
  });

  const totals = lines.reduce(
    (sum, line) => ({
      price: sum.price + Number(line.price_pence),
      paid: sum.paid + Number(line.paid_pence),
    }),
    { price: 0, paid: 0 },
  );

  return (
    <div className="mt-2 flex flex-col gap-4 px-4 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex min-w-0 flex-1 items-center gap-2 text-2xl font-semibold tracking-tight">
          <Landmark className="size-6 text-muted-foreground" /> Account
        </h1>
        <ExportDialogButton config={accountExport()} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="account-period">Period</Label>
          <select
            id="account-period"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            value={preset}
            onChange={(e) => setPreset(e.target.value as PeriodPreset)}
          >
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {preset === "month" && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="account-month">Month</Label>
            <Input
              id="account-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
        )}
        {preset === "custom" && (
          <>
            <div className="flex flex-col gap-1">
              <Label htmlFor="account-from">From</Label>
              <Input
                id="account-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="account-to">To</Label>
              <Input
                id="account-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label="Orders" value={lines.length.toLocaleString("en-GB")} />
        <Figure label="Sales" value={formatPence(totals.price)} />
        <Figure label="Paid" value={formatPence(totals.paid)} />
        <Figure
          label="Still owed"
          value={formatPence(totals.price - totals.paid)}
        />
      </dl>

      {isPending && (
        <p className="text-sm text-muted-foreground" role="status">
          Loading the account…
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive">
          The account could not be loaded.
        </p>
      )}
      {!isPending && lines.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No delivered and paid orders in this period. An order appears here
          once it is delivered and its balance is paid.
        </p>
      )}
      {lines.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th className="px-3 py-2 text-right font-medium">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((line) => {
                const when = new Date(line.entry_at);
                return (
                  <tr key={line.order_id}>
                    <td className="px-3 py-2 tabular-nums">
                      {when.toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {when.toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2">{line.reference}</td>
                    <td className="px-3 py-2">{line.product ?? "—"}</td>
                    <td className="px-3 py-2">{line.customer || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPence(Number(line.price_pence))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPence(Number(line.paid_pence))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 font-semibold">
              <tr>
                <td className="px-3 py-2" colSpan={5}>
                  Total for {lines.length}{" "}
                  {lines.length === 1 ? "order" : "orders"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatPence(totals.price)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatPence(totals.paid)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

const Figure = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border p-3">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="text-lg font-semibold tabular-nums">{value}</dd>
  </div>
);
