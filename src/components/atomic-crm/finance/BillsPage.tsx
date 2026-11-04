import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { FileSpreadsheet, Plus, Wallet } from "lucide-react";
import { useNotify } from "ra-core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ExportDialogButton } from "../exports/ExportDialog";
import { billLedgerExport } from "../exports/exportConfigs";
import { periodBounds, type PeriodPreset } from "../exports/periods";
import { ATTACHMENTS_BUCKET } from "../providers/commons/attachments";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPence } from "../quotes/quoteMath";
import { BILLS_KEY, METHOD_LABEL, type Bill } from "./billTypes";
import { BillDialog } from "./BillDialog";
import { useIsAccountant } from "../misc/useIsAccountant";
import { useBusinessSettings } from "./useBusinessSettings";
import { useBills, useExpenseCategories } from "./useBills";
import { ImportDialog } from "../importer/ImportDialog";
import { billDuplicate } from "../importer/duplicates";
import { fetchExistingBills } from "../importer/duplicatesFetch";
import { billsSpec } from "../importer/specs";

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

export const openReceipt = async (path: string) => {
  const { data, error } = await getSupabaseClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .createSignedUrl(path, 60);
  if (!error && data?.signedUrl)
    window.open(data.signedUrl, "_blank", "noopener");
};

// Supplier bills and expenses for a period, with the VAT on them and the order each one is a
// cost of. Void rather than delete: a voided bill stays in the history but not in the totals.
export const BillsPage = () => {
  const notify = useNotify();
  const readOnly = useIsAccountant();
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const { data: expenseCategories = [] } = useExpenseCategories();
  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Bill | "new" | null>(null);
  const [voiding, setVoiding] = useState<Bill | null>(null);
  const [reason, setReason] = useState("");
  const range = periodBounds(preset, { from, to });
  const { data: bills = [], isPending, error } = useBills({ ...range, status });
  const { data: settings } = useBusinessSettings();
  const vatOn = !!settings?.vat_registered;

  const live = bills.filter((b) => b.status !== "void");
  const totals = live.reduce(
    (sum, b) => ({
      gross: sum.gross + b.gross_pence,
      vat: sum.vat + (b.vat_reclaimable ? b.vat_pence : 0),
      owed: sum.owed + (b.status === "unpaid" ? b.gross_pence : 0),
    }),
    { gross: 0, vat: 0, owed: 0 },
  );

  const change = useMutation({
    mutationFn: async (args: {
      id: number;
      patch: Record<string, unknown>;
    }) => {
      const { error: updateError } = await getSupabaseClient()
        .from("bills")
        .update(args.patch)
        .eq("id", args.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BILLS_KEY }),
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  return (
    <div className="mt-2 flex flex-col gap-4 px-4 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title flex min-w-0 basis-full items-center gap-2 text-2xl font-semibold tracking-tight sm:basis-0 sm:flex-1">
          <Wallet className="size-6 text-muted-foreground" /> Bills and expenses
        </h1>
        <ExportDialogButton config={billLedgerExport()} />
        {!readOnly && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setImporting(true)}
            >
              <FileSpreadsheet /> Send a sheet
            </Button>
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus /> Add a bill
            </Button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="bill-period">Period</Label>
          <select
            id="bill-period"
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
        <div className="flex flex-col gap-1">
          <Label htmlFor="bill-status">Show</Label>
          <select
            id="bill-status"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="void">Voided</option>
          </select>
        </div>
        {preset === "custom" && (
          <>
            <div className="flex flex-col gap-1">
              <Label htmlFor="bill-from">From</Label>
              <Input
                id="bill-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="bill-to">To</Label>
              <Input
                id="bill-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label="Bills" value={String(live.length)} />
        <Figure label="Total spent" value={formatPence(totals.gross)} />
        {vatOn && (
          <Figure label="VAT to reclaim" value={formatPence(totals.vat)} />
        )}
        <Figure label="Still to pay" value={formatPence(totals.owed)} />
      </dl>

      {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-destructive">Could not load bills.</p>
      )}
      {!isPending && bills.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No bills in this period. Add one with a photo of the receipt.
        </p>
      )}

      {bills.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Supplier</th>
                <th className="px-3 py-2 font-medium">For</th>
                <th className="px-3 py-2 font-medium">Order</th>
                {vatOn && (
                  <th className="px-3 py-2 text-right font-medium">VAT</th>
                )}
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {bills.map((b) => (
                <tr
                  key={b.id}
                  className={
                    b.status === "void"
                      ? "text-muted-foreground line-through"
                      : ""
                  }
                >
                  <td className="px-3 py-2 tabular-nums">{day(b.bill_date)}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{b.supplier_name}</span>
                    {b.reference ? (
                      <span className="block text-xs text-muted-foreground">
                        {b.reference}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {b.description}
                    <span className="block text-xs text-muted-foreground">
                      {b.category_label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {b.order_id ? (
                      <Link
                        className="text-primary hover:underline"
                        to={`/orders/${b.order_id}`}
                      >
                        {b.order_reference}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  {vatOn && (
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPence(b.vat_pence)}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPence(b.gross_pence)}
                  </td>
                  <td className="px-3 py-2 no-underline">
                    {b.status === "void"
                      ? `Voided: ${b.void_reason}`
                      : b.status === "paid"
                        ? `Paid ${day(b.paid_date!)}${b.payment_method ? ` (${METHOD_LABEL[b.payment_method]})` : ""}`
                        : b.due_date
                          ? `Due ${day(b.due_date)}`
                          : "Unpaid"}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {b.receipt_path && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openReceipt(b.receipt_path!)}
                      >
                        Receipt
                      </Button>
                    )}
                    {!readOnly && b.status === "unpaid" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          change.mutate({
                            id: b.id,
                            patch: {
                              paid_date: new Date().toLocaleDateString("en-CA"),
                              payment_method: "bank_transfer",
                            },
                          })
                        }
                      >
                        Mark paid
                      </Button>
                    )}
                    {!readOnly && b.status !== "void" && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(b)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setVoiding(b)}
                        >
                          Void
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <BillDialog
          bill={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {voiding && (
        <div
          role="dialog"
          aria-label="Void this bill"
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-4 backdrop-blur-[3px]"
        >
          <div className="flex w-full max-w-md flex-col gap-3 rounded-2xl bg-card p-5 shadow-[var(--shadow-lift)]">
            <h2 className="text-base font-semibold">
              Void {voiding.supplier_name}, {formatPence(voiding.gross_pence)}?
            </h2>
            <p className="text-sm text-muted-foreground">
              It stays in the history, marked void, and is left out of the
              totals and the VAT. Say why.
            </p>
            <Input
              autoFocus
              placeholder="Reason, for example duplicate"
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
      {importing ? (
        <ImportDialog
          spec={billsSpec(expenseCategories)}
          onClose={() => setImporting(false)}
          checkDuplicates={async (rows) => {
            const existing = await fetchExistingBills(rows);
            return rows.map((row) => billDuplicate(existing, row));
          }}
          onImport={async (rows) => {
            const { error } = await getSupabaseClient()
              .from("bills")
              .insert(rows);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: BILLS_KEY });
          }}
        />
      ) : null}
    </div>
  );
};

const Figure = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border p-3">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="text-lg font-semibold tabular-nums">{value}</dd>
  </div>
);
