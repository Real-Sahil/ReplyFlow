// Does a row in a sheet look like something already in the books? Pure functions, so the rules can be
// tested. These only ever warn: a row that looks like a repeat is left out unless the person says it
// is not one (two real £4.20 coffees on one day do happen).

import type { BillRow, MoneyRow } from "./specs";

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

const dayNumber = (iso: string) =>
  Math.round(new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime() / 86400000);

const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const pounds = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    pence / 100,
  );

// ---- Money book: the same day, the same direction and amount, and the same person (or nobody named).

export type ExistingMoney = {
  entry_date: string;
  amount_pence: number;
  direction: string;
  counterparty: string | null;
  note?: string | null;
};

export const moneyDuplicate = (
  existing: ExistingMoney[],
  row: MoneyRow,
): string | null => {
  const found = existing.find(
    (e) =>
      e.entry_date.slice(0, 10) === row.entry_date &&
      e.amount_pence === row.amount_pence &&
      e.direction === row.direction &&
      (!row.counterparty ||
        !e.counterparty ||
        same(e.counterparty, row.counterparty)),
  );
  return found
    ? `${pounds(row.amount_pence)} ${row.direction === "in" ? "in" : "out"} on ${shortDate(row.entry_date)} is already in the money book${found.counterparty ? ` (${found.counterparty})` : ""}.`
    : null;
};

// ---- Bills: the same supplier and invoice number, or the same supplier, amount and a date within three days.

export type ExistingBill = {
  supplier_name: string;
  reference: string | null;
  bill_date: string;
  net_pence: number;
  vat_pence: number;
};

export const billDuplicate = (
  existing: ExistingBill[],
  row: BillRow,
): string | null => {
  const found = existing.find((e) => {
    if (!same(e.supplier_name, row.supplier_name)) return false;
    if (row.reference && e.reference && same(e.reference, row.reference))
      return true;
    return (
      e.net_pence === row.net_pence &&
      e.vat_pence === row.vat_pence &&
      Math.abs(dayNumber(e.bill_date) - dayNumber(row.bill_date)) <= 3
    );
  });
  if (!found) return null;
  return row.reference && same(found.reference, row.reference)
    ? `${row.supplier_name} invoice ${row.reference} is already recorded.`
    : `${row.supplier_name} ${pounds(row.net_pence)} on ${shortDate(found.bill_date)} is already recorded.`;
};
