import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { INVOICES_KEY, type Invoice } from "./invoiceTypes";

// Invoices and credit notes, newest first, optionally for one order, with their lines.
export const useInvoices = (options: {
  orderId?: number;
  from?: string | null;
  to?: string | null;
}) =>
  useQuery({
    queryKey: [...INVOICES_KEY, options],
    queryFn: async () => {
      let query = getSupabaseClient()
        .from("invoices")
        .select("*, invoice_lines(*)")
        .order("issue_date", { ascending: false })
        .order("id", { ascending: false })
        .limit(500);
      if (options.orderId) query = query.eq("order_id", options.orderId);
      if (options.from) query = query.gte("issue_date", options.from);
      if (options.to) query = query.lte("issue_date", options.to);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Invoice[];
    },
  });
