import { describe, expect, it } from "vitest";

import {
  ageing,
  bucketOf,
  buildStatement,
  statementMessage,
  type StatementLine,
} from "./statement";

const TODAY = "2026-11-05";
let id = 0;
const line = (over: Partial<StatementLine>): StatementLine => ({
  contact_id: 1,
  line_date: "2026-10-01",
  kind: "invoice",
  reference: "INV-1",
  order_reference: "HH-1",
  due_date: "2026-10-15",
  debit_pence: 0,
  credit_pence: 0,
  sort_order: 1,
  source_id: ++id,
  ...over,
});
const invoice = (ref: string, date: string, due: string, pence: number) =>
  line({
    reference: ref,
    line_date: date,
    due_date: due,
    debit_pence: pence,
    kind: "invoice",
    sort_order: 1,
  });
const payment = (date: string, pence: number) =>
  line({
    kind: "payment",
    reference: null,
    line_date: date,
    due_date: null,
    credit_pence: pence,
    sort_order: 3,
  });
const credit = (date: string, pence: number) =>
  line({
    kind: "credit_note",
    reference: "CN-1",
    line_date: date,
    due_date: null,
    credit_pence: pence,
    sort_order: 2,
  });

describe("buildStatement", () => {
  it("keeps a running balance, oldest first", () => {
    const s = buildStatement(
      [
        payment("2026-10-20", 3000),
        invoice("INV-2", "2026-10-10", "2026-10-24", 5000),
        invoice("INV-1", "2026-10-01", "2026-10-15", 10000),
      ],
      TODAY,
    );
    expect(
      s.rows.map((r) => [r.reference ?? "payment", r.balance_pence]),
    ).toEqual([
      ["INV-1", 10000],
      ["INV-2", 15000],
      ["payment", 12000],
    ]);
    expect(s.balancePence).toBe(12000);
  });

  it("puts the invoice before the payment on the same day", () => {
    const s = buildStatement(
      [
        payment("2026-10-01", 4000),
        invoice("INV-1", "2026-10-01", "2026-10-15", 4000),
      ],
      TODAY,
    );
    expect(s.rows.map((r) => r.kind)).toEqual(["invoice", "payment"]);
    expect(s.balancePence).toBe(0);
    expect(s.openInvoices).toHaveLength(0);
  });

  it("sets credits against the oldest invoice first and finds what is still open and late", () => {
    const s = buildStatement(
      [
        invoice("INV-1", "2026-09-01", "2026-09-15", 10000),
        invoice("INV-2", "2026-10-10", "2026-11-20", 8000),
        payment("2026-09-20", 6000),
        credit("2026-10-12", 1000),
      ],
      TODAY,
    );
    expect(s.balancePence).toBe(11000);
    expect(
      s.openInvoices.map((o) => [o.reference, o.open_pence, o.days_late]),
    ).toEqual([
      ["INV-1", 3000, 51],
      ["INV-2", 8000, 0],
    ]);
    expect(s.latePence).toBe(3000);
    expect(s.invoicedPence).toBe(18000);
    expect(s.paidAndCreditedPence).toBe(7000);
  });

  it("copes with a customer who has paid more than they were invoiced", () => {
    const s = buildStatement(
      [
        invoice("INV-1", "2026-10-01", "2026-10-15", 1000),
        payment("2026-10-05", 1500),
      ],
      TODAY,
    );
    expect(s.balancePence).toBe(-500);
    expect(s.openInvoices).toHaveLength(0);
  });
});

describe("ageing", () => {
  it("groups what is open by how late it is", () => {
    expect(bucketOf(0)).toBe("notDue");
    expect(bucketOf(1)).toBe("d1to30");
    expect(bucketOf(30)).toBe("d1to30");
    expect(bucketOf(31)).toBe("d31to60");
    expect(bucketOf(61)).toBe("d61plus");
    const open = [
      {
        reference: "a",
        order_reference: null,
        line_date: "x",
        due_date: null,
        open_pence: 100,
        days_late: 0,
      },
      {
        reference: "b",
        order_reference: null,
        line_date: "x",
        due_date: null,
        open_pence: 200,
        days_late: 10,
      },
      {
        reference: "c",
        order_reference: null,
        line_date: "x",
        due_date: null,
        open_pence: 400,
        days_late: 90,
      },
    ];
    expect(ageing(open)).toEqual({
      notDue: 100,
      d1to30: 200,
      d31to60: 0,
      d61plus: 400,
    });
  });
});

describe("statementMessage", () => {
  it("lists what is open, the total and what is overdue, and never mentions bank details", () => {
    const s = buildStatement(
      [invoice("INV-1", "2026-09-01", "2026-09-15", 10000)],
      TODAY,
    );
    const text = statementMessage({
      customer: "Wren Café",
      business: "Harbour & Hearth",
      statement: s,
      today: TODAY,
    });
    expect(text).toContain("INV-1 dated 01/09/2026: £100.00 (51 days late)");
    expect(text).toContain("Total outstanding: £100.00");
    expect(text).toContain("Of which overdue: £100.00");
    expect(text.toLowerCase()).not.toMatch(/sort code|account number|iban/);
  });
  it("says so when nothing is owed", () => {
    expect(
      statementMessage({
        customer: "A",
        business: "B",
        statement: buildStatement([], TODAY),
        today: TODAY,
      }),
    ).toContain("Nothing is outstanding");
  });
});
