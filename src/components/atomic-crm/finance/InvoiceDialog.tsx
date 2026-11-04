import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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

import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPence } from "../quotes/quoteMath";
import {
  INVOICES_KEY,
  kindLabel,
  type Invoice,
  type InvoiceLine,
} from "./invoiceTypes";
import { useBusinessSettings } from "./useBusinessSettings";
import { VAT_RATES, invoiceTotals, type VatCode } from "./vatMath";

export type OrderForInvoice = {
  id: number;
  reference: string;
  product_summary: string | null;
  agreed_price_pence: number | null;
  notes: string | null;
};

type Draft = {
  description: string;
  quantity: string;
  price: string; // pounds, as typed
  vat_code: VatCode;
};

const toPence = (pounds: string) => Math.round(Number(pounds || 0) * 100);
const today = () => new Date().toLocaleDateString("en-CA");

// Creates an invoice for an order, or a credit note against an invoice. What is saved cannot be
// changed afterwards, which is what makes it usable as evidence; a mistake is a credit note.
export const InvoiceDialog = ({
  order,
  kind,
  creditFor,
  creditForLines,
  onClose,
}: {
  order: OrderForInvoice;
  kind: Invoice["kind"];
  creditFor?: Invoice;
  creditForLines?: InvoiceLine[];
  onClose: () => void;
}) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { data: settings } = useBusinessSettings();
  const vatOn = !!settings?.vat_registered;
  const inclusive = settings?.prices_include_vat ?? true;

  const [lines, setLines] = useState<Draft[]>(() =>
    kind === "credit_note" && creditForLines?.length
      ? creditForLines.map((l) => ({
          description: l.description,
          quantity: String(Number(l.quantity)),
          price: (l.unit_amount_pence / 100).toFixed(2),
          vat_code: l.vat_code as VatCode,
        }))
      : [
          {
            description: order.product_summary || order.reference,
            quantity: "1",
            price:
              order.agreed_price_pence != null
                ? (order.agreed_price_pence / 100).toFixed(2)
                : "",
            vat_code: "S",
          },
        ],
  );
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState(today());
  const [note, setNote] = useState("");

  const totals = useMemo(
    () =>
      invoiceTotals(
        lines.map((l) => ({
          amountPence: Math.round(Number(l.quantity || 0) * toPence(l.price)),
          vatCode: l.vat_code,
        })),
        { vatRegistered: vatOn, pricesIncludeVat: inclusive },
      ),
    [lines, vatOn, inclusive],
  );

  const valid =
    lines.length > 0 &&
    lines.every(
      (l) =>
        l.description.trim() && Number(l.quantity) > 0 && Number(l.price) >= 0,
    ) &&
    totals.grossPence > 0;

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await getSupabaseClient().rpc("issue_invoice", {
        p_order_id: order.id,
        p_kind: kind,
        p_credit_for: creditFor?.id ?? null,
        p_lines: lines.map((l) => ({
          description: l.description.trim(),
          quantity: Number(l.quantity),
          unit_amount_pence: toPence(l.price),
          vat_code: l.vat_code,
        })),
        p_issue_date: issueDate,
        p_due_date: kind === "invoice" ? dueDate : null,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      notify(`${kindLabel(kind)} created`, { type: "success" });
      queryClient.invalidateQueries({ queryKey: INVOICES_KEY });
      onClose();
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });

  const update = (i: number, patch: Partial<Draft>) =>
    setLines((all) => all.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-5 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {kind === "credit_note"
              ? `Credit note for ${creditFor?.number}`
              : `New invoice for ${order.reference}`}
          </DialogTitle>
          <DialogDescription>
            {inclusive && vatOn
              ? "Prices include VAT."
              : vatOn
                ? "Prices are before VAT. VAT is added."
                : "No VAT is charged."}{" "}
            Once created, it cannot be changed. Use a credit note to correct it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {lines.map((line, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_4.5rem_6rem_auto] items-end gap-2 sm:grid-cols-[1fr_4.5rem_6rem_9rem_auto]"
            >
              <div className="col-span-full flex flex-col gap-1 sm:col-span-1">
                <Label htmlFor={`d-${i}`}>Description</Label>
                <Input
                  id={`d-${i}`}
                  value={line.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`q-${i}`}>Qty</Label>
                <Input
                  id={`q-${i}`}
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(e) => update(i, { quantity: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`p-${i}`}>Price (£)</Label>
                <Input
                  id={`p-${i}`}
                  inputMode="decimal"
                  value={line.price}
                  onChange={(e) => update(i, { price: e.target.value })}
                />
              </div>
              {vatOn && (
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`v-${i}`}>VAT</Label>
                  <select
                    id={`v-${i}`}
                    className="h-9 rounded-md border bg-transparent px-2 text-sm"
                    value={line.vat_code}
                    onChange={(e) =>
                      update(i, { vat_code: e.target.value as VatCode })
                    }
                  >
                    {(Object.keys(VAT_RATES) as VatCode[]).map((code) => (
                      <option key={code} value={code}>
                        {VAT_RATES[code].label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove line"
                disabled={lines.length === 1}
                onClick={() => setLines((all) => all.filter((_, n) => n !== i))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setLines((all) => [
                  ...all,
                  { description: "", quantity: "1", price: "", vat_code: "S" },
                ])
              }
            >
              <Plus /> Add a line
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="issue-date">Date</Label>
              <Input
                id="issue-date"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
            {kind === "invoice" && (
              <div className="flex flex-col gap-1">
                <Label htmlFor="due-date">Due</Label>
                <Input
                  id="due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="doc-note">Note for this document (optional)</Label>
            <Input
              id="doc-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium">
              Copied onto the document from {order.reference}
            </p>
            <p className="text-muted-foreground">
              {order.product_summary || "No product summary."}
              {order.notes ? ` Order note: ${order.notes}` : " No order note."}
            </p>
          </div>

          <dl className="ml-auto grid w-64 grid-cols-2 gap-y-1 text-sm">
            {vatOn && (
              <>
                <dt className="text-muted-foreground">Excluding VAT</dt>
                <dd className="text-right tabular-nums">
                  {formatPence(totals.netPence)}
                </dd>
                <dt className="text-muted-foreground">VAT</dt>
                <dd className="text-right tabular-nums">
                  {formatPence(totals.vatPence)}
                </dd>
              </>
            )}
            <dt className="font-semibold">Total</dt>
            <dd className="text-right font-semibold tabular-nums">
              {formatPence(totals.grossPence)}
            </dd>
          </dl>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!valid || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending
                ? "Creating…"
                : `Create ${kindLabel(kind).toLowerCase()}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
