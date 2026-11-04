// The accountant's pack: files an accountant can import, and the VAT return worked out with every
// figure traced to the documents behind it. Pure functions over the rows of invoice_ledger and
// bill_ledger, so every rule can be tested. Nothing here files anything with HMRC.
//
// The import layouts follow each product's published CSV import format. Tax names and account codes
// differ between accountants' setups, so the account codes come from the business's own settings
// and are left empty when not given; the readiness checks say so before anything is downloaded.

import { flatRateVatOwed } from "./vatMath";

export type SalesRow = {
  number: string;
  kind: "invoice" | "credit_note";
  issue_date: string;
  tax_point: string;
  due_date: string | null;
  order_reference: string;
  order_summary: string | null;
  order_note: string | null;
  document_note: string | null;
  customer_name: string | null;
  credit_for_number: string | null;
  supplier_vat_number: string | null;
  vat_registered: boolean;
  position: number;
  description: string;
  quantity: number;
  vat_code: string;
  vat_percent: number;
  // Signed: credit notes are negative.
  net_pence: number;
  vat_pence: number;
  gross_pence: number;
};

export type BillRow = {
  bill_date: string;
  due_date: string | null;
  supplier_name: string;
  supplier_vat_number: string | null;
  reference: string | null;
  category: string;
  category_label: string;
  description: string;
  note: string | null;
  order_reference: string | null;
  order_summary: string | null;
  order_note: string | null;
  vat_code: string;
  net_pence: number;
  vat_pence: number;
  gross_pence: number;
  vat_reclaimable: boolean;
  paid_date: string | null;
  status: "unpaid" | "paid" | "void";
  receipt_path: string | null;
};

export type AccountingCodes = {
  sales?: string;
  bills?: Record<string, string>;
};

export type Settings = {
  vatRegistered: boolean;
  vatScheme: "standard" | "flat_rate" | "cash";
  flatRatePercent: number | null;
};

export type Csv = {
  filename: string;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
};

export type Software = "xero" | "quickbooks" | "sage50";

const pounds = (pence: number) => (pence / 100).toFixed(2);

