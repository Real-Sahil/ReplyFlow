import { describe, expect, it } from "vitest";
import type { CashRow } from "./cashBookPdf";
import {
  bankFile,
  orderTrace,
  readiness,
  sage50,
  ukDate,
  vatWorkings,
  xeroBills,
  xeroSales,
  type BillRow,
  type EntryRow,
  type SalesRow,
} from "./accountantPack";

const sale = (o: Partial<SalesRow> = {}): SalesRow => ({
  number: "INV-00001",
  kind: "invoice",
  issue_date: "2026-11-02",
  tax_point: "2026-11-02",
  due_date: "2026-11-02",
  order_reference: "ORD-00005",
  order_summary: "Test sofa",
  order_note: "Deposit taken by phone",
  document_note: null,
  customer_name: "Amy Hart",
  credit_for_number: null,
  supplier_vat_number: "GB123456789",
  vat_registered: true,
  position: 1,
  description: "Sofa",
  quantity: 1,
  vat_code: "S",
  vat_percent: 20,
  net_pence: 100000,
  vat_pence: 20000,
  gross_pence: 120000,
  ...o,
});
const bill = (o: Partial<BillRow> = {}): BillRow => ({
  bill_date: "2026-11-03",
  due_date: null,
  supplier_name: "Frame Makers Ltd",
  supplier_vat_number: null,
  reference: "FM-77",
  category: "materials",
  category_label: "Stock and materials",
  description: "Sofa frame",
  note: null,
  order_reference: "ORD-00005",
  order_summary: "Test sofa",
  order_note: "Deposit taken by phone",
  vat_code: "S",
  net_pence: 50000,
  vat_pence: 10000,
  gross_pence: 60000,
  vat_reclaimable: true,
  paid_date: null,
  status: "unpaid",
  receipt_path: null,
  ...o,
});
const standard = {
  vatRegistered: true,
  vatScheme: "standard" as const,
  flatRatePercent: null,
};

describe("vatWorkings", () => {
  const sales = [
    sale(),
    sale({
      number: "CN-00001",
      kind: "credit_note",
      net_pence: -25000,
      vat_pence: -5000,
      gross_pence: -30000,
    }),
    sale({
      number: "INV-00002",
      vat_code: "Z",
      vat_percent: 0,
      net_pence: 2000,
      vat_pence: 0,
      gross_pence: 2000,
    }),
  ];
  const bills = [
    bill(),
    bill({ status: "void", net_pence: 9999, vat_pence: 1999 }),
    bill({
      category: "bank",
      vat_code: "O",
      net_pence: 300,
      vat_pence: 0,
      vat_reclaimable: false,
    }),
  ];

  it("works out the boxes, leaving out voided bills and outside-scope items", () => {
    const { boxes } = vatWorkings(sales, bills, standard, "Nov 2026");
    expect(boxes.box1).toBe(15000);
    expect(boxes.box4).toBe(10000);
    expect(boxes.box5).toBe(5000);
    expect(boxes.box6).toBe(77000);
    expect(boxes.box7).toBe(50000);
  });

  it("is zero for a business that is not VAT registered", () => {
    const { boxes } = vatWorkings(
      sales,
      bills,
      { vatRegistered: false, vatScheme: "standard", flatRatePercent: null },
      "x",
    );
    expect(boxes.box1).toBe(0);
    expect(boxes.box4).toBe(0);
  });
});

describe("software files", () => {
  it("carries the order reference and note onto every line", () => {
    const [row] = xeroSales([sale()], { sales: "200" }).rows;
    expect(row["*Description"]).toContain(
      "ORD-00005: Test sofa. Order note: Deposit taken by phone",
    );
    expect(row["*AccountCode"]).toBe("200");
  });
  it("makes credit notes negative", () => {
    const [row] = xeroSales(
      [sale({ kind: "credit_note", net_pence: -25000 })],
      {},
    ).rows;
    expect(row["*Quantity"]).toBe("-1");
    expect(row["*UnitAmount"]).toBe("250.00");
  });
  it("says No VAT when the business is not registered", () => {
    expect(
      xeroSales(
        [sale({ vat_registered: false, vat_code: "O", vat_pence: 0 })],
        {},
      ).rows[0]["*TaxType"],
    ).toBe("No VAT");
  });
  it("takes bill account codes from the business's own settings", () => {
    const rows = xeroBills(
      [bill(), bill({ category: "bank" })],
      { bills: { materials: "310" } },
      true,
    ).rows;
    expect(rows[0]["*AccountCode"]).toBe("310");
    expect(rows[1]["*AccountCode"]).toBe("");
  });
  it("puts sales and purchases in one Sage file", () => {
    const rows = sage50(
      [sale(), sale({ kind: "credit_note" })],
      [bill()],
      {},
      true,
    ).rows;
    expect(rows.map((r) => r.Type)).toEqual(["SI", "SC", "PI"]);
  });
});

