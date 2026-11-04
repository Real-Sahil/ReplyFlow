import { describe, expect, it } from "vitest";
import type { BillRow, EntryRow, SalesRow } from "./accountantPack";
import {
  cashForecast,
  profitAndLoss,
  salesByChannel,
  type Expected,
} from "./reports";

const sale = (o: Partial<SalesRow> = {}) =>
  ({
    kind: "invoice",
    tax_point: "2026-11-02",
    net_pence: 100000,
    order_reference: "ORD-1",
    ...o,
  }) as SalesRow;
const bill = (o: Partial<BillRow> = {}) =>
  ({
    status: "unpaid",
    bill_date: "2026-11-03",
    category_label: "Stock and materials",
    net_pence: 40000,
    gross_pence: 48000,
    vat_pence: 8000,
    vat_reclaimable: true,
    ...o,
  }) as BillRow;
const entry = (o: Partial<EntryRow> = {}) =>
  ({
    state: "done",
    entry_date: "2026-11-05",
    direction: "in",
    category: "sales_other",
    category_label: "Sales taken outside invoices",
    amount_pence: 12000,
    vat_pence: 2000,
    ...o,
  }) as EntryRow;

describe("profitAndLoss", () => {
  const sales = [
    sale(),
    sale({ kind: "credit_note", net_pence: -25000, tax_point: "2026-11-04" }),
    sale({ tax_point: "2026-12-01", net_pence: 50000 }),
  ];
  const bills = [
    bill(),
    bill({ status: "void", net_pence: 99999 }),
    bill({
      vat_reclaimable: false,
      category_label: "Entertainment",
      net_pence: 1000,
      gross_pence: 1200,
      vat_pence: 200,
    }),
  ];
  const entries = [
    entry(),
    entry({
      direction: "out",
      category: "wages",
      category_label: "Wages and salaries",
      amount_pence: 30000,
      vat_pence: 0,
    }),
    entry({
      direction: "out",
      category: "tax_vat",
      category_label: "VAT paid to HMRC",
      amount_pence: 5000,
      vat_pence: 0,
    }),
    entry({
      direction: "in",
      category: "loan_received",
      category_label: "Loan received",
      amount_pence: 200000,
      vat_pence: 0,
    }),
    entry({ state: "planned", amount_pence: 77777 }),
  ];
  const p = profitAndLoss(sales, bills, entries);

  it("adds income net of VAT, takes credit notes off, and counts wages as a cost", () => {
    expect(p.incomeTotal).toBe(135000);
    expect(p.costsTotal).toBe(71200);
    expect(p.profit).toBe(63800);
  });
  it("counts VAT that cannot be reclaimed as a cost and leaves voided and planned rows out", () => {
    expect(p.costs.find((l) => l.label === "Entertainment")?.pence).toBe(1200);
    expect(p.incomeTotal).toBe(135000);
  });
  it("keeps VAT payments and loans out of profit, and lists them apart", () => {
    expect(p.excluded.find((l) => l.label === "VAT paid to HMRC")?.pence).toBe(
      -5000,
    );
    expect(p.excluded.find((l) => l.label === "Loan received")?.pence).toBe(
      200000,
    );
    expect(p.income.some((l) => l.label === "Loan received")).toBe(false);
  });
  it("groups by month", () => {
    expect(p.months.map((m) => m.month)).toEqual(["2026-11", "2026-12"]);
  });
});

describe("salesByChannel", () => {
  it("gives invoices their order's channel and counts sales outside invoices on their own channel", () => {
    const rows = salesByChannel(
      [
        { ...sale({ net_pence: 100000 }), id: "a" },
        { ...sale({ net_pence: 40000 }), id: "b" },
        { ...sale({ net_pence: 10000 }), id: "zz" },
      ],
      [
        { ...entry(), channel: "facebook" },
        { ...entry({ amount_pence: 6000, vat_pence: 1000 }), channel: null },
      ],
      new Map([
        ["a", "facebook"],
        ["b", "email"],
      ]),
      (s) => s.id,
      (e) => e.channel,
    );
    expect(rows.map((c) => [c.channel, c.total])).toEqual([
      ["facebook", 110000],
      ["email", 40000],
      ["not_stated", 15000],
    ]);
  });
});

describe("cashForecast", () => {
  const expected: Expected[] = [
    {
      date: "2026-11-01",
      direction: "out",
      pence: 5000,
      label: "Late bill",
      source: "bill",
    },
    {
      date: "2026-11-05",
      direction: "in",
      pence: 20000,
      label: "Balance",
      source: "balance",
    },
    {
      date: "2026-11-12",
      direction: "out",
      pence: 80000,
      label: "Rent",
      source: "planned",
    },
  ];
  it("puts overdue items in the first week and runs a balance from the opening figure", () => {
    const f = cashForecast(expected, "2026-11-04", 3, 10000);
    expect(f[0].overdue).toBe(true);
    expect(f[0].running).toBe(25000);
    expect(f[1].running).toBe(-55000);
  });
  it("shows no balance when none was given", () => {
    expect(cashForecast(expected, "2026-11-04", 2, null)[0].running).toBeNull();
  });
});
