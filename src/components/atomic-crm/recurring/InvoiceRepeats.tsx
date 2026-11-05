import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Pause, Play, X } from "lucide-react";
import { useNotify } from "ra-core";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { INVOICES_KEY, type Invoice } from "../finance/invoiceTypes";
import { useBusinessSettings } from "../finance/useBusinessSettings";
import { invoiceTotals, type VatCode } from "../finance/vatMath";
import { todayIso } from "../importer/engine";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPence } from "../quotes/quoteMath";
import {
  cleanLines,
  lineAmountPence,
  linesValid,
  type InvoiceDraft,
  type RecurringInvoice,
  type RepeatLine,
} from "./invoiceRepeat";
import { FREQUENCY_LABEL, nextOccurrence, type Frequency } from "./recurring";
import {
  INVOICE_DRAFTS_KEY,
  INVOICE_REPEATS_KEY,
  useInvoiceDrafts,
  useInvoiceRepeats,
} from "./useInvoiceRepeats";

const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const useRefreshRepeats = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: INVOICE_REPEATS_KEY });
    queryClient.invalidateQueries({ queryKey: INVOICE_DRAFTS_KEY });
    queryClient.invalidateQueries({ queryKey: INVOICES_KEY });
    queryClient.invalidateQueries({ queryKey: ["owed"] });
  };
};

const useOrderReferences = (ids: number[]) =>
  useQuery({
    queryKey: ["order_references", [...ids].sort()],
    enabled: ids.length > 0,
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("orders")
        .select("id, reference")
        .in("id", ids);
      if (error) throw error;
      return new Map(
        (data ?? []).map((o) => [Number(o.id), String(o.reference)]),
      );
    },
  }).data;

