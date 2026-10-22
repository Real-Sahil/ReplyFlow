// Pricing for a quote. Money is whole pence throughout; each step rounds to the penny,
// so the PDF and the saved totals always agree.

export type QuoteLine = {
  description: string;
  quantity: number;
  unit_price_pence: number;
};

export type QuoteTotals = {
  subtotal_pence: number;
  discount_pence: number;
  net_pence: number;
  vat_pence: number;
  total_pence: number;
};

const roundPence = (value: number) => Math.round(value);

// Discount comes off the subtotal, then VAT is charged on what remains.
export const quoteTotals = (
  lines: QuoteLine[],
  discountPercent: number,
  vatPercent: number,
): QuoteTotals => {
  const subtotal_pence = lines.reduce(
    (sum, line) => sum + roundPence(line.quantity * line.unit_price_pence),
    0,
  );
  const discount_pence = roundPence((subtotal_pence * discountPercent) / 100);
  const net_pence = subtotal_pence - discount_pence;
  const vat_pence = roundPence((net_pence * vatPercent) / 100);
  return {
    subtotal_pence,
    discount_pence,
    net_pence,
    vat_pence,
    total_pence: net_pence + vat_pence,
  };
};

// Pounds typed by a person to pence. Returns null for anything that is not a
// positive money amount with at most two decimals.
export const poundsToPence = (text: string): number | null => {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return roundPence(Number(trimmed) * 100);
};

export const formatPence = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    pence / 100,
  );
