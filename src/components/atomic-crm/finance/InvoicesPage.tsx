import { useState } from "react";
import { Link } from "react-router";
import { Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ExportDialogButton } from "../exports/ExportDialog";
import { invoiceLedgerExport } from "../exports/exportConfigs";
import { periodBounds, type PeriodPreset } from "../exports/periods";
import { formatPence } from "../quotes/quoteMath";
import { downloadInvoicePdf } from "./invoicePdf";
import { kindLabel } from "./invoiceTypes";
import { useBusinessSettings } from "./useBusinessSettings";
import { useInvoices } from "./useInvoices";

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last three months" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom dates" },
  { value: "all", label: "All dates" },
];

const sign = (kind: string, pence: number) =>
  kind === "credit_note" ? -pence : pence;

// Every invoice and credit note, for a period, with the order each belongs to. The export has one
// row per line, each carrying its order reference and the order's own note.
export const InvoicesPage = () => {
  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range = periodBounds(preset, { from, to });
  const { data: documents = [], isPending, error } = useInvoices(range);
  const { data: settings } = useBusinessSettings();
  const vatOn = !!settings?.vat_registered;

  const totals = documents.reduce(
    (sum, d) => ({
      net: sum.net + sign(d.kind, d.net_pence),
      vat: sum.vat + sign(d.kind, d.vat_pence),
      gross: sum.gross + sign(d.kind, d.gross_pence),
    }),
    { net: 0, vat: 0, gross: 0 },
  );
  const numberById = new Map(documents.map((d) => [d.id, d.number]));

  return (
    <div className="mt-2 flex flex-col gap-4 px-4 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title flex min-w-0 basis-full items-center gap-2 text-2xl font-semibold tracking-tight sm:basis-0 sm:flex-1">
          <Receipt className="size-6 text-muted-foreground" /> Invoices
        </h1>
        <ExportDialogButton config={invoiceLedgerExport()} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="inv-period">Period</Label>
          <select
            id="inv-period"
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
        {preset === "custom" && (
          <>
            <div className="flex flex-col gap-1">
              <Label htmlFor="inv-from">From</Label>
              <Input
                id="inv-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="inv-to">To</Label>
              <Input
                id="inv-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label="Documents" value={String(documents.length)} />
        {vatOn && (
          <Figure label="Excluding VAT" value={formatPence(totals.net)} />
        )}
        {vatOn && <Figure label="VAT" value={formatPence(totals.vat)} />}
        <Figure label="Total" value={formatPence(totals.gross)} />
      </dl>

      {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-destructive">Could not load invoices.</p>
      )}
      {!isPending && documents.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing issued in this period. Create an invoice from an order.
        </p>
      )}
      {documents.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Number</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                {vatOn && (
                  <th className="px-3 py-2 text-right font-medium">VAT</th>
                )}
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {documents.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2 tabular-nums">
                    {new Date(`${d.issue_date}T00:00:00`).toLocaleDateString(
                      "en-GB",
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium">{d.number}</td>
                  <td className="px-3 py-2">
                    {kindLabel(d.kind)}
                    {d.credit_for_id && numberById.get(d.credit_for_id)
                      ? ` (${numberById.get(d.credit_for_id)})`
                      : ""}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      className="text-primary hover:underline"
                      to={`/orders/${d.order_id}`}
                    >
                      {d.order_reference}
                    </Link>
                    {d.order_summary ? (
                      <span className="block max-w-56 truncate text-xs text-muted-foreground">
                        {d.order_summary}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{d.customer_name || "—"}</td>
                  {vatOn && (
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPence(sign(d.kind, d.vat_pence))}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPence(sign(d.kind, d.gross_pence))}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        downloadInvoicePdf(
                          d,
                          d.invoice_lines ?? [],
                          d.credit_for_id
                            ? numberById.get(d.credit_for_id)
                            : undefined,
                        )
                      }
                    >
                      PDF
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
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