// "Repeat this invoice", opened from an issued invoice.
export const RepeatInvoiceDialog = ({
  invoice,
  onClose,
}: {
  invoice: Invoice;
  onClose: () => void;
}) => {
  const notify = useNotify();
  const refresh = useRefreshRepeats();
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [first, setFirst] = useState(
    nextOccurrence(
      invoice.issue_date,
      "monthly",
      Number(invoice.issue_date.slice(8, 10)),
    ) < todayIso()
      ? todayIso()
      : nextOccurrence(
          invoice.issue_date,
          "monthly",
          Number(invoice.issue_date.slice(8, 10)),
        ),
  );
  const [end, setEnd] = useState("");
  const [dueDays, setDueDays] = useState(
    String(
      invoice.due_date
        ? Math.max(
            0,
            Math.round(
              (Date.parse(invoice.due_date) - Date.parse(invoice.issue_date)) /
                86400000,
            ),
          )
        : 14,
    ),
  );
  const save = useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("recurring_invoices").insert({
        source_invoice_id: invoice.id,
        frequency,
        next_date: first,
        end_date: end || null,
        due_days: Number(dueDays),
      });
      if (error) throw error;
      await supabase.rpc("generate_my_invoice_drafts");
    },
    onSuccess: () => {
      refresh();
      notify(
        "Set to repeat. A draft appears a week before each date for you to confirm.",
        { type: "success" },
      );
      onClose();
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });
  const valid =
    first >= todayIso() &&
    (!end || end >= first) &&
    Number.isInteger(Number(dueDays)) &&
    Number(dueDays) >= 0 &&
    Number(dueDays) <= 120;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Repeat invoice {invoice.number}</DialogTitle>
          <DialogDescription>
            The lines are copied. A week before each date a draft is added for
            you to check and confirm. Nothing is sent and no number is used
            until you confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ri-frequency">How often</Label>
            <select
              id="ri-frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
            >
              {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABEL[f]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ri-first">First invoice date</Label>
            <Input
              id="ri-first"
              type="date"
              min={todayIso()}
              value={first}
              onChange={(e) => setFirst(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ri-end">Stop after (optional)</Label>
            <Input
              id="ri-end"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ri-due">Days to pay</Label>
            <Input
              id="ri-due"
              inputMode="numeric"
              value={dueDays}
              onChange={(e) => setDueDays(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!valid || save.isPending}
              onClick={() => save.mutate()}
            >
              Repeat it
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const DraftCard = ({
  draft,
  reference,
}: {
  draft: InvoiceDraft;
  reference?: string;
}) => {
  const notify = useNotify();
  const refresh = useRefreshRepeats();
  const { data: settings } = useBusinessSettings();
  const [lines, setLines] = useState<RepeatLine[]>(draft.lines);
  const [issue, setIssue] = useState(draft.issue_date);
  const totals = invoiceTotals(
    lines.map((l) => ({
      amountPence: lineAmountPence(l),
      vatCode: l.vat_code as VatCode,
    })),
    {
      vatRegistered: !!settings?.vat_registered,
      pricesIncludeVat: !!settings?.prices_include_vat,
    },
  );
  const confirm = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseClient().rpc("confirm_invoice_draft", {
        p_id: draft.id,
        p_lines: cleanLines(lines),
        p_issue_date: issue,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      notify("Invoice issued.", { type: "success" });
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });
  const dismiss = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseClient().rpc("dismiss_invoice_draft", {
        p_id: draft.id,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });
  const setLine = (i: number, patch: Partial<RepeatLine>) =>
    setLines((all) => all.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  const busy = confirm.isPending || dismiss.isPending;
  return (
    <section className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            Draft invoice{reference ? ` · order ${reference}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Due to be issued {day(draft.issue_date)}. Not an invoice until you
            confirm.
          </p>
        </div>
        <p className="font-semibold tabular-nums">
          {formatPence(totals.grossPence)}
        </p>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {lines.map((l, i) => (
          <li key={i} className="grid grid-cols-[1fr_4.5rem_6rem] gap-2">
            <Input
              aria-label="Description"
              value={l.description}
              onChange={(e) => setLine(i, { description: e.target.value })}
            />
            <Input
              aria-label="Quantity"
              inputMode="decimal"
              value={String(l.quantity)}
              onChange={(e) => setLine(i, { quantity: e.target.value })}
            />
            <Input
              aria-label="Price in pounds"
              inputMode="decimal"
              defaultValue={(l.unit_amount_pence / 100).toFixed(2)}
              onChange={(e) =>
                setLine(i, {
                  unit_amount_pence: Math.round(Number(e.target.value) * 100),
                })
              }
            />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`draft-date-${draft.id}`} className="text-xs">
            Invoice date
          </Label>
          <Input
            id={`draft-date-${draft.id}`}
            type="date"
            className="w-44"
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => dismiss.mutate()}
          >
            <X className="size-4" /> Skip this one
          </Button>
          <Button
            size="sm"
            disabled={busy || !linesValid(lines) || !issue}
            onClick={() => confirm.mutate()}
          >
            <Check className="size-4" /> Confirm and issue
          </Button>
        </div>
      </div>
    </section>
  );
};

export const InvoiceRepeatsSection = () => {
  const notify = useNotify();
  const refresh = useRefreshRepeats();
  const { data: drafts = [] } = useInvoiceDrafts();
  const { data: repeats = [] } = useInvoiceRepeats();
  const references = useOrderReferences([
    ...new Set([...drafts, ...repeats].map((r) => r.order_id)),
  ]);
  const toggle = useMutation({
    mutationFn: async (r: RecurringInvoice) => {
      const { error } = await getSupabaseClient()
        .from("recurring_invoices")
        .update({ active: !r.active })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });
  if (drafts.length === 0 && repeats.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <FileText className="size-4" /> Repeating invoices
      </h2>
      {drafts.length > 0 ? (
        <p role="status" className="text-sm">
          {drafts.length === 1
            ? "1 draft invoice is waiting for you."
            : `${drafts.length} draft invoices are waiting for you.`}
        </p>
      ) : null}
      {drafts.map((d) => (
        <DraftCard
          key={d.id}
          draft={d}
          reference={references?.get(d.order_id)}
        />
      ))}
      {repeats.length > 0 ? (
        <ul className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
          {repeats.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-sm last:border-b-0"
            >
              <span>
                Order {references?.get(r.order_id) ?? r.order_id} ·{" "}
                {FREQUENCY_LABEL[r.frequency]} ·{" "}
                {formatPence(
                  r.lines.reduce((sum, l) => sum + lineAmountPence(l), 0),
                )}
              </span>
              <span className="flex items-center gap-2 text-muted-foreground">
                {r.active ? `Next draft ${day(r.next_date)}` : "Paused"}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(r)}
                >
                  {r.active ? (
                    <>
                      <Pause className="size-4" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="size-4" /> Resume
                    </>
                  )}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
