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

import { ATTACHMENTS_BUCKET } from "../providers/commons/attachments";
import { storagePath } from "../providers/supabase/organisationFolder";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPence } from "../quotes/quoteMath";
import { BILLS_KEY, type Bill } from "./billTypes";
import { useBusinessSettings } from "./useBusinessSettings";
import { useExpenseCategories } from "./useBills";
import { isValidUkVatNumber, normaliseVatNumber } from "./vatMath";

const toPence = (pounds: string) => Math.round(Number(pounds || 0) * 100);
const asPounds = (pence: number) => (pence / 100).toFixed(2);
const today = () => new Date().toLocaleDateString("en-CA");

// Adds or edits a supplier bill or expense. The total and the VAT are typed as they appear on the
// supplier's invoice or receipt; the net is worked out from them. A bill can be linked to an
// order, which makes it a cost of that order.
export const BillDialog = ({
  bill,
  orderId,
  onClose,
}: {
  bill?: Bill;
  orderId?: number;
  onClose: () => void;
}) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { data: settings } = useBusinessSettings();
  const { data: categories = [] } = useExpenseCategories();
  const vatOn = !!settings?.vat_registered;
  const { data: orders = [] } = useGetList("orders", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "id", order: "DESC" },
  });

  const [supplier, setSupplier] = useState(bill?.supplier_name ?? "");
  const [supplierVat, setSupplierVat] = useState(
    bill?.supplier_vat_number ?? "",
  );
  const [reference, setReference] = useState(bill?.reference ?? "");
  const [billDate, setBillDate] = useState(bill?.bill_date ?? today());
  const [dueDate, setDueDate] = useState(bill?.due_date ?? "");
  const [category, setCategory] = useState(bill?.category ?? "materials");
  const [description, setDescription] = useState(bill?.description ?? "");
  const [order, setOrder] = useState(String(bill?.order_id ?? orderId ?? ""));
  const [total, setTotal] = useState(bill ? asPounds(bill.gross_pence) : "");
  const [vat, setVat] = useState(bill ? asPounds(bill.vat_pence) : "");
  const [reclaimable, setReclaimable] = useState(bill?.vat_reclaimable ?? true);
  const [paid, setPaid] = useState(!!bill?.paid_date);
  const [paidDate, setPaidDate] = useState(bill?.paid_date ?? today());
  const [method, setMethod] = useState<string>(
    bill?.payment_method ?? "bank_transfer",
  );
  const [note, setNote] = useState(bill?.note ?? "");
  const [file, setFile] = useState<File | null>(null);

  const gross = toPence(total);
  const vatPence = vatOn ? toPence(vat) : 0;
  const net = gross - vatPence;

  const issues: string[] = [];
  if (!supplier.trim()) issues.push("Enter the supplier.");
  if (!description.trim()) issues.push("Describe what it was for.");
  if (!(gross > 0)) issues.push("Enter the total.");
  if (vatPence > net)
    issues.push("The VAT cannot be more than the amount before VAT.");
  if (
    vatOn &&
    supplierVat.trim() &&
    !isValidUkVatNumber(normaliseVatNumber(supplierVat))
  )
    issues.push("The supplier's VAT number should look like GB123456789.");

  const save = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      let receipt_path = bill?.receipt_path ?? null;
      if (file) {
        const ext = file.name.includes(".")
          ? `.${file.name.split(".").pop()}`
          : "";
        const path = await storagePath(`${crypto.randomUUID()}${ext}`);
        const { error: uploadError } = await client.storage
          .from(ATTACHMENTS_BUCKET)
          .upload(path, file);
        if (uploadError) throw new Error("The receipt could not be uploaded.");
        receipt_path = path;
      }
      const row = {
        supplier_name: supplier.trim(),
        supplier_vat_number:
          vatOn && supplierVat.trim() ? normaliseVatNumber(supplierVat) : null,
        reference: reference.trim() || null,
        bill_date: billDate,
        due_date: dueDate || null,
        category,
        description: description.trim(),
        order_id: order ? Number(order) : null,
        vat_code: vatOn ? "S" : "O",
        net_pence: net,
        vat_pence: vatPence,
        vat_reclaimable: reclaimable,
        paid_date: paid ? paidDate : null,
        payment_method: paid ? method : null,
        receipt_path,
        note: note.trim() || null,
      };
      const { error } = bill
        ? await client.from("bills").update(row).eq("id", bill.id)
        : await client.from("bills").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      notify(bill ? "Bill updated" : "Bill added", { type: "success" });
      queryClient.invalidateQueries({ queryKey: BILLS_KEY });
      onClose();
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-5 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {bill ? "Edit bill" : "Add a bill or expense"}
          </DialogTitle>
          <DialogDescription>
            Type the figures as they appear on the supplier's invoice or
            receipt. Changes are recorded in the history.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="b-supplier" label="Supplier">
            <Input
              id="b-supplier"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </Field>
          <Field id="b-ref" label="Their invoice number (optional)">
            <Input
              id="b-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
          <Field id="b-date" label="Bill date">
            <Input
              id="b-date"
              type="date"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
            />
          </Field>
          <Field id="b-due" label="Due (optional)">
            <Input
              id="b-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
          <Field id="b-cat" label="Category">
            <select
              id="b-cat"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="b-order" label="Cost of order (optional)">
            <select
              id="b-order"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            >
              <option value="">Not linked to an order</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.reference}
                  {o.product_summary ? ` · ${o.product_summary}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field id="b-desc" label="What it was for">
              <Input
                id="b-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </div>
          <Field id="b-total" label="Total on the bill (£)">
            <Input
              id="b-total"
              inputMode="decimal"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </Field>
          {vatOn ? (
            <Field id="b-vat" label="Of which VAT (£)">
              <Input
                id="b-vat"
                inputMode="decimal"
                value={vat}
                onChange={(e) => setVat(e.target.value)}
              />
            </Field>
          ) : (
            <p className="self-end text-sm text-muted-foreground">
              VAT is off for this business, so no VAT is recorded.
            </p>
          )}
          {vatOn && (
            <>
              <Field id="b-svat" label="Supplier VAT number (optional)">
                <Input
                  id="b-svat"
                  placeholder="GB123456789"
                  value={supplierVat}
                  onChange={(e) => setSupplierVat(e.target.value)}
                />
              </Field>
              <label className="flex items-center gap-2 self-end text-sm">
                <input
                  type="checkbox"
                  checked={reclaimable}
                  onChange={(e) => setReclaimable(e.target.checked)}
                />
                VAT can be reclaimed on this
              </label>
            </>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={paid}
              onChange={(e) => setPaid(e.target.checked)}
            />
            Already paid
          </label>
          {paid && (
            <>
              <Field id="b-paid" label="Paid on">
                <Input
                  id="b-paid"
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                />
              </Field>
              <Field id="b-method" label="How">
                <select
                  id="b-method"
                  className="h-9 rounded-md border bg-transparent px-2 text-sm"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="card">Card</option>
                  <option value="cash">Cash</option>
                </select>
              </Field>
            </>
          )}
          <div className="sm:col-span-2">
            <Field
              id="b-file"
              label={
                bill?.receipt_path
                  ? "Replace the receipt (optional)"
                  : "Receipt or invoice (photo or PDF)"
              }
            >
              <Input
                id="b-file"
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field id="b-note" label="Note (optional)">
              <Input
                id="b-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>
        </div>

        {gross > 0 && (
          <p className="text-sm text-muted-foreground">
            Before VAT {formatPence(Math.max(0, net))}
            {vatOn ? `, VAT ${formatPence(vatPence)}` : ""}, total{" "}
            {formatPence(gross)}.
          </p>
        )}
        {issues.length > 0 && gross > 0 && (
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
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

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
