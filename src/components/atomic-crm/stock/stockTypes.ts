export type StockLevel = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  reorder_level: number | null;
  notes: string | null;
  active: boolean;
  on_hand: number;
  average_cost_pence: number;
  last_moved_on: string | null;
};

export type StockMovement = {
  id: number;
  item_id: number;
  kind: "purchase" | "use" | "adjustment" | "waste";
  quantity_delta: number;
  unit_cost_pence: number;
  moved_on: string;
  order_id: number | null;
  bill_id: number | null;
  note: string;
  voided_at: string | null;
  void_reason: string | null;
};

export const STOCK_KEY = ["stock"];

export const KIND_LABEL: Record<StockMovement["kind"], string> = {
  purchase: "Bought",
  use: "Used in production",
  waste: "Wasted or damaged",
  adjustment: "Count correction",
};

// The value of what is held, at the average price paid.
export const valueOf = (level: StockLevel) =>
  Math.round(Number(level.on_hand) * Number(level.average_cost_pence));

export const isLow = (level: StockLevel) =>
  level.reorder_level !== null &&
  level.active &&
  Number(level.on_hand) <= Number(level.reorder_level);

// Quantities are shown without trailing zeros: 20, 2.5, 0.125.
export const qty = (value: number) =>
  Number(value).toLocaleString("en-GB", { maximumFractionDigits: 3 });
