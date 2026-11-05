import { describe, expect, it } from "vitest";

import {
  costMix,
  fillMonths,
  observations,
  rangeFor,
  topCustomers,
  type MonthRow,
} from "./insights";

const month = (m: string, income: number, costs: number): MonthRow => ({
  month: m,
  income,
  costs,
  profit: income - costs,
});

describe("topCustomers", () => {
  it("adds up sales per customer, nets credit notes, drops anyone at or below zero, largest first", () => {
    const rows = [
      { customer_name: "Café", net_pence: 50000 },
      { customer_name: "Café", net_pence: -10000 },
      { customer_name: "Barn", net_pence: 60000 },
      { customer_name: "Refunded", net_pence: -500 },
      { customer_name: null, net_pence: 2000 },
    ];
    expect(topCustomers(rows)).toEqual([
      { name: "Barn", pence: 60000 },
      { name: "Café", pence: 40000 },
      { name: "Not named", pence: 2000 },
    ]);
    expect(topCustomers(rows, 1)).toHaveLength(1);
  });
});

describe("costMix", () => {
  it("keeps the largest and groups the rest", () => {
    const costs = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
      label: `C${n}`,
      pence: n * 100,
    }));
    const mix = costMix(costs, 3);
    expect(mix.map((c) => c.label)).toEqual([
      "C8",
      "C7",
      "C6",
      "Everything else",
    ]);
    expect(mix[3].pence).toBe((1 + 2 + 3 + 4 + 5) * 100);
  });
  it("leaves a short list alone and ignores credits", () => {
    expect(
      costMix([
        { label: "A", pence: 5 },
        { label: "B", pence: -5 },
      ]),
    ).toEqual([{ label: "A", pence: 5 }]);
  });
});

describe("fillMonths", () => {
  it("fills months with nothing, across a year end", () => {
    const filled = fillMonths(
      [month("2026-11", 100, 50)],
      "2026-10",
      "2027-01",
    );
    expect(filled.map((m) => m.month)).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
    expect(filled[0].income).toBe(0);
    expect(filled[1].income).toBe(100);
  });
});

describe("rangeFor", () => {
  it("gives the first and last month for each choice", () => {
    const today = new Date(2026, 10, 5);
    expect(rangeFor("12", today)).toEqual({
      fromMonth: "2025-12",
      toMonth: "2026-11",
      fromDate: "2025-12-01",
    });
    expect(rangeFor("6", today).fromMonth).toBe("2026-06");
    expect(rangeFor("year", today).fromMonth).toBe("2026-01");
  });
});

describe("observations", () => {
  const months = [
    month("2026-05", 100000, 60000),
    month("2026-06", 100000, 60000),
    month("2026-07", 100000, 60000),
    month("2026-08", 150000, 90000),
    month("2026-09", 150000, 90000),
    month("2026-10", 150000, 190000),
  ];
  it("says what stands out, and only what the figures support", () => {
    const out = observations({
      months,
      costs: [
        { label: "Stock", pence: 400000 },
        { label: "Rent", pence: 100000 },
      ],
      customers: [{ name: "The Barn", pence: 300000 }],
      incomeTotal: 800000,
      latePence: 50000,
      owedPence: 200000,
    });
    expect(out).toContain(
      "Income over the last three months is 50% higher than the three months before.",
    );
    expect(
      out.some((s) => s.startsWith("Costs over the last three months are")),
    ).toBe(true);
    expect(out.some((s) => s.includes("1 month made a loss: October"))).toBe(
      true,
    );
    expect(out.some((s) => s.includes("The Barn is 38% of your income"))).toBe(
      true,
    );
    expect(
      out.some((s) => s.includes("Stock is your largest cost, at 80%")),
    ).toBe(true);
    expect(out.some((s) => s.includes("is late (25%)"))).toBe(true);
  });
  it("says nothing when nothing stands out", () => {
    const flat = [
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ].map((m) => month(m, 100000, 80000));
    expect(
      observations({
        months: flat,
        costs: [
          { label: "A", pence: 10 },
          { label: "B", pence: 10 },
          { label: "C", pence: 10 },
          { label: "D", pence: 10 },
          { label: "E", pence: 10 },
        ],
        customers: [
          { name: "X", pence: 10 },
          { name: "Y", pence: 10 },
        ],
        incomeTotal: 600000,
        latePence: 0,
        owedPence: 0,
      }).filter((s) => !s.includes("most profitable")),
    ).toEqual([]);
  });
});
