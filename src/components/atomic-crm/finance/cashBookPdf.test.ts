import { describe, expect, it } from "vitest";
import { summarise, type CashRow } from "./cashBookPdf";

const row = (o: Partial<CashRow> = {}): CashRow => ({
  source: "entry",
  source_id: 1,
  entry_date: "2026-11-05",
  direction: "out",
  category_group: "People",
  category_label: "Wages and salaries",
  state: "done",
  amount_pence: 90000,
  counterparty: null,
  payment_method: null,
  reference: null,
  channel: null,
  order_reference: null,
  order_summary: null,
  order_note: null,
  regulated: true,
  receipt_path: null,
  note: "Pay",
  void_reason: null,
  vat_pence: 0,
  ...o,
});

describe("summarise", () => {
  it("totals what happened, separates what is planned, and leaves voided rows out", () => {
    const s = summarise([
      row({
        direction: "in",
        amount_pence: 12000,
        channel: "facebook",
        category_group: "Money in",
        category_label: "Sales",
        regulated: false,
      }),
      row(),
      row({ state: "planned", direction: "in", amount_pence: 500 }),
      row({ state: "void" }),
    ]);
    expect(s.inDone).toBe(12000);
    expect(s.outDone).toBe(90000);
    expect(s.inPlanned).toBe(500);
    expect(s.voided).toBe(1);
    expect(s.byChannel).toEqual([{ label: "Facebook", pence: 12000 }]);
    expect(s.regulated).toEqual([
      { label: "Wages and salaries", pence: 90000 },
    ]);
  });
});
