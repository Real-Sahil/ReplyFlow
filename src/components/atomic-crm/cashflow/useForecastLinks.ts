import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify } from "ra-core";

import { getSupabaseClient } from "../providers/supabase/supabase";

export const EXCLUSIONS_KEY = ["forecast_exclusions"];
export const INVOICED_KEY = ["forecast_invoiced"];

type Exclusion = { id: number; source: string; ref_id: number };

// The lines this business has chosen to leave out of the forecast.
export const useExclusions = (enabled = true) =>
  useQuery({
    queryKey: EXCLUSIONS_KEY,
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("forecast_exclusions")
        .select("id, source, ref_id");
      if (error) throw error;
      return (data ?? []) as unknown as Exclusion[];
    },
  });

export const exclusionKeys = (rows: Exclusion[]) =>
  new Set(rows.map((r) => `${r.source}:${r.ref_id}`));

// "<repeating item id>:<YYYY-MM>" for each month an invoice was issued from a repeating invoice that is linked
// to a repeating money-in item, using the date the invoice actually carries.
export const useInvoicedMonths = (enabled = true) =>
  useQuery({
    queryKey: INVOICED_KEY,
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("invoice_drafts")
        .select(
          "issue_date, invoices(issue_date), recurring_invoices(recurring_item_id)",
        )
        .eq("status", "issued");
      if (error) throw error;
      const out = new Set<string>();
      for (const row of (data ?? []) as unknown as {
        issue_date: string;
        invoices: { issue_date: string } | null;
        recurring_invoices: { recurring_item_id: number | null } | null;
      }[]) {
        const item = row.recurring_invoices?.recurring_item_id;
        if (item == null) continue;
        out.add(
          `${item}:${(row.invoices?.issue_date ?? row.issue_date).slice(0, 7)}`,
        );
      }
      return out;
    },
  });

export const useLeaveOut = () => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const done = () =>
    queryClient.invalidateQueries({ queryKey: EXCLUSIONS_KEY });
  const onError = (error: Error) => notify(error.message, { type: "error" });
  const leaveOut = useMutation({
    mutationFn: async (key: string) => {
      const [source, id] = key.split(":");
      const { error } = await getSupabaseClient()
        .from("forecast_exclusions")
        .insert({ source, ref_id: Number(id) });
      if (error) throw error;
    },
    onSuccess: done,
    onError,
  });
  const putBack = useMutation({
    mutationFn: async (key: string) => {
      const [source, id] = key.split(":");
      const { error } = await getSupabaseClient()
        .from("forecast_exclusions")
        .delete()
        .eq("source", source)
        .eq("ref_id", Number(id));
      if (error) throw error;
    },
    onSuccess: done,
    onError,
  });
  return { leaveOut, putBack };
};
