import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetIdentity, useNotify } from "ra-core";
import { Download, FileText, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { getSupabaseClient } from "../providers/supabase/supabase";
import {
  formatPence,
  poundsToPence,
  quoteTotals,
  type QuoteLine,
} from "./quoteMath";
import { downloadQuotePdf } from "./quotePdf";

type Quote = {
  id: number;
  quote_number: string;
  status: "draft" | "sent" | "accepted" | "declined";
  lines: QuoteLine[];
  discount_percent: number;
  vat_percent: number;
  valid_until: string;
  notes: string | null;
  created_at: string;
};

type DraftLine = { description: string; quantity: string; price: string };

const STATUSES: Quote["status"][] = ["draft", "sent", "accepted", "declined"];

const daysFromToday = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
};

const blankLine = (): DraftLine => ({
  description: "",
  quantity: "1",
  price: "",
});

const customerName = async (contactIds: number[]) => {
  if (!contactIds.length) return "";
  const { data } = await getSupabaseClient()
    .from("contacts")
    .select("first_name, last_name")
    .in("id", contactIds)
    .limit(1);
  const first = data?.[0];
  return first ? `${first.first_name} ${first.last_name}`.trim() : "";
};

export const DealQuotes = ({
  dealId,
  contactIds,
}: {
  dealId: number;
  contactIds: number[];
}) => {
  const [editing, setEditing] = useState<Quote | "new" | null>(null);
  const { data: quotes, isPending } = useQuery({
    queryKey: ["quotes", dealId],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("quotes")
        .select("*")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Quote[];
    },
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="size-4 text-muted-foreground" />
          Quotes
        </h3>
        <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
          <Plus /> New quote
        </Button>
      </div>

      {isPending && (
        <p className="text-sm text-muted-foreground">Loading quotes…</p>
      )}
      {quotes && quotes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No quotes for this deal yet.
        </p>
      )}
      {quotes && quotes.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {quotes.map((quote) => {
            const total = quoteTotals(
              quote.lines,
              quote.discount_percent,
              quote.vat_percent,
            ).total_pence;
            return (
              <li
                key={quote.id}
                className="flex flex-wrap items-center gap-3 p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{quote.quote_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {quote.status} · valid until{" "}
                    {new Date(quote.valid_until).toLocaleDateString("en-GB")}
                  </p>
                </div>
                <span className="tabular-nums">{formatPence(total)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(quote)}
                >
                  <Pencil /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () =>
                    downloadQuotePdf(quote, await customerName(contactIds))
                  }
                >
                  <Download /> PDF
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <QuoteDialog
          dealId={dealId}
          quote={editing === "new" ? null : editing}
          contactIds={contactIds}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
};

const QuoteDialog = ({
  dealId,
  quote,
  contactIds,
  onClose,
}: {
  dealId: number;
  quote: Quote | null;
  contactIds: number[];
  onClose: () => void;
}) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { identity } = useGetIdentity();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Quote["status"]>(
    quote?.status ?? "draft",
  );
  const [lines, setLines] = useState<DraftLine[]>(
    quote
      ? quote.lines.map((line) => ({
          description: line.description,
          quantity: String(line.quantity),
          price: (line.unit_price_pence / 100).toFixed(2),
        }))
      : [blankLine()],
  );
  const [discount, setDiscount] = useState(
    String(quote?.discount_percent ?? 0),
  );
  const [vat, setVat] = useState(String(quote?.vat_percent ?? 20));
  const [validUntil, setValidUntil] = useState(
    quote?.valid_until ?? daysFromToday(30),
  );
  const [notes, setNotes] = useState(quote?.notes ?? "");

  const updateLine = (index: number, patch: Partial<DraftLine>) =>
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );

  // Parse the typed lines. Null means something is missing or not a number.
  const parsed = (() => {
    const result: QuoteLine[] = [];
    for (const line of lines) {
      const unit = poundsToPence(line.price);
      const qty = Number(line.quantity);
      if (
        !line.description.trim() ||
        unit === null ||
        !Number.isInteger(qty) ||
        qty < 1
      )
        return null;
      result.push({
        description: line.description.trim(),
        quantity: qty,
        unit_price_pence: unit,
      });
    }
    return result;
  })();
  const discountPct = Number(discount);
  const vatPct = Number(vat);
  const inputsOk =
    parsed !== null &&
    parsed.length > 0 &&
    discount.trim() !== "" &&
    Number.isFinite(discountPct) &&
    discountPct >= 0 &&
    discountPct <= 100 &&
    Number.isFinite(vatPct) &&
    vatPct >= 0 &&
    vatPct <= 100;
  const totals =
    parsed && inputsOk ? quoteTotals(parsed, discountPct, vatPct) : null;

  const save = async () => {
    if (!parsed || !inputsOk) return;
    setSaving(true);
    const row = {
      status,
      lines: parsed,
      discount_percent: discountPct,
      vat_percent: vatPct,
      valid_until: validUntil,
      notes: notes.trim() || null,
    };
    const client = getSupabaseClient();
    const { error } = quote
      ? await client.from("quotes").update(row).eq("id", quote.id)
      : await client
          .from("quotes")
          .insert({
            ...row,
            deal_id: dealId,
            sales_id: Number(identity?.id) || null,
          });
    setSaving(false);
    if (error) {
      notify("The quote could not be saved", { type: "error" });
      return;
    }
    notify("Quote saved");
    void queryClient.invalidateQueries({ queryKey: ["quotes", dealId] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-9/10 overflow-y-auto p-4 sm:max-w-2xl">
        <h2 className="text-lg font-semibold">
          {quote ? `Quote ${quote.quote_number}` : "New quote"}
        </h2>

        <div className="flex flex-col gap-3">
          {lines.map((line, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_72px_104px] gap-2"
            >
              <div className="flex flex-col gap-1">
                {index === 0 && <Label>Item</Label>}
                <Input
                  value={line.description}
                  onChange={(e) =>
                    updateLine(index, { description: e.target.value })
                  }
                  placeholder="Description"
                  aria-label={`Item ${index + 1}`}
                />
              </div>
              <div className="flex flex-col gap-1">
                {index === 0 && <Label>Qty</Label>}
                <Input
                  inputMode="numeric"
                  value={line.quantity}
                  onChange={(e) =>
                    updateLine(index, { quantity: e.target.value })
                  }
                  aria-label={`Quantity ${index + 1}`}
                />
              </div>
              <div className="flex flex-col gap-1">
                {index === 0 && <Label>Price (£)</Label>}
                <Input
                  inputMode="decimal"
                  value={line.price}
                  onChange={(e) => updateLine(index, { price: e.target.value })}
                  aria-label={`Unit price ${index + 1}`}
                />
              </div>
            </div>
          ))}
          <div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLines((current) => [...current, blankLine()])}
            >
              <Plus /> Add a line
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="quote-discount">Discount %</Label>
              <Input
                id="quote-discount"
                inputMode="decimal"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="quote-vat">VAT %</Label>
              <Input
                id="quote-vat"
                inputMode="decimal"
                value={vat}
                onChange={(e) => setVat(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="quote-valid">Valid until</Label>
              <Input
                id="quote-valid"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="quote-status">Status</Label>
              <select
                id="quote-status"
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value as Quote["status"])}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="quote-notes">Notes</Label>
            <Textarea
              id="quote-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="ml-auto grid min-w-56 grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm tabular-nums">
            {totals && (
              <>
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPence(totals.subtotal_pence)}</span>
                {totals.discount_pence > 0 && (
                  <>
                    <span className="text-muted-foreground">Discount</span>
                    <span>-{formatPence(totals.discount_pence)}</span>
                  </>
                )}
                <span className="text-muted-foreground">VAT</span>
                <span>{formatPence(totals.vat_pence)}</span>
                <span className="font-semibold">Total</span>
                <span className="font-semibold">
                  {formatPence(totals.total_pence)}
                </span>
              </>
            )}
          </div>
          {!inputsOk && (
            <p className="text-xs text-muted-foreground">
              Each line needs an item, a whole-number quantity and a price such
              as 1250 or 99.50.
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
          {quote && (
            <Button
              variant="ghost"
              disabled={!parsed || !inputsOk}
              onClick={async () =>
                parsed &&
                downloadQuotePdf(
                  {
                    ...quote,
                    lines: parsed,
                    status,
                    discount_percent: discountPct,
                    vat_percent: vatPct,
                    valid_until: validUntil,
                    notes: notes.trim() || null,
                  },
                  await customerName(contactIds),
                )
              }
            >
              <Download /> PDF
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!parsed || !inputsOk || saving}>
            {saving ? "Saving…" : "Save quote"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
