import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";
import type { InvoiceDraft, RecurringInvoice } from "./invoiceRepeat";

export const INVOICE_REPEATS_KEY = ["recurring_invoices"];
export const INVOICE_DRAFTS_KEY = ["invoice_drafts"];

export const useInvoiceRepeats = (enabled = true) =>
  useQuery({
    queryKey: INVOICE_REPEATS_KEY,
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("recurring_invoices")
        .select("*")
        .order("next_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as RecurringInvoice[];
    },
  });

export const useInvoiceDrafts = (enabled = true) =>
  useQuery({
    queryKey: INVOICE_DRAFTS_KEY,
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("invoice_drafts")
        .select("*")
        .eq("status", "draft")
        .order("issue_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as InvoiceDraft[];
    },
  });
