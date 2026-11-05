import { describe, expect, it } from "vitest";

import {
  addDays,
  balanceAgeDays,
  buildForecast,
  type ForecastInput,
} from "./forecast";

const TODAY = "2026-11-05";
const base = (over: Partial<ForecastInput> = {}): ForecastInput => ({
  openingPence: 100000,
  today: TODAY,
  days: 30,
  planned: [],
  bills: [],
  owed: [],
  lateCustomerDays: 14,
  ...over,
});

describe("buildForecast", () => {
  it("is flat with nothing coming up", () => {
    const f = buildForecast(base());
    expect(f.days).toHaveLength(31);
    expect(f.endBalance).toBe(100000);
    expect(f.lowest.balance).toBe(100000);
    expect(f.firstBelowZero).toBeNull();
  });

  it("moves the balance on the day money moves, and finds the lowest point", () => {
    const f = buildForecast(
      base({
        bills: [
          {
            supplier_name: "Wax Co",
            bill_date: "2026-11-01",
            due_date: "2026-11-10",
            gross_pence: 70000,
            description: "Wax",
          },
        ],
        planned: [
          {
            entry_date: "2026-11-12",
            direction: "out",
            amount_pence: 50000,
            counterparty: "Landlord",
            note: "Rent",
          },
          {
            entry_date: "2026-11-20",
            direction: "in",
            amount_pence: 200000,
            counterparty: null,
            note: "Retainer",
          },
        ],
      }),
    );
    const on = (d: string) => f.days.find((x) => x.date === d)!.balance;
    expect(on("2026-11-09")).toBe(100000);
    expect(on("2026-11-10")).toBe(30000);
    expect(on("2026-11-12")).toBe(-20000);
    expect(on("2026-11-20")).toBe(180000);
    expect(f.lowest).toEqual({ date: "2026-11-12", balance: -20000 });
    expect(f.firstBelowZero).toBe("2026-11-12");
    expect(f.totalIn).toBe(200000);
    expect(f.totalOut).toBe(120000);
  });

  it("counts a late bill today and a bill with no due date on its bill date", () => {
    const f = buildForecast(
      base({
        bills: [
          {
            supplier_name: "A",
            bill_date: "2026-10-01",
            due_date: "2026-10-15",
            gross_pence: 1000,
            description: "late",
          },
          {
            supplier_name: "B",
            bill_date: "2026-11-08",
            due_date: null,
            gross_pence: 2000,
            description: "no date",
          },
        ],
      }),
    );
    expect(f.flows[0]).toMatchObject({ date: TODAY, pence: -1000, late: true });
    expect(f.flows[1]).toMatchObject({ date: "2026-11-08", pence: -2000 });
  });

  it("brings late customers in after the chosen delay, or leaves them out and says how much", () => {
    const owed = [
      {
        customer_name: "Café",
        order_reference: "HH-1",
        due_date: "2026-10-30",
        owed_pence: 48000,
      },
      {
        customer_name: "Barn",
        order_reference: null,
        due_date: "2026-11-14",
        owed_pence: 66000,
      },
      {
        customer_name: "Shop",
        order_reference: "HH-3",
        due_date: null,
        owed_pence: 10000,
      },
    ];
    const counted = buildForecast(base({ owed }));
    expect(counted.flows.map((x) => [x.date, x.pence])).toEqual(
      [
        ["2026-11-14", 66000],
        ["2026-11-19", 10000],
        ["2026-11-19", 48000],
      ].sort(
        (a, b) =>
          (a[0] as string).localeCompare(b[0] as string) ||
          (b[1] as number) - (a[1] as number),
      ),
    );
    const left = buildForecast(base({ owed, lateCustomerDays: null }));
    expect(left.leftOutPence).toBe(48000);
    expect(left.totalIn).toBe(76000);
  });

  it("treats a planned entry dated in the past as due today, and ignores anything past the window", () => {
    const f = buildForecast(
      base({
        days: 10,
        planned: [
          {
            entry_date: "2026-11-01",
            direction: "out",
            amount_pence: 500,
            counterparty: null,
            note: "Overdue plan",
          },
          {
            entry_date: "2026-12-25",
            direction: "out",
            amount_pence: 999,
            counterparty: null,
            note: "Far away",
          },
        ],
      }),
    );
    expect(f.flows).toHaveLength(1);
    expect(f.flows[0]).toMatchObject({ date: TODAY, late: true });
  });
});

describe("dates", () => {
  it("adds days across a month and year end", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
  it("gives the age of a balance", () => {
    expect(balanceAgeDays("2026-11-01", TODAY)).toBe(4);
  });
});
