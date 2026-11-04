import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetList, useNotify } from "ra-core";

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

import { useBills } from "../finance/useBills";
import { getSupabaseClient } from "../providers/supabase/supabase";
import {
  KIND_LABEL,
  STOCK_KEY,
  type StockLevel,
  type StockMovement,
} from "./stockTypes";

const today = () => new Date().toLocaleDateString("en-CA");

const Field = ({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1">
    <Label htmlFor={id}>{label}</Label>
    {children}
  </div>
);

// Adds or edits something the business holds: a material, a part, a finished product.
export const ItemDialog = ({
  item,
  onClose,
}: {
  item?: StockLevel;
  onClose: () => void;
}) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "each");
  const [sku, setSku] = useState(item?.sku ?? "");
  const [reorder, setReorder] = useState(
    item?.reorder_level != null ? String(item.reorder_level) : "",
  );
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [active, setActive] = useState(item?.active ?? true);

  const save = useMutation({
    mutationFn: async () => {
      const row = {
        name: name.trim(),
        unit: unit.trim() || "each",
        sku: sku.trim() || null,
        reorder_level: reorder.trim() === "" ? null : Number(reorder),
        notes: notes.trim() || null,
        active,
      };
      const client = getSupabaseClient();
      const { error } = item
        ? await client.from("stock_items").update(row).eq("id", item.id)
        : await client.from("stock_items").insert(row);
      if (error)
        throw new Error(
          error.code === "23505"
            ? "You already have an item with that name."
            : error.message,
        );
    },
    onSuccess: () => {
      notify(item ? "Item updated" : "Item added", { type: "success" });
      queryClient.invalidateQueries({ queryKey: STOCK_KEY });
      onClose();
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  const valid =
    name.trim().length > 0 && (reorder.trim() === "" || Number(reorder) >= 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Edit item" : "New stock item"}</DialogTitle>
          <DialogDescription>
            Something you buy or make and keep: a material, a part, a finished
            product.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field id="s-name" label="Name">
              <Input
                id="s-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </div>
          <Field id="s-unit" label="Counted in (m, kg, each, box)">
            <Input
              id="s-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </Field>
          <Field id="s-sku" label="Code (optional)">
            <Input
              id="s-sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          </Field>
          <Field id="s-reorder" label="Warn me at or below (optional)">
            <Input
              id="s-reorder"
              inputMode="decimal"
              value={reorder}
              onChange={(e) => setReorder(e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Still in use
          </label>
          <div className="sm:col-span-2">
            <Field id="s-notes" label="Notes (optional)">
              <Input
                id="s-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Records stock coming in, going into production, being wasted, or a count correction. What is
// taken out is valued by the database at the average price paid so far.
export const MovementDialog = ({
  item,
  onClose,
}: {
  item: StockLevel;
  onClose: () => void;
}) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { data: orders = [] } = useGetList("orders", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "id", order: "DESC" },
  });
  const { data: bills = [] } = useBills({});
  const [kind, setKind] = useState<StockMovement["kind"]>("purchase");
  const [quantity, setQuantity] = useState("");
  const [sign, setSign] = useState<1 | -1>(1);
  const [cost, setCost] = useState("");
  const [date, setDate] = useState(today());
  const [order, setOrder] = useState("");
  const [bill, setBill] = useState("");
  const [note, setNote] = useState("");

  const amount = Number(quantity);
  const delta =
    kind === "purchase"
      ? amount
      : kind === "adjustment"
        ? sign * amount
        : -amount;

  const issues: string[] = [];
  if (!(amount > 0)) issues.push("Enter the quantity.");
  if (kind === "purchase" && cost.trim() === "")
    issues.push("Enter what each one cost.");
  if (note.trim().length < 3)
    issues.push("Add a note saying what this was for.");
  if (
    kind !== "purchase" &&
    delta < 0 &&
    Math.abs(delta) > Number(item.on_hand)
  )
    issues.push(
      `Only ${Number(item.on_hand)} ${item.unit} on hand. A count correction can fix a wrong count.`,
    );

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseClient()
        .from("stock_movements")
        .insert({
          item_id: item.id,
          kind,
          quantity_delta: delta,
          unit_cost_pence:
            kind === "purchase" ? Math.round(Number(cost) * 100) : 0,
          moved_on: date,
          order_id: kind === "use" && order ? Number(order) : null,
          bill_id: kind === "purchase" && bill ? Number(bill) : null,
          note: note.trim(),
        });
      if (error) throw error;
    },
    onSuccess: () => {
      notify("Stock recorded", { type: "success" });
      queryClient.invalidateQueries({ queryKey: STOCK_KEY });
      onClose();
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>
            {qtyLine(item)} Once recorded it cannot be changed. Void it and add
            a new one.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field id="mv-kind" label="What happened">
              <select
                id="mv-kind"
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as StockMovement["kind"])
                }
              >
                {(Object.keys(KIND_LABEL) as StockMovement["kind"][]).map(
                  (k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ),
                )}
              </select>
            </Field>
          </div>
          <Field id="mv-qty" label={`Quantity (${item.unit})`}>
            <Input
              id="mv-qty"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
          {kind === "adjustment" && (
            <Field id="mv-sign" label="The count was">
              <select
                id="mv-sign"
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
                value={sign}
                onChange={(e) => setSign(Number(e.target.value) === 1 ? 1 : -1)}
              >
                <option value={1}>Too low (add)</option>
                <option value={-1}>Too high (remove)</option>
              </select>
            </Field>
          )}
          {kind === "purchase" && (
            <Field id="mv-cost" label={`Cost of each ${item.unit} (£)`}>
              <Input
                id="mv-cost"
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </Field>
          )}
          <Field id="mv-date" label="Date">
            <Input
              id="mv-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          {kind === "use" && (
            <Field id="mv-order" label="Used for order (optional)">
              <select
                id="mv-order"
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              >
                <option value="">Not for a particular order</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.reference}
                    {o.product_summary ? ` · ${o.product_summary}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {kind === "purchase" && (
            <Field id="mv-bill" label="Supplier bill (optional)">
              <select
                id="mv-bill"
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
                value={bill}
                onChange={(e) => setBill(e.target.value)}
              >
                <option value="">Not linked to a bill</option>
                {bills
                  .filter((b) => b.status !== "void")
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.supplier_name}
                      {b.reference ? ` · ${b.reference}` : ""}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <div className="sm:col-span-2">
            <Field id="mv-note" label="Note (required)">
              <Input
                id="mv-note"
                placeholder="What it was for"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>
        </div>
        {issues.length > 0 && (amount > 0 || note.length > 0) && (
          <ul role="alert" className="list-disc pl-5 text-sm text-destructive">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={issues.length > 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Record"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const qtyLine = (item: StockLevel) =>
  `${Number(item.on_hand).toLocaleString("en-GB", { maximumFractionDigits: 3 })} ${item.unit} on hand.`;
