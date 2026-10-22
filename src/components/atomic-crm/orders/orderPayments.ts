// Payment rules for an order. Money is whole pence. Payments for the goods (a deposit or
// the balance) count towards what is paid. A security deposit is held against the order and
// is returned with a refund row, so it never counts as payment for the goods.

export type PaymentKind =
  | "deposit"
  | "balance"
  | "security_deposit"
  | "security_refund";
export type PaymentMethod = "cash" | "card" | "bank_transfer";

export type RecordedPayment = { kind: PaymentKind; amount_pence: number };

export const KIND_LABELS: Record<PaymentKind, string> = {
  deposit: "Deposit",
  balance: "Cash on delivery",
  security_deposit: "Security deposit received",
  security_refund: "Security deposit refunded",
};

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
};

export const summarisePayments = (
  agreedPence: number,
  payments: RecordedPayment[],
) => {
  const sum = (kinds: PaymentKind[]) =>
    payments
      .filter((p) => kinds.includes(p.kind))
      .reduce((total, p) => total + p.amount_pence, 0);
  const paid = sum(["deposit", "balance"]);
  return {
    paid_pence: paid,
    balance_pence: agreedPence - paid,
    security_held_pence: sum(["security_deposit"]) - sum(["security_refund"]),
  };
};

// Returns the reason a payment cannot be recorded, or null when it can.
export const paymentProblem = (
  kind: PaymentKind,
  amountPence: number | null,
  summary: { balance_pence: number; security_held_pence: number },
): string | null => {
  if (amountPence === null || amountPence <= 0)
    return "Enter an amount greater than zero.";
  if (kind === "security_refund" && amountPence > summary.security_held_pence) {
    return "The refund is more than the security deposit held.";
  }
  if (
    (kind === "deposit" || kind === "balance") &&
    amountPence > summary.balance_pence
  ) {
    return "This is more than the balance still due.";
  }
  return null;
};
