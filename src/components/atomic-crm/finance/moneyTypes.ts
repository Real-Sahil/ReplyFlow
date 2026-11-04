export type MoneyState = "planned" | "done" | "void";

export type MoneyEntry = {
  id: number;
  direction: "in" | "out";
  category: string;
  category_label: string;
  category_group: string;
  status: "planned" | "done";
  state: MoneyState;
  entry_date: string;
  period_from: string | null;
  period_to: string | null;
  amount_pence: number;
  counterparty: string | null;
  payment_method: "cash" | "card" | "bank_transfer" | "other" | null;
  reference: string | null;
  channel:
    | "ecommerce"
    | "facebook"
    | "email"
    | "phone"
    | "in_person"
    | "other"
    | null;
  order_id: number | null;
  order_reference: string | null;
  order_summary: string | null;
  order_note: string | null;
  regulated: boolean;
  receipt_path: string | null;
  note: string;
  voided_at: string | null;
  void_reason: string | null;
  vat_code: string;
  vat_pence: number;
};

export type MoneyCategory = {
  code: string;
  label: string;
  direction: "in" | "out";
  grp: string;
  regulated: boolean;
  admin_only: boolean;
};

export const MONEY_KEY = ["money"];

export const CHANNEL_LABEL: Record<
  NonNullable<MoneyEntry["channel"]>,
  string
> = {
  ecommerce: "E-commerce",
  facebook: "Facebook",
  email: "Email",
  phone: "Phone",
  in_person: "In person",
  other: "Other",
};

export const METHOD_LABEL: Record<
  NonNullable<MoneyEntry["payment_method"]>,
  string
> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  other: "Other",
};
