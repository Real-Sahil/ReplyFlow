export type InvoiceLine = {
  id: number;
  position: number;
  description: string;
  quantity: number;
  unit_amount_pence: number;
  vat_code: string;
  vat_percent: number;
  net_pence: number;
  vat_pence: number;
  gross_pence: number;
};

export type Invoice = {
  id: number;
  kind: "invoice" | "credit_note";
  number: string;
  order_id: number;
  order_reference: string;
  order_summary: string | null;
  order_note: string | null;
  credit_for_id: number | null;
  customer_name: string | null;
  customer_address: string | null;
  issue_date: string;
  due_date: string | null;
  supplier_name: string;
  supplier_address: string | null;
  supplier_vat_number: string | null;
  vat_registered: boolean;
  prices_include_vat: boolean;
  net_pence: number;
  vat_pence: number;
  gross_pence: number;
  note: string | null;
  // The currency the invoice was made in. It never changes, whatever the business uses later.
  currency?: string;
  created_at: string;
  invoice_lines?: InvoiceLine[];
};

export const INVOICES_KEY = ["invoices"];

export const kindLabel = (kind: Invoice["kind"]) =>
  kind === "credit_note" ? "Credit note" : "Invoice";