// dd/mm/yyyy, the way UK accounting software reads dates.
export const ukDate = (iso: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

// What every line says about the order it came from, so no one has to chase it.
export const orderTrace = (
  reference: string | null,
  summary: string | null,
  note: string | null,
) => {
  if (!reference) return "";
  const parts = [reference];
  if (summary) parts.push(summary);
  const head = parts.join(": ");
  return note ? `${head}. Order note: ${note}` : head;
};

const lineText = (description: string, trace: string, extra?: string | null) =>
  [description, trace && `(${trace})`, extra].filter(Boolean).join(" ");

const col = (...keys: string[]) => keys.map((k) => ({ key: k, label: k }));

// ---- Xero -----------------------------------------------------------------------------

const xeroTax = (
  code: string,
  registered: boolean,
  side: "income" | "expense",
) => {
  if (!registered || code === "O") return "No VAT";
  const where = side === "income" ? "Income" : "Expenses";
  if (code === "S") return `20% (VAT on ${where})`;
  if (code === "R") return `5% (VAT on ${where})`;
  if (code === "E") return `Exempt ${where}`;
  return `Zero Rated ${where}`;
};

export const xeroSales = (rows: SalesRow[], codes: AccountingCodes): Csv => ({
  filename: "xero-sales-invoices",
  columns: col(
    "*ContactName",
    "*InvoiceNumber",
    "Reference",
    "*InvoiceDate",
    "*DueDate",
    "*Description",
    "*Quantity",
    "*UnitAmount",
    "*AccountCode",
    "*TaxType",
  ),
  rows: rows.map((r) => {
    const sign = r.kind === "credit_note" ? -1 : 1;
    const qty = Number(r.quantity) || 1;
    return {
      "*ContactName": r.customer_name ?? "Customer",
      "*InvoiceNumber": r.number,
      Reference:
        r.kind === "credit_note" && r.credit_for_number
          ? `${r.order_reference} credits ${r.credit_for_number}`
          : r.order_reference,
      "*InvoiceDate": ukDate(r.issue_date),
      "*DueDate": ukDate(r.due_date ?? r.issue_date),
      "*Description": lineText(
        r.description,
        orderTrace(r.order_reference, r.order_summary, r.order_note),
        r.document_note,
      ),
      "*Quantity": String(sign * qty),
      "*UnitAmount": pounds(Math.abs(r.net_pence) / qty),
      "*AccountCode": codes.sales ?? "",
      "*TaxType": xeroTax(r.vat_code, r.vat_registered, "income"),
    };
  }),
});

export const xeroBills = (
  rows: BillRow[],
  codes: AccountingCodes,
  vatRegistered: boolean,
): Csv => ({
  filename: "xero-bills",
  columns: col(
    "*ContactName",
    "*InvoiceNumber",
    "Reference",
    "*InvoiceDate",
    "*DueDate",
    "*Description",
    "*Quantity",
    "*UnitAmount",
    "*AccountCode",
    "*TaxType",
  ),
  rows: rows.map((b) => ({
    "*ContactName": b.supplier_name,
    "*InvoiceNumber":
      b.reference || `BILL-${b.bill_date}-${b.supplier_name}`.slice(0, 40),
    Reference: b.order_reference ?? "",
    "*InvoiceDate": ukDate(b.bill_date),
    "*DueDate": ukDate(b.due_date ?? b.bill_date),
    "*Description": lineText(
      b.description,
      orderTrace(b.order_reference, b.order_summary, b.order_note),
      b.note,
    ),
    "*Quantity": "1",
    "*UnitAmount": pounds(b.net_pence),
    "*AccountCode": codes.bills?.[b.category] ?? "",
    "*TaxType": b.vat_reclaimable
      ? xeroTax(b.vat_code, vatRegistered, "expense")
      : "No VAT",
  })),
});

// ---- QuickBooks Online ---------------------------------------------------------------

const qboTax = (code: string, registered: boolean) => {
  if (!registered || code === "O") return "Out of scope";
  if (code === "S") return "20.0% S";
  if (code === "R") return "5.0% R";
  if (code === "E") return "Exempt";
  return "0.0% Z";
};

export const quickbooksSales = (
  rows: SalesRow[],
  codes: AccountingCodes,
): Csv => ({
  filename: "quickbooks-sales-invoices",
  columns: col(
    "InvoiceNo",
    "Customer",
    "InvoiceDate",
    "DueDate",
    "Memo",
    "Item(Product/Service)",
    "ItemDescription",
    "ItemQuantity",
    "ItemRate",
    "ItemAmount",
    "ItemTaxCode",
    "ItemTaxAmount",
  ),
  rows: rows.map((r) => {
    const sign = r.kind === "credit_note" ? -1 : 1;
    const qty = Number(r.quantity) || 1;
    return {
      InvoiceNo: r.number,
      Customer: r.customer_name ?? "Customer",
      InvoiceDate: ukDate(r.issue_date),
      DueDate: ukDate(r.due_date ?? r.issue_date),
      Memo:
        r.kind === "credit_note" && r.credit_for_number
          ? `${r.order_reference} credits ${r.credit_for_number}`
          : r.order_reference,
      "Item(Product/Service)": codes.sales ?? "Sales",
      ItemDescription: lineText(
        r.description,
        orderTrace(r.order_reference, r.order_summary, r.order_note),
        r.document_note,
      ),
      ItemQuantity: String(sign * qty),
      ItemRate: pounds(Math.abs(r.net_pence) / qty),
      ItemAmount: pounds(r.net_pence),
      ItemTaxCode: qboTax(r.vat_code, r.vat_registered),
      ItemTaxAmount: pounds(r.vat_pence),
    };
  }),
});

export const quickbooksBills = (
  rows: BillRow[],
  codes: AccountingCodes,
  vatRegistered: boolean,
): Csv => ({
  filename: "quickbooks-bills",
  columns: col(
    "BillNo",
    "Supplier",
    "BillDate",
    "DueDate",
    "Memo",
    "Account",
    "LineDescription",
    "LineAmount",
    "LineTaxCode",
    "LineTaxAmount",
  ),
  rows: rows.map((b) => ({
    BillNo: b.reference || `${b.bill_date}-${b.supplier_name}`.slice(0, 21),
    Supplier: b.supplier_name,
    BillDate: ukDate(b.bill_date),
    DueDate: ukDate(b.due_date ?? b.bill_date),
    Memo: b.order_reference ?? "",
    Account: codes.bills?.[b.category] ?? b.category_label,
    LineDescription: lineText(
      b.description,
      orderTrace(b.order_reference, b.order_summary, b.order_note),
      b.note,
    ),
    LineAmount: pounds(b.net_pence),
    LineTaxCode: b.vat_reclaimable
      ? qboTax(b.vat_code, vatRegistered)
      : "Out of scope",
    LineTaxAmount: b.vat_reclaimable ? pounds(b.vat_pence) : "0.00",
  })),
});

// ---- Sage 50 (audit trail import) --------------------------------------------------------

const sageTax = (code: string, registered: boolean) => {
  if (!registered || code === "O") return "T9";
  if (code === "S") return "T1";
  if (code === "R") return "T5";
  if (code === "E") return "T2";
  return "T0";
};

// Sage matches an account by its reference, which must already exist; the first letters of the
// name in capitals are a starting point the accountant can replace.
const accountRef = (name: string | null) =>
  (name ?? "CUSTOMER")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8) || "CUSTOMER";

