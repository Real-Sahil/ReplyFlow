import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Boxes, Plus } from "lucide-react";
import { useNotify } from "ra-core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { ExportDialogButton } from "../exports/ExportDialog";
import { stockExport } from "../exports/exportConfigs";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPence } from "../quotes/quoteMath";
import { ItemDialog, MovementDialog } from "./StockDialogs";
import {
  isLow,
  KIND_LABEL,
  qty,
  STOCK_KEY,
  valueOf,
  type StockLevel,
} from "./stockTypes";
import { useStockLevels, useStockMovements } from "./useStock";

const day = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-GB");

// What the business holds, what it is worth, and every movement behind it. Stock is valued at
// the average price paid. Using stock against an order gives that order its stock cost.
export const StockPage = () => {
  const { data: levels = [], isPending, error } = useStockLevels();
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<StockLevel | "new" | null>(null);
  const [recording, setRecording] = useState<StockLevel | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const shown = levels.filter((l) => showInactive || l.active);
  const total = shown.reduce((sum, l) => sum + valueOf(l), 0);
  const low = shown.filter(isLow).length;

  return (
    <div className="mt-2 flex flex-col gap-4 px-4 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex min-w-0 flex-1 items-center gap-2 text-2xl font-semibold tracking-tight">
          <Boxes className="size-6 text-muted-foreground" /> Stock
        </h1>
        <ExportDialogButton config={stockExport()} />
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> New item
        </Button>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        <Figure label="Items" value={String(shown.length)} />
        <Figure label="Worth, at average cost" value={formatPence(total)} />
        <Figure label="Running low" value={String(low)} />
      </dl>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
        Show items no longer in use
      </label>

      {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-destructive">Could not load stock.</p>
      )}
      {!isPending && shown.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing here yet. Add what you buy and keep, then record each delivery
          and each time it is used.
        </p>
      )}

      {shown.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 text-right font-medium">On hand</th>
                <th className="px-3 py-2 text-right font-medium">
                  Average cost
                </th>
                <th className="px-3 py-2 text-right font-medium">Worth</th>
                <th className="px-3 py-2 font-medium">Last moved</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((l) => (
                <ItemRows
                  key={l.id}
                  level={l}
                  expanded={open === l.id}
                  onToggle={() => setOpen(open === l.id ? null : l.id)}
                  onRecord={() => setRecording(l)}
                  onEdit={() => setEditing(l)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ItemDialog
          item={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {recording && (
        <MovementDialog item={recording} onClose={() => setRecording(null)} />
      )}
    </div>
  );
};

const ItemRows = ({
  level,
  expanded,
  onToggle,
  onRecord,
  onEdit,
}: {
  level: StockLevel;
  expanded: boolean;
  onToggle: () => void;
  onRecord: () => void;
  onEdit: () => void;
}) => (
  <>
    <tr className={level.active ? "" : "text-muted-foreground"}>
      <td className="px-3 py-2">
        <span className="font-medium">{level.name}</span>
        {level.sku ? (
          <span className="ml-2 text-xs text-muted-foreground">
            {level.sku}
          </span>
        ) : null}
        {isLow(level) && (
          <span className="ml-2 rounded bg-warning-soft px-1.5 text-xs font-medium text-warning">
            Running low
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {qty(level.on_hand)} {level.unit}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {Number(level.average_cost_pence) > 0
          ? formatPence(Math.round(Number(level.average_cost_pence)))
          : "—"}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {formatPence(valueOf(level))}
      </td>
      <td className="px-3 py-2">
        {level.last_moved_on ? day(level.last_moved_on) : "—"}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <Button variant="ghost" size="sm" onClick={onRecord}>
          Record
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          History
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
      </td>
    </tr>
    {expanded && (
      <tr>
        <td colSpan={6} className="bg-muted/20 px-3 py-3">
          <Movements itemId={level.id} unit={level.unit} />
        </td>
      </tr>
    )}
  </>
);

const Movements = ({ itemId, unit }: { itemId: number; unit: string }) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { data: movements = [], isPending } = useStockMovements(itemId);
  const [voiding, setVoiding] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const voidIt = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await getSupabaseClient()
        .from("stock_movements")
        .update({
          voided_at: new Date().toISOString(),
          void_reason: reason.trim(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setVoiding(null);
      setReason("");
      queryClient.invalidateQueries({ queryKey: STOCK_KEY });
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  if (isPending)
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (movements.length === 0)
    return <p className="text-sm text-muted-foreground">No movements yet.</p>;

  return (
    <ul className="flex flex-col gap-2 text-sm">
      {movements.map((m) => (
        <li
          key={m.id}
          className={m.voided_at ? "text-muted-foreground line-through" : ""}
        >
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="tabular-nums">{day(m.moved_on)}</span>
            <span className="font-medium">{KIND_LABEL[m.kind]}</span>
            <span className="tabular-nums">
              {m.quantity_delta > 0 ? "+" : ""}
              {qty(m.quantity_delta)} {unit}
            </span>
            {Number(m.unit_cost_pence) > 0 && (
              <span className="text-muted-foreground tabular-nums">
                at {formatPence(Math.round(Number(m.unit_cost_pence)))} each
              </span>
            )}
            {m.order_id ? (
              <Link
                className="text-primary hover:underline no-underline"
                to={`/orders/${m.order_id}`}
              >
                order
              </Link>
            ) : null}
            {!m.voided_at && voiding !== m.id && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVoiding(m.id)}
              >
                Void
              </Button>
            )}
            {m.voided_at ? (
              <span className="no-underline">Voided: {m.void_reason}</span>
            ) : null}
          </div>
          <div className="text-muted-foreground">{m.note}</div>
          {voiding === m.id && (
            <div className="mt-1 flex gap-2">
              <Input
                autoFocus
                placeholder="Why"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!reason.trim() || voidIt.isPending}
                onClick={() => voidIt.mutate(m.id)}
              >
                Void
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setVoiding(null);
                  setReason("");
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
};

const Figure = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border p-3">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="text-lg font-semibold tabular-nums">{value}</dd>
  </div>
);
