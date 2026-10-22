import { describe, expect, it } from "vitest";
import { paymentProblem, summarisePayments } from "./orderPayments";

describe("summarisePayments", () => {
  it("counts deposit and balance as paid, and the balance is what is left", () => {
    const s = summarisePayments(50000, [
      { kind: "deposit", amount_pence: 10000 },
      { kind: "balance", amount_pence: 15000 },
    ]);
    expect(s).toEqual({
      paid_pence: 25000,
      balance_pence: 25000,
      security_held_pence: 0,
    });
  });

  it("keeps a security deposit out of payment and nets off refunds", () => {
    const s = summarisePayments(50000, [
      { kind: "security_deposit", amount_pence: 20000 },
      { kind: "security_refund", amount_pence: 5000 },
    ]);
    expect(s.paid_pence).toBe(0);
    expect(s.balance_pence).toBe(50000);
    expect(s.security_held_pence).toBe(15000);
  });

  it("is simple cash on delivery when nothing has been paid yet", () => {
    expect(summarisePayments(80000, [])).toEqual({
      paid_pence: 0,
      balance_pence: 80000,
      security_held_pence: 0,
    });
  });
});

describe("paymentProblem", () => {
  const summary = { balance_pence: 25000, security_held_pence: 15000 };

  it("needs an amount above zero", () => {
    expect(paymentProblem("balance", null, summary)).not.toBeNull();
    expect(paymentProblem("balance", 0, summary)).not.toBeNull();
  });

  it("will not take more than the balance for the goods", () => {
    expect(paymentProblem("balance", 25001, summary)).toMatch(/balance/);
    expect(paymentProblem("balance", 25000, summary)).toBeNull();
    expect(paymentProblem("deposit", 26000, summary)).toMatch(/balance/);
  });

  it("will not refund more than the security deposit held", () => {
    expect(paymentProblem("security_refund", 15001, summary)).toMatch(
      /security/,
    );
    expect(paymentProblem("security_refund", 15000, summary)).toBeNull();
  });

  it("allows a new security deposit whatever the balance", () => {
    expect(paymentProblem("security_deposit", 30000, summary)).toBeNull();
  });
});
