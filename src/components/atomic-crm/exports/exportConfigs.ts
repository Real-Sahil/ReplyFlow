// What each list exports. Columns are in the order they appear in the file. Money is in
// pounds, and dates are read on the London calendar so a payment made late in the evening
// lands on the day it was made.
import { orderStatuses } from "../orders/statuses";
import {
  KIND_LABELS,
  METHOD_LABELS,
  type PaymentKind,
  type PaymentMethod,
} from "../orders/orderPayments";
import type { ExportConfig } from "./ExportDialog";

type Row = Record<string, unknown>;
type Named = { first_name?: string | null; last_name?: string | null } | null;

const text = (value: unknown) =>
  value === null || value === undefined ? "" : String(value);
const pounds = (pence: unknown) =>
  pence === null || pence === undefined ? "" : (Number(pence) / 100).toFixed(2);
const day = (value: unknown) =>
  value
    ? new Date(String(value)).toLocaleDateString("en-CA", {
        timeZone: "Europe/London",
      })
    : "";
const moment = (value: unknown) =>
  value
    ? new Date(String(value)).toLocaleString("en-GB", {
        timeZone: "Europe/London",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
const yesNo = (value: unknown) => (value ? "Yes" : "No");
const personName = (person: Named) =>
  [person?.first_name, person?.last_name].filter(Boolean).join(" ");
const firstValue = (list: unknown, field: string) => {
  const items = Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
  return text(items[0]?.[field]);
};

const STATUS_LABEL = Object.fromEntries(
  orderStatuses.map((s) => [s.id, s.name]),
);
const TERMS_LABEL: Record<string, string> = {
  cash_on_delivery: "Cash on delivery",
  deposit_first: "Deposit first",
};

export const ordersExport = (): ExportConfig => ({
  filename: "orders",
  title: "Orders",
  table: "orders",
  select:
    "reference, status, sales_channel, product_summary, payment_terms, agreed_price_pence, deposit_required_pence, paid_pence, balance_pence, security_deposit_pence, delivery_window_end, created_at, contacts(first_name, last_name)",
  dateColumn: "created_at",
  dateKind: "timestamp",
  filters: [
    {
      label: "Status",
      column: "status",
      options: orderStatuses.map((s) => ({ value: s.id, label: s.name })),
    },
  ],
  columns: [
    { key: "reference", label: "Order" },
    { key: "created", label: "Created" },
    { key: "customer", label: "Customer" },
    { key: "product", label: "Product" },
    { key: "status", label: "Status" },
    { key: "channel", label: "Sales channel" },
    { key: "terms", label: "Payment" },
    { key: "agreed", label: "Agreed (£)" },
    { key: "deposit", label: "Deposit due (£)" },
    { key: "paid", label: "Paid (£)" },
    { key: "balance", label: "Balance due (£)" },
    { key: "security", label: "Security deposit (£)" },
    { key: "delivery", label: "Delivery by" },
  ],
  toRow: (row: Row) => ({
    reference: text(row.reference),
    created: day(row.created_at),
    customer: personName(row.contacts as Named),
    product: text(row.product_summary),
    status: STATUS_LABEL[text(row.status)] ?? text(row.status),
    channel: text(row.sales_channel),
    terms: TERMS_LABEL[text(row.payment_terms)] ?? "",
    agreed: pounds(row.agreed_price_pence),
    deposit: pounds(row.deposit_required_pence),
    paid: pounds(row.paid_pence),
    balance: pounds(row.balance_pence),
    security: pounds(row.security_deposit_pence),
    delivery: day(row.delivery_window_end),
  }),
});

export const transactionsExport = (): ExportConfig => ({
  filename: "transactions",
  title: "Transactions",
  table: "order_payments",
  select:
    "kind, amount_pence, method, received_at, note, orders(reference, contacts(first_name, last_name))",
  dateColumn: "received_at",
  dateKind: "timestamp",
  filters: [
    {
      label: "Type",
      column: "kind",
      options: (Object.keys(KIND_LABELS) as PaymentKind[]).map((k) => ({
        value: k,
        label: KIND_LABELS[k],
      })),
    },
    {
      label: "Method",
      column: "method",
      options: (Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => ({
        value: m,
        label: METHOD_LABELS[m],
      })),
    },
  ],
  columns: [
    { key: "date", label: "Date" },
    { key: "order", label: "Order" },
    { key: "customer", label: "Customer" },
    { key: "type", label: "Type" },
    { key: "method", label: "Method" },
    { key: "amount", label: "Amount (£)" },
    { key: "note", label: "Note" },
  ],
  toRow: (row: Row) => {
    const order = row.orders as { reference?: string; contacts?: Named } | null;
    return {
      date: moment(row.received_at),
      order: text(order?.reference),
      customer: personName(order?.contacts ?? null),
      type: KIND_LABELS[text(row.kind) as PaymentKind] ?? text(row.kind),
      method:
        METHOD_LABELS[text(row.method) as PaymentMethod] ?? text(row.method),
      amount: pounds(row.amount_pence),
      note: text(row.note),
    };
  },
});

export const dealsExport = (
  stages: { value: string; label: string }[],
): ExportConfig => ({
  filename: "deals",
  title: "Deals",
  table: "deals",
  select:
    "name, stage, category, amount, expected_closing_date, lead_band, lead_score, created_at, archived_at",
  dateColumn: "created_at",
  dateKind: "timestamp",
  filters: [
    {
      label: "Stage",
      column: "stage",
      options: stages.map((s) => ({ value: s.value, label: s.label })),
    },
  ],
  columns: [
    { key: "name", label: "Deal" },
    { key: "stage", label: "Stage" },
    { key: "category", label: "Category" },
    { key: "amount", label: "Amount" },
    { key: "close", label: "Expected close" },
    { key: "band", label: "Lead" },
    { key: "score", label: "Lead score" },
    { key: "created", label: "Created" },
    { key: "archived", label: "Archived" },
  ],
  toRow: (row: Row) => ({
    name: text(row.name),
    stage: stages.find((s) => s.value === row.stage)?.label ?? text(row.stage),
    category: text(row.category),
    amount: text(row.amount),
    close: day(row.expected_closing_date),
    band: text(row.lead_band),
    score: text(row.lead_score),
    created: day(row.created_at),
    archived: yesNo(row.archived_at),
  }),
});

export const contactsExport = (): ExportConfig => ({
  filename: "contacts",
  title: "Contacts",
  table: "contacts",
  select:
    "first_name, last_name, status, email_jsonb, phone_jsonb, has_newsletter, first_seen, last_seen",
  dateColumn: "first_seen",
  dateKind: "timestamp",
  filters: [],
  columns: [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "status", label: "Status" },
    { key: "newsletter", label: "Newsletter" },
    { key: "first_seen", label: "First seen" },
    { key: "last_seen", label: "Last seen" },
  ],
  toRow: (row: Row) => ({
    name: personName(row as Named),
    email: firstValue(row.email_jsonb, "email"),
    phone: firstValue(row.phone_jsonb, "number"),
    status: text(row.status),
    newsletter: yesNo(row.has_newsletter),
    first_seen: day(row.first_seen),
    last_seen: day(row.last_seen),
  }),
});

export const companiesExport = (): ExportConfig => ({
  filename: "companies",
  title: "Companies",
  table: "companies",
  select: "name, sector, city, country, phone_number, website, created_at",
  dateColumn: "created_at",
  dateKind: "timestamp",
  filters: [],
  columns: [
    { key: "name", label: "Company" },
    { key: "sector", label: "Sector" },
    { key: "city", label: "City" },
    { key: "country", label: "Country" },
    { key: "phone", label: "Phone" },
    { key: "website", label: "Website" },
    { key: "created", label: "Created" },
  ],
  toRow: (row: Row) => ({
    name: text(row.name),
    sector: text(row.sector),
    city: text(row.city),
    country: text(row.country),
    phone: text(row.phone_number),
    website: text(row.website),
    created: day(row.created_at),
  }),
});

export const productsExport = (): ExportConfig => ({
  filename: "products",
  title: "Products",
  table: "products",
  select:
    "reference, title, collection, product_type, colour, price_pence, original_price_pence, active, created_at",
  dateColumn: "created_at",
  dateKind: "timestamp",
  filters: [
    {
      label: "Available to sell",
      column: "active",
      options: [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ],
    },
  ],
  columns: [
    { key: "reference", label: "Reference" },
    { key: "title", label: "Title" },
    { key: "collection", label: "Collection" },
    { key: "type", label: "Type" },
    { key: "colour", label: "Colour" },
    { key: "price", label: "Price (£)" },
    { key: "original", label: "Original price (£)" },
    { key: "active", label: "Available" },
    { key: "created", label: "Added" },
  ],
  toRow: (row: Row) => ({
    reference: text(row.reference),
    title: text(row.title),
    collection: text(row.collection),
    type: text(row.product_type),
    colour: text(row.colour),
    price: pounds(row.price_pence),
    original: pounds(row.original_price_pence),
    active: yesNo(row.active),
    created: day(row.created_at),
  }),
});

// The account, as it is recorded: one line per delivered and paid order, with the date and time
// the order became both. Read from the account_ledger view.
export const accountExport = (): ExportConfig => ({
  filename: "account",
  title: "Account",
  table: "account_ledger",
  select:
    "order_id, reference, product, customer, price_pence, paid_pence, entry_at",
  dateColumn: "entry_at",
  dateKind: "timestamp",
  filters: [],
  columns: [
    { key: "date", label: "Date" },
    { key: "time", label: "Time" },
    { key: "order", label: "Order" },
    { key: "product", label: "Product" },
    { key: "customer", label: "Customer" },
    { key: "price", label: "Price (£)" },
    { key: "paid", label: "Paid (£)" },
  ],
  toRow: (row: Row) => {
    const when = new Date(String(row.entry_at));
    return {
      date: when.toLocaleDateString("en-CA", { timeZone: "Europe/London" }),
      time: when.toLocaleTimeString("en-GB", {
        timeZone: "Europe/London",
        hour: "2-digit",
        minute: "2-digit",
      }),
      order: text(row.reference),
      product: text(row.product),
      customer: text(row.customer),
      price: pounds(row.price_pence),
      paid: pounds(row.paid_pence),
    };
  },
});

// Invoices and credit notes, one row per line. Each row names the order it belongs to, what the
// order was for and the order's own note as it stood when the document was issued, so nobody has
// to chase where a figure came from. Credit notes are negative. Read from invoice_ledger.
export const invoiceLedgerExport = (): ExportConfig => ({
  filename: "invoices",
  title: "Invoices and credit notes",
  table: "invoice_ledger",
  select:
    "number, kind, issue_date, tax_point, due_date, order_reference, order_summary, order_note, document_note, customer_name, credit_for_number, supplier_vat_number, vat_registered, position, description, quantity, vat_code, vat_percent, net_pence, vat_pence, gross_pence",
  dateColumn: "tax_point",
  dateKind: "date",
  filters: [
    {
      label: "Type",
      column: "kind",
      options: [
        { value: "invoice", label: "Invoices" },
        { value: "credit_note", label: "Credit notes" },
      ],
    },
  ],
  columns: [
    { key: "date", label: "Date" },
    { key: "number", label: "Number" },
    { key: "type", label: "Type" },
    { key: "credits", label: "Credits invoice" },
    { key: "order", label: "Order" },
    { key: "order_for", label: "Order is for" },
    { key: "customer", label: "Customer" },
    { key: "line", label: "Line" },
    { key: "description", label: "Description" },
    { key: "quantity", label: "Quantity" },
    { key: "vat_code", label: "VAT code" },
    { key: "vat_rate", label: "VAT rate (%)" },
    { key: "net", label: "Net (£)" },
    { key: "vat", label: "VAT (£)" },
    { key: "gross", label: "Gross (£)" },
    { key: "order_note", label: "Order note" },
    { key: "document_note", label: "Note on document" },
    { key: "supplier_vat", label: "Supplier VAT number" },
  ],
  toRow: (row: Row) => ({
    date: text(row.tax_point),
    number: text(row.number),
    type: row.kind === "credit_note" ? "Credit note" : "Invoice",
    credits: text(row.credit_for_number),
    order: text(row.order_reference),
    order_for: text(row.order_summary),
    customer: text(row.customer_name),
    line: text(row.position),
    description: text(row.description),
    quantity: text(row.quantity),
    vat_code: row.vat_registered ? text(row.vat_code) : "",
    vat_rate: row.vat_registered ? text(row.vat_percent) : "",
    net: pounds(row.net_pence),
    vat: pounds(row.vat_pence),
    gross: pounds(row.gross_pence),
    order_note: text(row.order_note),
    document_note: text(row.document_note),
    supplier_vat: text(row.supplier_vat_number),
  }),
});

// Supplier bills and expenses, one row per bill. Each row names the order it is a cost of, what that
// order is for and the order's own note, so nobody has to chase where a cost belongs. Voided bills
// are included and marked, so the file matches the history. Read from bill_ledger.
export const billLedgerExport = (): ExportConfig => ({
  filename: "bills",
  title: "Bills and expenses",
  table: "bill_ledger",
  select:
    "bill_date, due_date, supplier_name, supplier_vat_number, reference, category_label, description, note, order_reference, order_summary, order_note, vat_code, net_pence, vat_pence, gross_pence, vat_reclaimable, paid_date, payment_method, status, void_reason, receipt_path",
  dateColumn: "bill_date",
  dateKind: "date",
  filters: [
    {
      label: "Status",
      column: "status",
      options: [
        { value: "unpaid", label: "Unpaid" },
        { value: "paid", label: "Paid" },
        { value: "void", label: "Voided" },
      ],
    },
  ],
  columns: [
    { key: "date", label: "Date" },
    { key: "supplier", label: "Supplier" },
    { key: "supplier_vat", label: "Supplier VAT number" },
    { key: "reference", label: "Their invoice number" },
    { key: "category", label: "Category" },
    { key: "description", label: "What it was for" },
    { key: "order", label: "Cost of order" },
    { key: "order_for", label: "Order is for" },
    { key: "net", label: "Net (£)" },
    { key: "vat", label: "VAT (£)" },
    { key: "gross", label: "Gross (£)" },
    { key: "vat_code", label: "VAT code" },
    { key: "reclaimable", label: "VAT reclaimable" },
    { key: "status", label: "Status" },
    { key: "paid_date", label: "Paid on" },
    { key: "method", label: "Paid by" },
    { key: "order_note", label: "Order note" },
    { key: "note", label: "Note on bill" },
    { key: "void_reason", label: "Void reason" },
    { key: "receipt", label: "Receipt on file" },
  ],
  toRow: (row: Row) => ({
    date: text(row.bill_date),
    supplier: text(row.supplier_name),
    supplier_vat: text(row.supplier_vat_number),
    reference: text(row.reference),
    category: text(row.category_label),
    description: text(row.description),
    order: text(row.order_reference),
    order_for: text(row.order_summary),
    net: pounds(row.net_pence),
    vat: pounds(row.vat_pence),
    gross: pounds(row.gross_pence),
    vat_code: text(row.vat_code),
    reclaimable: yesNo(row.vat_reclaimable),
    status: text(row.status),
    paid_date: text(row.paid_date),
    method: text(row.payment_method),
    order_note: text(row.order_note),
    note: text(row.note),
    void_reason: text(row.void_reason),
    receipt: row.receipt_path ? "Yes" : "No",
  }),
});

// The money book, one row per entry, with the note and the order it belongs to. Money out is
// negative, so the file adds up. Voided and planned entries are included and labelled. Read from
// money_ledger.
export const moneyLedgerExport = (): ExportConfig => ({
  filename: "money-book",
  title: "Money book",
  table: "money_ledger",
  select:
    "entry_date, period_from, period_to, direction, category_label, category_group, state, amount_pence, counterparty, payment_method, reference, channel, order_reference, order_summary, order_note, regulated, note, void_reason, receipt_path",
  dateColumn: "entry_date",
  dateKind: "date",
  filters: [
    {
      label: "Direction",
      column: "direction",
      options: [
        { value: "in", label: "Money in" },
        { value: "out", label: "Money out" },
      ],
    },
    {
      label: "Status",
      column: "state",
      options: [
        { value: "done", label: "Done" },
        { value: "planned", label: "Planned" },
        { value: "void", label: "Voided" },
      ],
    },
  ],
  columns: [
    { key: "date", label: "Date" },
    { key: "state", label: "Status" },
    { key: "direction", label: "In or out" },
    { key: "group", label: "Group" },
    { key: "category", label: "Category" },
    { key: "amount", label: "Amount (£)" },
    { key: "who", label: "With" },
    { key: "method", label: "Paid by" },
    { key: "reference", label: "Reference" },
    { key: "channel", label: "Sales channel" },
    { key: "period", label: "Covers" },
    { key: "order", label: "Order" },
    { key: "order_for", label: "Order is for" },
    { key: "regulated", label: "Regulated" },
    { key: "note", label: "Note" },
    { key: "order_note", label: "Order note" },
    { key: "void_reason", label: "Void reason" },
    { key: "receipt", label: "Receipt on file" },
  ],
  toRow: (row: Row) => ({
    date: text(row.entry_date),
    state: text(row.state),
    direction: row.direction === "in" ? "Money in" : "Money out",
    group: text(row.category_group),
    category: text(row.category_label),
    amount: pounds(
      row.direction === "in" ? row.amount_pence : -Number(row.amount_pence),
    ),
    who: text(row.counterparty),
    method: text(row.payment_method),
    reference: text(row.reference),
    channel: text(row.channel),
    period: row.period_from
      ? `${text(row.period_from)} to ${text(row.period_to)}`
      : "",
    order: text(row.order_reference),
    order_for: text(row.order_summary),
    regulated: yesNo(row.regulated),
    note: text(row.note),
    order_note: text(row.order_note),
    void_reason: text(row.void_reason),
    receipt: row.receipt_path ? "Yes" : "No",
  }),
});

// What is held, at the average price paid. Read from stock_levels, so the file matches the screen.
export const stockExport = (): ExportConfig => ({
  filename: "stock",
  title: "Stock",
  table: "stock_levels",
  select:
    "name, sku, unit, on_hand, average_cost_pence, reorder_level, last_moved_on, active, notes",
  dateColumn: "last_moved_on",
  dateKind: "date",
  filters: [],
  columns: [
    { key: "name", label: "Item" },
    { key: "sku", label: "Code" },
    { key: "unit", label: "Unit" },
    { key: "on_hand", label: "On hand" },
    { key: "cost", label: "Average cost (£)" },
    { key: "worth", label: "Worth (£)" },
    { key: "reorder", label: "Warn at or below" },
    { key: "last", label: "Last moved" },
    { key: "active", label: "In use" },
    { key: "notes", label: "Notes" },
  ],
  toRow: (row: Row) => ({
    name: text(row.name),
    sku: text(row.sku),
    unit: text(row.unit),
    on_hand: text(row.on_hand),
    cost: pounds(Math.round(Number(row.average_cost_pence))),
    worth: pounds(
      Math.round(Number(row.on_hand) * Number(row.average_cost_pence)),
    ),
    reorder: text(row.reorder_level),
    last: text(row.last_moved_on),
    active: yesNo(row.active),
    notes: text(row.notes),
  }),
});
