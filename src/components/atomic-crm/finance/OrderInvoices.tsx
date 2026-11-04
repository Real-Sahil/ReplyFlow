import { useState } from "react";
import { FileText } from "lucide-react";
import { useRecordContext } from "ra-core";

import { Button } from "@/components/ui/button";

import { formatPence } from "../quotes/quoteMath";
import { InvoiceDialog, type OrderForInvoice } from "./InvoiceDialog";
import { downloadInvoicePdf } from "./invoicePdf";
import { kindLabel, type Invoice } from "./invoiceTypes";
import { useInvoices } from "./useInvoices";

// On an order: the invoices and credit notes made for it, and the buttons to make more.
export const OrderInvoices = () => {
  const order = useRecordContext<OrderForInvoice>();
  const { data: documents = [] } = useInvoices({ orderId: order?.id });
  const [dialog, setDialog] = useState<
    { kind: "invoice" } | { kind: "credit_note"; for: Invoice } | null
  >(null);
  if (!order) return null;

  const numberOf = (id: number | null) =>
    documents.find((d) => d.id === id)?.number;

  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h6 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="size-4" /> Invoices and credit notes
        </h6>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDialog({ kind: "invoice" })}
        >
          New invoice
        </Button>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing issued for this order yet.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm"
            >
              <span className="font-medium">{d.number}</span>
              <span className="text-muted-foreground">
                {kindLabel(d.kind)}
                {d.kind === "credit_note" && numberOf(d.credit_for_id)
                  ? ` for ${numberOf(d.credit_for_id)}`
                  : ""}{" "}
                ·{" "}
                {new Date(`${d.issue_date}T00:00:00`).toLocaleDateString(
                  "en-GB",
                )}
              </span>
              <span className="ml-auto tabular-nums">
                {d.kind === "credit_note" ? "-" : ""}
                {formatPence(d.gross_pence)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  downloadInvoicePdf(
                    d,
                    d.invoice_lines ?? [],
                    numberOf(d.credit_for_id),
                  )
                }
              >
                PDF
              </Button>
              {d.kind === "invoice" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialog({ kind: "credit_note", for: d })}
                >
                  Credit note
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {dialog && (
        <InvoiceDialog
          order={order}
          kind={dialog.kind}
          creditFor={dialog.kind === "credit_note" ? dialog.for : undefined}
          creditForLines={
            dialog.kind === "credit_note" ? dialog.for.invoice_lines : undefined
          }
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
};
