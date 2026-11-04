// Turning low stock into a shopping list grouped by supplier. Pure functions, so each rule can be
// tested. A list is a suggestion: nothing is ordered, and the message is copied to send.

import type { StockLevel } from "./stockTypes";

export type SupplierInfo = {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  terms: string | null;
  active: boolean;
};

export type ItemExtras = {
  id: number;
  supplier_id: number | null;
  reorder_quantity: number | null;
};

export type ShoppingLine = {
  item_id: number;
  name: string;
  unit: string;
  on_hand: number;
  reorder_level: number;
  quantity: number;
  estimated_pence: number | null;
};

export type ShoppingGroup = {
  supplier: SupplierInfo | null; // null: no supplier set yet
  lines: ShoppingLine[];
  estimated_pence: number | null;
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

// How much to buy: the quantity set on the item, or enough to get back to twice the warning level.
export const quantityToBuy = (
  onHand: number,
  reorderLevel: number,
  reorderQuantity: number | null,
): number => {
  if (reorderQuantity && reorderQuantity > 0) return reorderQuantity;
  const target = Math.max(reorderLevel * 2, 1);
  return Math.max(round3(target - onHand), 1);
};

export const shoppingList = (
  levels: StockLevel[],
  extras: ItemExtras[],
  suppliers: SupplierInfo[],
): ShoppingGroup[] => {
  const extra = new Map(extras.map((e) => [e.id, e]));
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const groups = new Map<number | null, ShoppingGroup>();

  for (const level of levels) {
    if (
      !level.active ||
      level.reorder_level === null ||
      Number(level.on_hand) > Number(level.reorder_level)
    )
      continue;
    const e = extra.get(level.id);
    const quantity = quantityToBuy(
      Number(level.on_hand),
      Number(level.reorder_level),
      e?.reorder_quantity ?? null,
    );
    const cost = Number(level.average_cost_pence);
    const line: ShoppingLine = {
      item_id: level.id,
      name: level.name,
      unit: level.unit,
      on_hand: Number(level.on_hand),
      reorder_level: Number(level.reorder_level),
      quantity,
      estimated_pence: cost > 0 ? Math.round(quantity * cost) : null,
    };
    // An item whose supplier has been archived goes under "no supplier" rather than disappearing.
    const supplier =
      e?.supplier_id != null ? (supplierById.get(e.supplier_id) ?? null) : null;
    const key = supplier ? supplier.id : null;
    const group = groups.get(key) ?? {
      supplier,
      lines: [],
      estimated_pence: null,
    };
    group.lines.push(line);
    groups.set(key, group);
  }

  const result = [...groups.values()];
  for (const g of result) {
    g.lines.sort((a, b) => a.name.localeCompare(b.name));
    const priced = g.lines.filter((l) => l.estimated_pence !== null);
    g.estimated_pence = priced.length
      ? priced.reduce((sum, l) => sum + (l.estimated_pence ?? 0), 0)
      : null;
  }
  // Suppliers by name, with the items that have none set last.
  return result.sort((a, b) =>
    a.supplier && b.supplier
      ? a.supplier.name.localeCompare(b.supplier.name)
      : a.supplier
        ? -1
        : b.supplier
          ? 1
          : 0,
  );
};

const qtyText = (n: number) =>
  Number(n).toLocaleString("en-GB", { maximumFractionDigits: 3 });

// A short message to copy into an email, text or Messenger to the supplier.
export const orderMessage = (
  group: ShoppingGroup,
  businessName: string | null,
): string => {
  const who = group.supplier?.contact_name?.trim().split(/\s+/)[0];
  const lines = group.lines
    .map((l) => `- ${qtyText(l.quantity)} ${l.unit} of ${l.name}`)
    .join("\n");
  const sign = businessName?.trim() ? `\n${businessName.trim()}` : "";
  return `Hi${who ? ` ${who}` : ""}, could I order the following, please?\n\n${lines}\n\nPlease confirm the price and when you can deliver.\n\nThanks,${sign}`.trim();
};