export const sage50 = (
  sales: SalesRow[],
  bills: BillRow[],
  codes: AccountingCodes,
  vatRegistered: boolean,
): Csv => ({
  filename: "sage50-transactions",
  columns: col(
    "Type",
    "Account Reference",
    "Nominal A/C Ref",
    "Department",
    "Date",
    "Reference",
    "Details",
    "Net Amount",
    "Tax Code",
    "Tax Amount",
  ),
  rows: [
    ...sales.map((r) => ({
      Type: r.kind === "credit_note" ? "SC" : "SI",
      "Account Reference": accountRef(r.customer_name),
      "Nominal A/C Ref": codes.sales ?? "",
      Department: "",
      Date: ukDate(r.issue_date),
      Reference: r.number,
      Details: lineText(
        r.description,
        orderTrace(r.order_reference, r.order_summary, r.order_note),
        r.document_note,
      ),
      "Net Amount": pounds(Math.abs(r.net_pence)),
      "Tax Code": sageTax(r.vat_code, r.vat_registered),
      "Tax Amount": pounds(Math.abs(r.vat_pence)),
    })),
    ...bills.map((b) => ({
      Type: "PI",
      "Account Reference": accountRef(b.supplier_name),
      "Nominal A/C Ref": codes.bills?.[b.category] ?? "",
      Department: "",
      Date: ukDate(b.bill_date),
      Reference: b.reference ?? "",
      Details: lineText(
        b.description,
        orderTrace(b.order_reference, b.order_summary, b.order_note),
        b.note,
      ),
      "Net Amount": pounds(b.net_pence),
      "Tax Code": b.vat_reclaimable ? sageTax(b.vat_code, vatRegistered) : "T9",
      "Tax Amount": b.vat_reclaimable ? pounds(b.vat_pence) : "0.00",
    })),
  ],
});

// ---- VAT return workings ---------------------------------------------------------------

export type VatBoxes = {
  box1: number; // VAT due on sales
  box2: number; // VAT due on acquisitions from the EU (not handled)
  box3: number; // total VAT due
  box4: number; // VAT reclaimed on purchases
  box5: number; // net VAT to pay or reclaim
  box6: number; // total sales before VAT
  box7: number; // total purchases before VAT
  box8: number;
  box9: number;
};

