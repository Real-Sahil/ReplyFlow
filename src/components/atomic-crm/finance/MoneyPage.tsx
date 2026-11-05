import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { BookOpen, FileSpreadsheet, Plus } from "lucide-react";
import { useCanAccess, useGetIdentity, useNotify } from "ra-core";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ExportDialogButton } from "../exports/ExportDialog";
import { moneyLedgerExport } from "../exports/exportConfigs";
import { fetchAllRows } from "../exports/exportPaging";
import { periodBounds, type PeriodPreset } from "../exports/periods";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPence } from "../quotes/quoteMath";
import { openReceipt } from "./BillsPage";
import { downloadCashBookPdf, type CashRow } from "./cashBookPdf";
import { useIsAccountant } from "../misc/useIsAccountant";
import { ImportDialog } from "../importer/ImportDialog";
import { moneyDuplicate } from "../importer/duplicates";
import { fetchExistingMoney } from "../importer/duplicatesFetch";
import { moneySpec } from "../importer/specs";
import { MileageDialog } from "./MileageDialog";
import { useBusinessSettings } from "./useBusinessSettings";
import { MoneyDialog } from "./MoneyDialog";
import {
  CHANNEL_LABEL,
  METHOD_LABEL,
  MONEY_KEY,
  type MoneyEntry,
} from "./moneyTypes";
import { useMoney, useMoneyCategories } from "./useMoney";

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last three months" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom dates" },
  { value: "all", label: "All dates" },
];

const day = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-GB");

