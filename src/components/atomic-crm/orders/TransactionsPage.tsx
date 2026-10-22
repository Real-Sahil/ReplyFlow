import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Banknote } from "lucide-react";

import { ExportDialogButton } from "../exports/ExportDialog";
import { transactionsExport } from "../exports/exportConfigs";
import { formatPence } from "../quotes/quoteMath";
import { getSupabaseClient } from "../providers/supabase/supabase";
import {
  KIND_LABELS,
  METHOD_LABELS,
  type PaymentKind,
  type PaymentMethod,
} from "./orderPayments";

type Transaction = {
  id: number;
  kind: PaymentKind;
  amount_pence: number;
  method: PaymentMethod;
  received_at: string;
  note: string | null;
  orders: {
    id: number;
    reference: string;
    contacts: { first_name: string | null; last_name: string | null } | null;
  } | null;
};

// The most recent payments across all orders. Anything older, or for a set period, is in
// the export.
export const TransactionsPage = () => {
  const { data, isPending, error } = useQuery({
    queryKey: ["transactions_recent"],
    queryFn: async () => {
      const { data: rows, error: queryError } = await getSupabaseClient()
        .from("order_payments")
        .select(
          "id, kind, amount_pence, method, received_at, note, orders(id, reference, contacts(first_name, last_name))",
        )
        .order("received_at", { ascending: false })
        .limit(200);
      if (queryError) throw queryError;
      return (rows ?? []) as unknown as Transaction[];
    },
  });

  return (
    <div className="mt-2 flex flex-col gap-4 px-4 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex min-w-0 flex-1 items-center gap-2 text-2xl font-semibold tracking-tight">
          <Banknote className="size-6 text-muted-foreground" /> Transactions
        </h1>
        <ExportDialogButton config={transactionsExport()} />
      </div>

      {isPending && (
        <p className="text-sm text-muted-foreground" role="status">
          Loading transactions…
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive">
          The transactions could not be loaded.
        </p>
      )}
      {data && data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No payments recorded yet.
        </p>
      )}
      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 tabular-nums">
                    {new Date(row.received_at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    {row.orders ? (
                      <Link
                        className="underline underline-offset-4"
                        to={`/orders/${row.orders.id}`}
                      >
                        {row.orders.reference}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {[
                      row.orders?.contacts?.first_name,
                      row.orders?.contacts?.last_name,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </td>
                  <td className="px-3 py-2">
                    {KIND_LABELS[row.kind]}
                    {row.note && (
                      <span className="block text-xs text-muted-foreground">
                        {row.note}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{METHOD_LABELS[row.method]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPence(row.amount_pence)}
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