describe("readiness", () => {
  it("asks for the business name before anything else", () => {
    const checks = readiness(
      [sale()],
      [bill()],
      {},
      { ...standard, businessName: null, vatNumber: "GB123456789" },
    );
    expect(checks.filter((c) => c.level === "fix")).toHaveLength(1);
  });
  it("lists categories without an account code", () => {
    const text = readiness(
      [],
      [bill()],
      {},
      { ...standard, businessName: "Co", vatNumber: "GB123456789" },
    )
      .map((c) => c.text)
      .join(" ");
    expect(text).toContain("No account code for: Stock and materials");
  });
});

describe("helpers", () => {
  it("formats UK dates and the order trace", () => {
    expect(ukDate("2026-11-02")).toBe("02/11/2026");
    expect(orderTrace("ORD-1", "Sofa", null)).toBe("ORD-1: Sofa");
    expect(orderTrace(null, "Sofa", "x")).toBe("");
  });
});

describe("money-book entries in the VAT workings", () => {
  const entry = (o: Partial<EntryRow> = {}): EntryRow => ({
    id: 1,
    entry_date: "2026-11-05",
    direction: "in",
    category: "sales_other",
    category_label: "Sales taken outside invoices",
    state: "done",
    amount_pence: 12000,
    counterparty: "Facebook buyer",
    order_reference: null,
    order_note: null,
    note: "Facebook sale, cushion set",
    vat_code: "S",
    vat_pence: 2000,
    regulated: false,
    ...o,
  });
  const entries = [
    entry(),
    entry({
      id: 2,
      direction: "out",
      category: "software_out",
      category_label: "Software",
      amount_pence: 6000,
      vat_pence: 1000,
      note: "Design tool",
    }),
    entry({
      id: 3,
      direction: "out",
      category: "wages",
      category_label: "Wages",
      amount_pence: 90000,
      vat_code: "O",
      vat_pence: 0,
      note: "Pay",
      regulated: true,
    }),
    entry({ id: 4, state: "planned", amount_pence: 99999, vat_pence: 9999 }),
    entry({ id: 5, state: "void", amount_pence: 77777, vat_pence: 7777 }),
  ];
  it("counts done entries only, and leaves wages out of the VAT boxes", () => {
    const { boxes } = vatWorkings([], [], standard, "Nov", entries);
    expect(boxes.box1).toBe(2000);
    expect(boxes.box4).toBe(1000);
    expect(boxes.box6).toBe(10000);
    expect(boxes.box7).toBe(5000);
  });
});

describe("bank-style files", () => {
  const cash = (o: Partial<CashRow> = {}): CashRow => ({
    source: "entry",
    source_id: 1,
    entry_date: "2026-11-05",
    direction: "out",
    category_group: "People",
    category_label: "Wages and salaries",
    state: "done",
    amount_pence: 90000,
    counterparty: "A. Worker",
    payment_method: "bank_transfer",
    reference: null,
    channel: null,
    order_reference: null,
    order_summary: null,
    order_note: null,
    regulated: true,
    receipt_path: null,
    note: "Pay for the week",
    void_reason: null,
    vat_pence: 0,
    ...o,
  });
  const rows = [
    cash(),
    cash({
      direction: "in",
      category_label: "Sales taken outside invoices",
      amount_pence: 12000,
      vat_pence: 2000,
      regulated: false,
      note: "Facebook sale",
      order_reference: "ORD-00005",
      order_summary: "Oak table",
      order_note: "Delivery by van",
      counterparty: null,
    }),
    cash({ source: "bill", note: "Boards" }),
    cash({ state: "planned" }),
    cash({ state: "void" }),
  ];
  it("signs amounts, carries the note and order, and skips planned, voided and bills", () => {
    const x = bankFile("xero", rows, {}, "entries");
    expect(x.rows).toHaveLength(2);
    expect(x.rows[0]["*Amount"]).toBe("-900.00");
    expect(x.rows[1]["*Amount"]).toBe("120.00");
    expect(String(x.rows[0].Description)).toContain("Regulated payment");
    expect(String(x.rows[1].Description)).toContain(
      "ORD-00005: Oak table. Order note: Delivery by van",
    );
    expect(bankFile("xero", rows, {}, "all").rows).toHaveLength(3);
  });
  it("uses the receipts and payments types for Sage and the bank code from settings", () => {
    const s = bankFile("sage50", rows, { bank: "1200" }, "entries");
    expect(s.rows.map((r) => r.Type)).toEqual(["BP", "BR"]);
    expect(s.rows[1]["Tax Code"]).toBe("T1");
    expect(s.rows[0]["Account Reference"]).toBe("1200");
  });
});
