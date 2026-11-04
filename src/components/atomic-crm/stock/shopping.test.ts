import { describe, expect, it } from "vitest";

import { orderMessage, quantityToBuy, shoppingList } from "./shopping";
import type { StockLevel } from "./stockTypes";

const level = (
  id: number,
  name: string,
  on_hand: number,
  reorder_level: number | null,
  extra: Partial<StockLevel> = {},
): StockLevel => ({
  id,
  name,
  sku: null,
  unit: "each",
  reorder_level,
  notes: null,
  active: true,
  on_hand,
  average_cost_pence: 0,
  last_moved_on: null,
  ...extra,
});

const supplier = (id: number, name: string, contact: string | null = null) => ({
  id,
  name,
  contact_name: contact,
  phone: null,
  email: null,
  terms: null,
  active: true,
});

describe("quantityToBuy", () => {
  it("uses the quantity set on the item", () =>
    expect(quantityToBuy(1, 5, 20)).toBe(20));
  it("otherwise buys back up to twice the warning level", () => {
    expect(quantityToBuy(2, 5, null)).toBe(8);
    expect(quantityToBuy(0, 5, null)).toBe(10);
  });
  it("always buys at least one", () =>
    expect(quantityToBuy(0, 0, null)).toBe(1));
});

describe("shoppingList", () => {
  const levels = [
    level(1, "Oak boards", 2, 5, { average_cost_pence: 1500, unit: "m" }),
    level(2, "Screws", 100, 50),
    level(3, "Glue", 1, 2),
    level(4, "Old stock", 0, 3, { active: false }),
    level(5, "No alert set", 0, null),
  ];
  const extras = [
    { id: 1, supplier_id: 10, reorder_quantity: 10 },
    { id: 3, supplier_id: null, reorder_quantity: null },
  ];
  const groups = shoppingList(levels, extras, [
    supplier(10, "Timber Co", "Sam Hill"),
  ]);

  it("lists only active items at or below their warning level", () => {
    const names = groups.flatMap((g) => g.lines.map((l) => l.name));
    expect(names).toEqual(["Oak boards", "Glue"]);
  });
  it("groups by supplier, with items that have none last", () => {
    expect(groups.map((g) => g.supplier?.name ?? null)).toEqual([
      "Timber Co",
      null,
    ]);
  });
  it("estimates the cost from the average price paid, where there is one", () => {
    expect(groups[0].lines[0].estimated_pence).toBe(15000);
    expect(groups[0].estimated_pence).toBe(15000);
    expect(groups[1].estimated_pence).toBeNull();
  });
  it("puts an item whose supplier is gone under no supplier", () => {
    const g = shoppingList(
      [level(1, "Oak", 0, 2)],
      [{ id: 1, supplier_id: 99, reorder_quantity: null }],
      [],
    );
    expect(g[0].supplier).toBeNull();
  });
});

describe("orderMessage", () => {
  it("asks politely for each item with its quantity and unit", () => {
    const [g] = shoppingList(
      [level(1, "Oak boards", 2, 5, { unit: "m" })],
      [{ id: 1, supplier_id: 10, reorder_quantity: 10 }],
      [supplier(10, "Timber Co", "Sam Hill")],
    );
    const text = orderMessage(g, "Mere & Row");
    expect(text).toContain("Hi Sam");
    expect(text).toContain("- 10 m of Oak boards");
    expect(text).toMatch(/Mere & Row$/);
  });
});