// The money book: every movement of money in or out, entered whenever it happens, each with the
// note that explains it. Planned entries are money expected, not yet happened.
export const MoneyPage = () => {
  const notify = useNotify();
  const readOnly = useIsAccountant();
  const [mileage, setMileage] = useState(false);
  const [importing, setImporting] = useState(false);
  const { identity } = useGetIdentity();
  const queryClient = useQueryClient();
  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [direction, setDirection] = useState("");
  const [state, setState] = useState("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<MoneyEntry | "in" | "out" | null>(
    null,
  );
  const [voiding, setVoiding] = useState<MoneyEntry | null>(null);
  const [reason, setReason] = useState("");
  const range = periodBounds(preset, { from, to });
  const {
    data: entries = [],
    isPending,
    error,
  } = useMoney({ ...range, direction, state, category });
  const { data: categories = [] } = useMoneyCategories();
  const { data: settings } = useBusinessSettings();
  const { canAccess: isAdmin } = useCanAccess({
    resource: "configuration",
    action: "edit",
  });
  const [making, setMaking] = useState(false);

  // The PDF covers everything that moved in the period: customer payments, supplier bills and
  // money-book entries, not just the rows on this screen.
  const makePdf = async () => {
    setMaking(true);
    try {
      const rows = await fetchAllRows<CashRow>(async (start, end) => {
        let query = getSupabaseClient().from("cash_book").select("*");
        if (range.from) query = query.gte("entry_date", range.from);
        if (range.to) query = query.lte("entry_date", range.to);
        const response = await query
          .order("entry_date", { ascending: true })
          .range(start, end);
        return {
          data: (response.data ?? null) as unknown as CashRow[] | null,
          error: response.error,
        };
      });
      if (rows.length === 0) {
        notify("Nothing in this period.", { type: "warning" });
        return;
      }
      await downloadCashBookPdf({
        businessName: settings?.trading_name || settings?.legal_name || "",
        periodLabel: range.from
          ? `${range.from} to ${range.to ?? range.from}`
          : "All dates",
        rows,
        includesPrivate: !!isAdmin,
      });
    } catch (e) {
      notify((e as Error).message, { type: "error" });
    } finally {
      setMaking(false);
    }
  };

  const live = entries.filter((e) => e.state !== "void");
  const sum = (xs: MoneyEntry[]) => xs.reduce((a, e) => a + e.amount_pence, 0);
  const inDone = sum(
    live.filter((e) => e.direction === "in" && e.status === "done"),
  );
  const outDone = sum(
    live.filter((e) => e.direction === "out" && e.status === "done"),
  );
  const inPlanned = sum(
    live.filter((e) => e.direction === "in" && e.status === "planned"),
  );
  const outPlanned = sum(
    live.filter((e) => e.direction === "out" && e.status === "planned"),
  );

  const change = useMutation({
    mutationFn: async (args: {
      id: number;
      patch: Record<string, unknown>;
    }) => {
      const { error: updateError } = await getSupabaseClient()
        .from("money_entries")
        .update(args.patch)
        .eq("id", args.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MONEY_KEY }),
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  const rowActions = (e: MoneyEntry) => (
    <>
      {e.receipt_path && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openReceipt(e.receipt_path!)}
        >
          Receipt
        </Button>
      )}
      {!readOnly && e.state === "planned" && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            change.mutate({
              id: e.id,
              patch: {
                status: "done",
                entry_date: new Date().toLocaleDateString("en-CA"),
                payment_method: "bank_transfer",
              },
            })
          }
        >
          Mark done
        </Button>
      )}
      {!readOnly && e.state !== "void" && (
        <>
          <Button variant="ghost" size="sm" onClick={() => setEditing(e)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setVoiding(e)}>
            Void
          </Button>
        </>
      )}
    </>
  );

  return (
    <div className="mt-2 flex flex-col gap-4 px-4 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title flex min-w-0 basis-full items-center gap-2 text-2xl font-semibold tracking-tight sm:basis-0 sm:flex-1">
          <BookOpen className="size-6 text-muted-foreground" /> Money book
        </h1>
        <Button size="sm" variant="outline" disabled={making} onClick={makePdf}>
          {making ? "Making the PDF…" : "PDF report"}
        </Button>
        <ExportDialogButton config={moneyLedgerExport()} />
        {!readOnly && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing("out")}
            >
              <Plus /> Money out
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMileage(true)}
            >
              Mileage
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setImporting(true)}
            >
              <FileSpreadsheet /> Send a sheet
            </Button>
            <Button size="sm" onClick={() => setEditing("in")}>
              <Plus /> Money in
            </Button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Filter
          id="mb-period"
          label="Period"
          value={preset}
          onChange={(v) => setPreset(v as PeriodPreset)}
        >
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Filter>
        <Filter
          id="mb-dir"
          label="Direction"
          value={direction}
          onChange={setDirection}
        >
          <option value="">In and out</option>
          <option value="in">Money in</option>
          <option value="out">Money out</option>
        </Filter>
        <Filter id="mb-state" label="Show" value={state} onChange={setState}>
          <option value="">All</option>
          <option value="done">Done</option>
          <option value="planned">Planned</option>
          <option value="void">Voided</option>
        </Filter>
        <Filter
          id="mb-cat"
          label="Category"
          value={category}
          onChange={setCategory}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </Filter>
        {preset === "custom" && (
          <>
            <div className="flex flex-col gap-1">
              <Label htmlFor="mb-from">From</Label>
              <Input
                id="mb-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="mb-to">To</Label>
              <Input
                id="mb-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label="Money in" value={formatPence(inDone)} />
        <Figure label="Money out" value={formatPence(outDone)} />
        <Figure label="Net" value={formatPence(inDone - outDone)} />
        <Figure
          label="Planned, in less out"
          value={formatPence(inPlanned - outPlanned)}
        />
      </dl>

      {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-destructive">
          Could not load the money book.
        </p>
      )}
      {!isPending && entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing in this period. Add money in or out, or plan something for
          later.
        </p>
      )}

      {entries.length > 0 && (
        <ul
          className="flex flex-col gap-2 md:hidden"
          aria-label="Money entries"
        >
          {entries.map((e) => (
            <li
              key={e.id}
              className={cn(
                "rounded-xl bg-card p-3 shadow-[var(--shadow-card)]",
                e.state === "void" && "text-muted-foreground line-through",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{e.category_label}</p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      day(e.entry_date),
                      e.counterparty,
                      e.payment_method ? METHOD_LABEL[e.payment_method] : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums">
                  {e.direction === "in" ? "+" : "-"}
                  {formatPence(e.amount_pence)}
                </p>
              </div>
              {e.note ? <p className="mt-1 text-sm">{e.note}</p> : null}
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground no-underline">
                  {e.state === "void"
                    ? `Voided: ${e.void_reason}`
                    : e.status === "planned"
                      ? "Planned"
                      : "Done"}
                  {e.order_id ? ` · ${e.order_reference}` : ""}
                </span>
                <div className="flex flex-wrap whitespace-nowrap">
                  {rowActions(e)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {entries.length > 0 && (
        <div className="hidden overflow-x-auto rounded-lg border md:block">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">What</th>
                <th className="px-3 py-2 font-medium">Note</th>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((e) => (
                <tr
                  key={e.id}
                  className={
                    e.state === "void"
                      ? "text-muted-foreground line-through"
                      : ""
                  }
                >
                  <td className="px-3 py-2 tabular-nums">
                    {day(e.entry_date)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{e.category_label}</span>
                    {e.regulated && (
                      <span className="ml-2 rounded bg-muted px-1.5 text-xs no-underline">
                        Regulated
                      </span>
                    )}
                    <span className="block text-xs text-muted-foreground">
                      {[
                        e.counterparty,
                        e.channel ? CHANNEL_LABEL[e.channel] : null,
                        e.payment_method
                          ? METHOD_LABEL[e.payment_method]
                          : null,
                        e.reference,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </td>
                  <td className="max-w-80 px-3 py-2">{e.note}</td>
                  <td className="px-3 py-2">
                    {e.order_id ? (
                      <Link
                        className="text-primary hover:underline"
                        to={`/orders/${e.order_id}`}
                      >
                        {e.order_reference}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {e.direction === "in" ? "+" : "-"}
                    {formatPence(e.amount_pence)}
                  </td>
                  <td className="px-3 py-2 no-underline">
                    {e.state === "void"
                      ? `Voided: ${e.void_reason}`
                      : e.status === "planned"
                        ? "Planned"
                        : "Done"}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {rowActions(e)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <MoneyDialog
          entry={typeof editing === "object" ? editing : undefined}
          initialDirection={typeof editing === "string" ? editing : undefined}
          onClose={() => setEditing(null)}
        />
      )}

      {voiding && (
        <div
          role="dialog"
          aria-label="Void this entry"
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-4 backdrop-blur-xs"
        >
          <div className="flex w-full max-w-md flex-col gap-3 rounded-2xl bg-card p-5 shadow-[var(--shadow-lift)]">
            <h2 className="text-base font-semibold">
              Void {voiding.category_label}, {formatPence(voiding.amount_pence)}
              ?
            </h2>
            <p className="text-sm text-muted-foreground">
              It stays in the history, marked void, and is left out of the
              totals. Say why.
            </p>
            <Input
              autoFocus
              placeholder="Reason, for example entered twice"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setVoiding(null);
                  setReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={!reason.trim()}
                onClick={() => {
                  change.mutate({
                    id: voiding.id,
                    patch: {
                      voided_at: new Date().toISOString(),
                      void_reason: reason.trim(),
                    },
                  });
                  setVoiding(null);
                  setReason("");
                }}
              >
                Void
              </Button>
            </div>
          </div>
        </div>
      )}
      {mileage ? <MileageDialog onClose={() => setMileage(false)} /> : null}
      {importing ? (
        <ImportDialog
          spec={moneySpec(
            categories
              .filter((c) => !c.admin_only || identity?.administrator)
              .map((c) => ({
                code: c.code,
                label: c.label,
                direction: c.direction as "in" | "out",
              })),
          )}
          onClose={() => setImporting(false)}
          checkDuplicates={async (rows) => {
            const existing = await fetchExistingMoney(rows);
            return rows.map((row) => moneyDuplicate(existing, row));
          }}
          onImport={async (rows) => {
            const { error } = await getSupabaseClient()
              .from("money_entries")
              .insert(rows);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: MONEY_KEY });
          }}
        />
      ) : null}
    </div>
  );
};

const Filter = ({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1">
    <Label htmlFor={id}>{label}</Label>
    <select
      id={id}
      className="h-9 rounded-md border bg-transparent px-3 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
  </div>
);

const Figure = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border p-3">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="text-lg font-semibold tabular-nums">{value}</dd>
  </div>
);
