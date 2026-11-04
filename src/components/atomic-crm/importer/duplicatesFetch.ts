import { getSupabaseClient } from "../providers/supabase/supabase";
import type { ExistingBill, ExistingMoney } from "./duplicates";
import type { BillRow, MoneyRow } from "./specs";

// ---- Fetching what is already there for the dates in a sheet (voided entries do not count).

const range = (dates: string[]) => {
  const sorted = [...dates].sort();
  return { from: sorted[0], to: sorted[sorted.length - 1] };
};

const widen = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const fetchExistingMoney = async (
  rows: MoneyRow[],
): Promise<ExistingMoney[]> => {
  if (rows.length === 0) return [];
  const { from, to } = range(rows.map((r) => r.entry_date));
  const { data, error } = await getSupabaseClient()
    .from("money_entries")
    .select("entry_date, amount_pence, direction, counterparty")
    .is("voided_at", null)
    .gte("entry_date", from)
    .lte("entry_date", to)
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as ExistingMoney[];
};

export const fetchExistingBills = async (
  rows: BillRow[],
): Promise<ExistingBill[]> => {
  if (rows.length === 0) return [];
  const { from, to } = range(rows.map((r) => r.bill_date));
  const { data, error } = await getSupabaseClient()
    .from("bills")
    .select("supplier_name, reference, bill_date, net_pence, vat_pence")
    .is("voided_at", null)
    .gte("bill_date", widen(from, -3))
    .lte("bill_date", widen(to, 3))
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as ExistingBill[];
};
