import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";

export type BankLine = {
  id: number;
  line_date: string;
  description: string;
  amount_pence: number;
  line_hash: string;
  status: "open" | "matched" | "ignored";
  bill_id: number | null;
  order_payment_id: number | null;
  money_entry_id: number | null;
  note: string | null;
};

export const BANK_KEY = ["bank_lines"];

export const useBankLines = (status: BankLine["status"]) =>
  useQuery({
    queryKey: [...BANK_KEY, status],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("bank_lines")
        .select(
          "id, line_date, description, amount_pence, line_hash, status, bill_id, order_payment_id, money_entry_id, note",
        )
        .eq("status", status)
        .order("line_date", { ascending: false })
        .order("id", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as BankLine[];
    },
  });

export const useBankCounts = () =>
  useQuery({
    queryKey: [...BANK_KEY, "counts"],
    queryFn: async () => {
      const count = async (status: string) => {
        const { count: n, error } = await getSupabaseClient()
          .from("bank_lines")
          .select("id", { count: "exact", head: true })
          .eq("status", status);
        if (error) throw error;
        return n ?? 0;
      };
      const [open, matched, ignored] = await Promise.all([
        count("open"),
        count("matched"),
        count("ignored"),
      ]);
      return { open, matched, ignored };
    },
  });
