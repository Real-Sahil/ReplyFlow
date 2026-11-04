// Staff expense claims. An employee sends a claim; an administrator approves or rejects it and pays it
// back. Nothing reaches the money book until it is paid. See the expense claims migration.

export type ClaimStatus = "pending" | "approved" | "rejected" | "paid";

export type Claim = {
  id: number;
  claimant_id: number;
  claim_date: string;
  amount_pence: number;
  category: string;
  description: string;
  receipt_path: string | null;
  status: ClaimStatus;
  decision_note: string | null;
  decided_at: string | null;
  paid_at: string | null;
  created_at: string;
  claimant?: { first_name: string; last_name: string } | null;
};

// What an employee can claim for. The database allows exactly these.
export const CLAIM_CATEGORIES = [
  { code: "travel_out", label: "Travel and vehicle" },
  { code: "stock", label: "Stock and materials" },
  { code: "office_out", label: "Office costs" },
  { code: "equipment_out", label: "Equipment and repairs" },
  { code: "software_out", label: "Software and subscriptions" },
  { code: "delivery_out", label: "Delivery and courier" },
  { code: "packaging_out", label: "Packaging" },
  { code: "production", label: "Production costs" },
  { code: "advertising_out", label: "Advertising and marketing" },
  { code: "professional_out", label: "Professional fees" },
  { code: "other_out", label: "Other" },
] as const;

export const categoryLabel = (code: string) =>
  CLAIM_CATEGORIES.find((c) => c.code === code)?.label ?? code;

export const STATUS_LABEL: Record<ClaimStatus, string> = {
  pending: "Waiting",
  approved: "Approved, to be paid",
  rejected: "Not approved",
  paid: "Paid",
};

// "12.50", "£12.5" or "1,250" -> pence. Anything else, zero or over £5,000 -> null.
export const parsePounds = (text: string): number | null => {
  const cleaned = text.replace(/[£,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const pence = Math.round(Number.parseFloat(cleaned) * 100);
  return pence > 0 && pence <= 500000 ? pence : null;
};

const sum = (claims: Claim[], status: ClaimStatus) =>
  claims
    .filter((c) => c.status === status)
    .reduce((total, c) => total + c.amount_pence, 0);

// Waiting for a decision, and approved but not yet paid back (what the business owes its staff).
export const waiting = (claims: Claim[]) =>
  claims.filter((c) => c.status === "pending");
export const owedToStaff = (claims: Claim[]) => sum(claims, "approved");
export const waitingTotal = (claims: Claim[]) => sum(claims, "pending");

// Oldest waiting first, so nothing sits unanswered; everything else newest first.
export const byAttention = (claims: Claim[]) =>
  [...claims].sort((a, b) => {
    const rank = (c: Claim) =>
      c.status === "pending" ? 0 : c.status === "approved" ? 1 : 2;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return rank(a) < 2
      ? a.created_at.localeCompare(b.created_at)
      : b.created_at.localeCompare(a.created_at);
  });

export const claimantName = (c: Claim) =>
  c.claimant ? `${c.claimant.first_name} ${c.claimant.last_name}`.trim() : "";
