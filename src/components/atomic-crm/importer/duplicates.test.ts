import { describe, expect, it } from "vitest";

import { billDuplicate, moneyDuplicate } from "./duplicates";
import type { BillRow, MoneyRow } from "./specs";

const money = (over: Partial<MoneyRow> = {}): MoneyRow => ({
  direction: "out",
  category: "rent",
  status: "done",
  entry_date: "2026-11-04",
  amount_pence: 85000,
  counterparty: "Reading Lettings",
  payment_method: null,
  reference: null,
  note: "Rent",
  ...over,
});

const bill = (over: Partial<BillRow> = {}): BillRow => ({
  supplier_name: "Screwfix",
  reference: "INV-1",
  bill_date: "2026-11-04",
  due_date: null,
  category: "materials",
  description: "Paint",
  vat_code: "S",
  net_pence: 10000,
  vat_pence: 2000,
  vat_reclaimable: true,
  paid_date: null,
  payment_method: null,
  ...over,
});

describe("moneyDuplicate", () => {
  const existing = [
    {
      entry_date: "2026-11-04",
      amount_pence: 85000,
      direction: "out",
      counterparty: "Reading Lettings",
    },
  ];
  it("finds the same day, direction, amount and person", () => {
    expect(moneyDuplicate(existing, money())).toMatch(
      /already in the money book/,
    );
    expect(
      moneyDuplicate(existing, money({ counterparty: "reading lettings" })),
    ).not.toBeNull();
  });
  it("treats a row with nobody named as a match on the rest", () => {
    expect(
      moneyDuplicate(existing, money({ counterparty: null })),
    ).not.toBeNull();
  });
  it("does not match a different day, amount, direction or person", () => {
    expect(
      moneyDuplicate(existing, money({ entry_date: "2026-11-05" })),
    ).toBeNull();
    expect(moneyDuplicate(existing, money({ amount_pence: 85001 }))).toBeNull();
    expect(moneyDuplicate(existing, money({ direction: "in" }))).toBeNull();
    expect(
      moneyDuplicate(existing, money({ counterparty: "Someone Else" })),
    ).toBeNull();
  });
});

describe("billDuplicate", () => {
  const existing = [
    {
      supplier_name: "Screwfix",
      reference: "INV-1",
      bill_date: "2026-11-01",
      net_pence: 5000,
      vat_pence: 1000,
    },
  ];
  it("finds the same supplier and invoice number whatever the amount", () => {
    expect(billDuplicate(existing, bill())).toMatch(
      /invoice INV-1 is already recorded/,
    );
    expect(
      billDuplicate(existing, bill({ supplier_name: "SCREWFIX " })),
    ).not.toBeNull();
  });
  it("finds the same supplier and amount within three days when there is no invoice number", () => {
    const row = bill({
      reference: null,
      net_pence: 5000,
      vat_pence: 1000,
      bill_date: "2026-11-03",
    });
    expect(billDuplicate(existing, row)).toMatch(/already recorded/);
    expect(
      billDuplicate(existing, { ...row, bill_date: "2026-11-05" }),
    ).toBeNull();
  });
  it("does not match another supplier", () => {
    expect(
      billDuplicate(existing, bill({ supplier_name: "Toolstation" })),
    ).toBeNull();
  });
});
