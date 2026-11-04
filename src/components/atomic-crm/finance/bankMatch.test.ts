import { describe, expect, it } from "vitest";

import {
  parseBankAmount,
  parseBankCsv,
  parseBankDate,
  suggestAll,
} from "./bankMatch";

describe("parseBankDate", () => {
  it("reads UK day-first dates and ISO dates", () => {
    expect(parseBankDate("04/11/2026")).toBe("2026-11-04");
    expect(parseBankDate("4-11-26")).toBe("2026-11-04");
    expect(parseBankDate("2026-11-04")).toBe("2026-11-04");
    expect(parseBankDate("4 Nov 2026")).toBe("2026-11-04");
    expect(parseBankDate("04-Nov-26")).toBe("2026-11-04");
  });
  it("refuses impossible dates", () => {
    expect(parseBankDate("31/02/2026")).toBeNull();
    expect(parseBankDate("hello")).toBeNull();
  });
});

describe("parseBankAmount", () => {
  it("keeps the sign and counts in pence", () => {
    expect(parseBankAmount("£1,234.50")).toBe(123450);
    expect(parseBankAmount("-12.00")).toBe(-1200);
    expect(parseBankAmount("(12.00)")).toBe(-1200);
    expect(parseBankAmount("12.00 DR")).toBe(-1200);
    expect(parseBankAmount("12.00 CR")).toBe(1200);
    expect(parseBankAmount("")).toBeNull();
    expect(parseBankAmount("abc")).toBeNull();
  });
});

describe("parseBankCsv", () => {
  it("reads one signed amount column", () => {
    const r = parseBankCsv(
      "Date,Description,Amount,Balance\n04/11/2026,ANNA WHITFIELD FASTER PAYMENT,480.00,1500.00\n03/11/2026,TIMBER SUPPLIER LTD,-212.40,1020.00\n",
    );
    expect(r.problem).toBeNull();
    expect(r.rows.map((x) => x.amount_pence)).toEqual([48000, -21240]);
    expect(r.rows[0].line_date).toBe("2026-11-04");
  });
  it("reads separate paid in and paid out columns", () => {
    const r = parseBankCsv(
      "Date,Details,Paid out,Paid in\n04 Nov 2026,Courier,9.50,\n05 Nov 2026,Web sale,,120.00\n",
    );
    expect(r.rows.map((x) => x.amount_pence)).toEqual([-950, 12000]);
  });
  it("skips a heading block above the table and rows it cannot read", () => {
    const r = parseBankCsv(
      "Account,12345678\nPeriod,Nov\n\nDate,Memo,Amount\n04/11/2026,Rent,-500.00\nnot a date,Broken,5.00\n",
    );
    expect(r.rows).toHaveLength(1);
    expect(r.skipped).toBe(1);
  });
  it("numbers identical lines so both are kept", () => {
    const r = parseBankCsv(
      "Date,Description,Amount\n04/11/2026,COFFEE,-3.00\n04/11/2026,COFFEE,-3.00\n",
    );
    expect(r.rows).toHaveLength(2);
    expect(new Set(r.rows.map((x) => x.line_hash)).size).toBe(2);
  });
  it("explains a file that is not a statement", () => {
    expect(parseBankCsv("hello,world\n1,2\n").problem).toMatch(/heading row/);
  });
});

const owed = (id: number, name: string, pence: number) => ({
  order_id: id,
  order_reference: `R${id}`,
  contact_id: null,
  customer_name: name,
  invoiced_pence: pence,
  paid_pence: 0,
  owed_pence: pence,
  due_date: null,
  latest_invoice_number: `INV-${id}`,
});
const bill = (id: number, name: string, pence: number) => ({
  id,
  supplier_name: name,
  reference: null,
  description: null,
  bill_date: "2026-10-01",
  due_date: null,
  owed_pence: pence,
  order_id: null,
});

describe("suggestAll", () => {
  it("matches money in to an invoice owed for that exact amount", () => {
    const s = suggestAll(
      [{ id: 1, amount_pence: 48000, description: "ANNA WHITFIELD" }],
      [owed(10, "Anna Whitfield", 48000), owed(11, "Marcus Bell", 9000)],
      [],
    );
    expect(s.get(1)).toMatchObject({
      kind: "customer",
      order_id: 10,
      strong: true,
    });
  });
  it("matches money out to an unpaid bill and uses the name to break a tie", () => {
    const s = suggestAll(
      [{ id: 1, amount_pence: -21240, description: "TIMBER SUPPLIER LTD" }],
      [],
      [bill(5, "Fabric House", 21240), bill(6, "Timber Supplier", 21240)],
    );
    expect(s.get(1)).toMatchObject({ kind: "bill", bill_id: 6 });
  });
  it("suggests each invoice or bill to one line only", () => {
    const s = suggestAll(
      [
        { id: 1, amount_pence: 5000, description: "PAYMENT A" },
        { id: 2, amount_pence: 5000, description: "PAYMENT B" },
      ],
      [owed(10, "Anna", 5000)],
      [],
    );
    expect([...s.values()].filter((x) => x.kind === "customer")).toHaveLength(
      1,
    );
  });
  it("suggests nothing when no amount matches", () => {
    expect(
      suggestAll(
        [{ id: 1, amount_pence: 777, description: "x" }],
        [owed(1, "A", 100)],
        [bill(1, "B", 100)],
      ).size,
    ).toBe(0);
  });
});