export type VatWorkings = {
  boxes: VatBoxes;
  notes: string[];
  csv: Csv;
};

export const vatWorkings = (
  sales: SalesRow[],
  bills: BillRow[],
  settings: Settings,
  periodLabel: string,
): VatWorkings => {
  const notes: string[] = [];
  const liveBills = bills.filter((b) => b.status !== "void");
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  let box1 = sum(sales.map((s) => s.vat_pence));
  let box4 = sum(
    liveBills.filter((b) => b.vat_reclaimable).map((b) => b.vat_pence),
  );
  const box6 = sum(
    sales.filter((s) => s.vat_code !== "O").map((s) => s.net_pence),
  );
  const box7 = sum(
    liveBills.filter((b) => b.vat_code !== "O").map((b) => b.net_pence),
  );

  if (!settings.vatRegistered) {
    notes.push(
      "This business is not VAT registered, so there is no VAT return.",
    );
    box1 = 0;
    box4 = 0;
  } else if (
    settings.vatScheme === "flat_rate" &&
    settings.flatRatePercent != null
  ) {
    const gross = sum(sales.map((s) => s.gross_pence));
    box1 = flatRateVatOwed(gross, settings.flatRatePercent);
    box4 = 0;
    notes.push(
      `Flat rate scheme: ${settings.flatRatePercent}% of VAT-inclusive turnover. VAT on purchases is not reclaimed under this scheme, except for some capital items, which your accountant decides.`,
    );
  } else if (settings.vatScheme === "cash") {
    notes.push(
      "Cash accounting scheme: VAT is due when customers pay and reclaimed when you pay. These workings use invoice and bill dates, so your accountant should adjust them for payment dates.",
    );
  }
  notes.push(
    "These are workings to give to your accountant, not a filed return. Boxes 6 to 9 go on the return in whole pounds.",
  );

  const box3 = box1;
  const boxes: VatBoxes = {
    box1,
    box2: 0,
    box3,
    box4,
    box5: box3 - box4,
    box6,
    box7,
    box8: 0,
    box9: 0,
  };

  const detailColumns = [
    "Box",
    "Date",
    "Document",
    "Order",
    "Customer or supplier",
    "Description",
    "Net (£)",
    "VAT (£)",
    "Order note",
  ];
  const rows: Record<string, unknown>[] = [
    { Box: "Period", Date: periodLabel },
    {},
    {
      Box: "Box 1",
      Description: "VAT due on sales",
      "Net (£)": "",
      "VAT (£)": pounds(boxes.box1),
    },
    {
      Box: "Box 2",
      Description: "VAT due on acquisitions from the EU",
      "VAT (£)": pounds(0),
    },
    {
      Box: "Box 3",
      Description: "Total VAT due",
      "VAT (£)": pounds(boxes.box3),
    },
    {
      Box: "Box 4",
      Description: "VAT reclaimed on purchases",
      "VAT (£)": pounds(boxes.box4),
    },
    {
      Box: "Box 5",
      Description: "Net VAT to pay or reclaim",
      "VAT (£)": pounds(boxes.box5),
    },
    {
      Box: "Box 6",
      Description: "Total sales before VAT",
      "Net (£)": pounds(boxes.box6),
    },
    {
      Box: "Box 7",
      Description: "Total purchases before VAT",
      "Net (£)": pounds(boxes.box7),
    },
    { Box: "Box 8", Description: "Supplies to the EU", "Net (£)": pounds(0) },
    {
      Box: "Box 9",
      Description: "Acquisitions from the EU",
      "Net (£)": pounds(0),
    },
    {},
    { Box: "Detail", Description: "Every document behind the boxes above" },
  ];
  for (const s of sales) {
    const base = {
      Date: ukDate(s.tax_point),
      Document: s.number,
      Order: s.order_reference,
      "Customer or supplier": s.customer_name ?? "",
      Description: s.description,
      "Net (£)": pounds(s.net_pence),
      "VAT (£)": pounds(s.vat_pence),
      "Order note": s.order_note ?? "",
    };
    if (s.vat_code !== "O") rows.push({ Box: "Box 6", ...base });
    if (s.vat_pence !== 0) rows.push({ Box: "Box 1", ...base });
  }
  for (const b of liveBills) {
    const base = {
      Date: ukDate(b.bill_date),
      Document: b.reference ?? "",
      Order: b.order_reference ?? "",
      "Customer or supplier": b.supplier_name,
      Description: b.description,
      "Net (£)": pounds(b.net_pence),
      "VAT (£)": pounds(b.vat_pence),
      "Order note": b.order_note ?? "",
    };
    if (b.vat_code !== "O") rows.push({ Box: "Box 7", ...base });
    if (b.vat_reclaimable && b.vat_pence !== 0)
      rows.push({ Box: "Box 4", ...base });
  }
  rows.push({}, ...notes.map((n) => ({ Box: "Note", Description: n })));

  return {
    boxes,
    notes,
    csv: {
      filename: "vat-return-workings",
      columns: detailColumns.map((c) => ({ key: c, label: c })),
      rows,
    },
  };
};

