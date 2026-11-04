import { describe, expect, it } from "vitest";

import {
  byAttention,
  owedToStaff,
  parsePounds,
  waiting,
  waitingTotal,
  type Claim,
} from "./claims";

const claim = (over: Partial<Claim>): Claim => ({
  id: 1,
  claimant_id: 1,
  claim_date: "2026-11-01",
  amount_pence: 1000,
  category: "other_out",
  description: "x",
  receipt_path: null,
  status: "pending",
  decision_note: null,
  decided_at: null,
  paid_at: null,
  created_at: "2026-11-01T10:00:00Z",
  ...over,
});

describe("parsePounds", () => {
  it("reads common ways of typing an amount", () => {
    expect(parsePounds("12.50")).toBe(1250);
    expect(parsePounds("£12.5")).toBe(1250);
    expect(parsePounds("1,250")).toBe(125000);
    expect(parsePounds("7")).toBe(700);
  });
  it("refuses nonsense, zero and amounts over £5,000", () => {
    expect(parsePounds("")).toBeNull();
    expect(parsePounds("abc")).toBeNull();
    expect(parsePounds("0")).toBeNull();
    expect(parsePounds("-5")).toBeNull();
    expect(parsePounds("12.345")).toBeNull();
    expect(parsePounds("5000.01")).toBeNull();
    expect(parsePounds("5000")).toBe(500000);
  });
});

describe("totals", () => {
  const all = [
    claim({ id: 1, amount_pence: 1000, status: "pending" }),
    claim({ id: 2, amount_pence: 2500, status: "approved" }),
    claim({ id: 3, amount_pence: 400, status: "paid" }),
    claim({ id: 4, amount_pence: 900, status: "rejected" }),
    claim({ id: 5, amount_pence: 100, status: "pending" }),
  ];
  it("counts only what is waiting or owed", () => {
    expect(waiting(all)).toHaveLength(2);
    expect(waitingTotal(all)).toBe(1100);
    expect(owedToStaff(all)).toBe(2500);
  });
});

describe("byAttention", () => {
  it("puts the oldest waiting claim first, then approved, then the newest of the rest", () => {
    const sorted = byAttention([
      claim({ id: 1, status: "paid", created_at: "2026-11-03T00:00:00Z" }),
      claim({ id: 2, status: "pending", created_at: "2026-11-02T00:00:00Z" }),
      claim({ id: 3, status: "pending", created_at: "2026-11-01T00:00:00Z" }),
      claim({ id: 4, status: "approved", created_at: "2026-10-30T00:00:00Z" }),
      claim({ id: 5, status: "rejected", created_at: "2026-11-04T00:00:00Z" }),
    ]).map((c) => c.id);
    expect(sorted).toEqual([3, 2, 4, 5, 1]);
  });
});
