import { describe, expect, it } from "vitest";
import {
  orderTrace,
  readiness,
  sage50,
  ukDate,
  vatWorkings,
  xeroBills,
  xeroSales,
  type BillRow,
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