// ---- Readiness -------------------------------------------------------------------------

export type Check = { level: "fix" | "check"; text: string };

// What to sort out before handing the pack over. "fix" would make an import fail or a figure
// wrong; "check" is worth a look.
export const readiness = (
  sales: SalesRow[],
  bills: BillRow[],
  codes: AccountingCodes,
  settings: Settings & {
    businessName: string | null;
    vatNumber: string | null;
  },
): Check[] => {
  const out: Check[] = [];
  const live = bills.filter((b) => b.status !== "void");
  if (!settings.businessName)
    out.push({
      level: "fix",
      text: "Add the business name under Business and VAT.",
    });
  if (settings.vatRegistered && !settings.vatNumber)
    out.push({ level: "fix", text: "VAT is on but there is no VAT number." });
  if (sales.length && !codes.sales)
    out.push({
      level: "check",
      text: "No sales account code is set, so the sales file has an empty account column. Add it under Business and VAT.",
    });
  const noCode = [
    ...new Set(
      live
        .filter((b) => !codes.bills?.[b.category])
        .map((b) => b.category_label),
    ),
  ];
  if (noCode.length)
    out.push({
      level: "check",
      text: `No account code for: ${noCode.join(", ")}.`,
    });
  const noReceipt = live.filter((b) => !b.receipt_path).length;
  if (noReceipt)
    out.push({
      level: "check",
      text: `${noReceipt} ${noReceipt === 1 ? "bill has" : "bills have"} no receipt attached.`,
    });
  if (settings.vatRegistered) {
    const noSupplierVat = live.filter(
      (b) => b.vat_pence > 0 && b.vat_reclaimable && !b.supplier_vat_number,
    ).length;
    if (noSupplierVat)
      out.push({
        level: "check",
        text: `${noSupplierVat} ${noSupplierVat === 1 ? "bill reclaims" : "bills reclaim"} VAT without the supplier's VAT number. HMRC expects a VAT invoice for what you reclaim.`,
      });
  }
  const unpaid = live.filter((b) => b.status === "unpaid").length;
  if (unpaid)
    out.push({
      level: "check",
      text: `${unpaid} ${unpaid === 1 ? "bill is" : "bills are"} still unpaid.`,
    });
  const unnamed = sales.filter((s) => !s.customer_name).length;
  if (unnamed)
    out.push({
      level: "check",
      text: `${unnamed} sales ${unnamed === 1 ? "line has" : "lines have"} no customer name.`,
    });
  const voided = bills.length - live.length;
  if (voided)
    out.push({
      level: "check",
      text: `${voided} voided ${voided === 1 ? "bill is" : "bills are"} left out of the files and the VAT.`,
    });
  return out;
};
