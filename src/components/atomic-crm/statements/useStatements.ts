import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";
import type { StatementLine } from "./statement";

export const STATEMENTS_KEY = ["statements"];

export type StatementData = {
  lines: StatementLine[];
  names: Record<number, string>;
};

// Every invoice, credit note and payment the signed-in person can see, and the names of the customers.
export const useStatementData = () =>
  useQuery({
    queryKey: STATEMENTS_KEY,
    retry: false,
    queryFn: async (): Promise<StatementData> => {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from("customer_statement_lines")
        .select(
          "contact_id, line_date, kind, reference, order_reference, due_date, debit_pence, credit_pence, sort_order, source_id",
        )
        .order("line_date", { ascending: true })
        .limit(5000);
      if (error) throw error;
      const lines = (data ?? []) as unknown as StatementLine[];
      const ids = [
        ...new Set(
          lines
            .map((l) => l.contact_id)
            .filter((id): id is number => id != null),
        ),
      ];
      const names: Record<number, string> = {};
      if (ids.length > 0) {
        const { data: people, error: nameError } = await client
          .from("contacts")
          .select("id, first_name, last_name")
          .in("id", ids);
        if (nameError) throw nameError;
        for (const p of (people ?? []) as {
          id: number;
          first_name: string | null;
          last_name: string | null;
        }[]) {
          names[p.id] =
            `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
            `Customer ${p.id}`;
        }
      }
      return { lines, names };
    },
  });
