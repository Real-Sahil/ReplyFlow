import { useState } from "react";
import { Coins } from "lucide-react";
import { useRecordContext } from "ra-core";

import { Button } from "@/components/ui/button";

import { formatPence } from "../quotes/quoteMath";
import { BillDialog } from "./BillDialog";
import { useBills } from "./useBills";
import { useInvoices } from "./useInvoices";

// On an order: what it cost (supplier bills linked to it) against what was invoiced, before VAT,
// so the margin is the real one. VAT never counts as income or cost here.
export const OrderCosts = () => {
  const order = useRecordContext<{ id: number }>();
  const { data: bills = [] } = useBills({ orderId: order?.id });
  const { data: documents = [] } = useInvoices({ orderId: order?.id });
  const [adding, setAdding] = useState(false);
  if (!order) return null;

  const costs = bills
    .filter((b) => b.status !== "void")
    .reduce((sum, b) => sum + b.net_pence, 0);
  const sold = documents.reduce(
    (sum, d) => sum + (d.kind === "credit_note" ? -d.net_pence : d.net_pence),
    0,
  );
  const margin = sold - costs;

  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h6 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Coins className="size-4" /> Costs and margin
        </h6>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAdding(true)}
        >
          Add a cost
        </Button>
      </div>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">
            Invoiced (before VAT)
          </dt>
          <dd className="tabular-nums">{formatPence(sold)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Costs</dt>
          <dd className="tabular-nums">{formatPence(costs)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Margin</dt>
          <dd className="font-semibold tabular-nums">
            {documents.length === 0 ? "Invoice first" : formatPence(margin)}
            {documents.length > 0 && sold > 0
              ? ` (${Math.round((margin / sold) * 100)}%)`
              : ""}
          </dd>
        </div>
      </dl>
      {bills.length > 0 && (
        <ul className="divide-y rounded-lg border text-sm">
          {bills.map((b) => (
            <li
              key={b.id}
              className={`flex gap-3 px-3 py-2 ${b.status === "void" ? "text-muted-foreground line-through" : ""}`}
            >
              <span className="font-medium">{b.supplier_name}</span>
              <span className="text-muted-foreground">{b.description}</span>
              <span className="ml-auto tabular-nums">
                {formatPence(b.net_pence)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <BillDialog orderId={order.id} onClose={() => setAdding(false)} />
      )}
    </div>
  );
};
