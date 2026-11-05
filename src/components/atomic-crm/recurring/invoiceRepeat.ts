// Repeating invoices. The database keeps a copy of the lines and adds a DRAFT a week before each date; an
// administrator confirms it (which issues a real invoice by the usual rules) or dismisses it.

import type { Frequency } from "./recurring";

export type RepeatLine = {
  description: string;
  quantity: number | string;
  unit_amount_pence: number;
  vat_code: string;
};

export type RecurringInvoice = {
  id: number;
  source_invoice_id: number;
  order_id: number;
  frequency: Frequency;
  next_date: string;
  end_date: string | null;
  due_days: number;
  note: string | null;
  lines: RepeatLine[];
  active: boolean;
  recurring_item_id: number | null;
  last_generated_on: string | null;
};

export type InvoiceDraft = {
  id: number;
  recurring_id: number;
  order_id: number;
  issue_date: string;
  due_date: string;
  note: string | null;
  lines: RepeatLine[];
  status: "draft" | "issued" | "dismissed";
  invoice_id: number | null;
};

export const lineAmountPence = (
  l: Pick<RepeatLine, "quantity" | "unit_amount_pence">,
) => Math.round(Number(l.quantity || 0) * l.unit_amount_pence);

// The lines as the database wants them (numbers, trimmed text), dropping any that were emptied.
export const cleanLines = (lines: RepeatLine[]): RepeatLine[] =>
  lines
    .map((l) => ({
      description: l.description.trim(),
      quantity: Number(l.quantity),
      unit_amount_pence: Math.round(l.unit_amount_pence),
      vat_code: l.vat_code,
    }))
    .filter((l) => l.description !== "");

export const linesValid = (lines: RepeatLine[]): boolean => {
  const clean = cleanLines(lines);
  return (
    clean.length > 0 &&
    clean.every(
      (l) =>
        Number.isFinite(Number(l.quantity)) &&
        Number(l.quantity) > 0 &&
        Number.isFinite(l.unit_amount_pence) &&
        l.unit_amount_pence >= 0,
    )
  );
};
