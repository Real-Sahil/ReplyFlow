export type BillStatus = "unpaid" | "paid" | "void";

export type Bill = {
  id: number;
  bill_date: string;
  due_date: string | null;
  supplier_name: string;
  supplier_vat_number: string | null;
  reference: string | null;
  category: string;
  category_label: string;
  description: string;
  note: string | null;
  order_id: number | null;
  order_reference: string | null;
  order_summary: string | null;
  order_note: string | null;
  vat_code: string;
  net_pence: number;
  vat_pence: number;
  gross_pence: number;
  vat_reclaimable: boolean;
  paid_date: string | null;
  payment_method: "cash" | "card" | "bank_transfer" | null;
  receipt_path: string | null;
  voided_at: string | null;
  void_reason: string | null;
  status: BillStatus;
};

export const BILLS_KEY = ["bills"];

export const METHOD_LABEL: Record<
  NonNullable<Bill["payment_method"]>,
  string
> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
};
