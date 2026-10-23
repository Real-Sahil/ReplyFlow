// Sends the open pipeline or the orders as CSV, for a spreadsheet to pull on a schedule
// (see docs/SHEETS_EXPORT.md). Read-only, and only with the export key.
// Secrets (set in the Supabase dashboard, never in the repo):
//   PIPELINE_EXPORT_KEY  a long random string; the spreadsheet script sends it in the
//                        x-export-key header

import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sameSecret, toCsv } from "./csv.ts";

const LIMIT = 5000;
const EXPORT_ORGANISATION = 1;

const EXPORTS = {
  deals: {
    select:
      "id, name, stage, category, amount, expected_closing_date, lead_band, lead_score, sales_id, created_at, updated_at",
    columns: [
      "id",
      "name",
      "stage",
      "category",
      "amount",
      "expected_closing_date",
      "lead_band",
      "lead_score",
      "sales_id",
      "created_at",
      "updated_at",
    ],
    order: "updated_at",
  },
  orders: {
    select:
      "id, reference, status, agreed_price_pence, paid_pence, balance_pence, delivery_window_end, next_update_due, sales_id, created_at, updated_at",
    columns: [
      "id",
      "reference",
      "status",
      "agreed_price_pence",
      "paid_pence",
      "balance_pence",
      "delivery_window_end",
      "next_update_due",
      "sales_id",
      "created_at",
      "updated_at",
    ],
    order: "updated_at",
  },
} as const;

const plain = (status: number, message: string) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return plain(405, "Method Not Allowed");

  const expected = Deno.env.get("PIPELINE_EXPORT_KEY") ?? "";
  if (!expected) return plain(503, "The export key is not set up yet.");
  if (!sameSecret(req.headers.get("x-export-key") ?? "", expected)) {
    return plain(401, "Unauthorized");
  }

  const table = new URL(req.url).searchParams.get("table") ?? "";
  if (table !== "deals" && table !== "orders") {
    return plain(400, "Ask for table=deals or table=orders.");
  }
  const spec = EXPORTS[table];

  // This key belongs to Mere & Row, so it only ever exports Mere & Row's rows.
  const query = supabaseAdmin
    .from(table)
    .select(spec.select)
    .eq("organisation_id", EXPORT_ORGANISATION)
    .order(spec.order, { ascending: false })
    .limit(LIMIT);
  // Archived deals are left out of the pipeline.
  const { data, error } =
    table === "deals" ? await query.is("archived_at", null) : await query;
  if (error) {
    console.error("Export failed", table, error.message);
    return plain(500, "The export could not be read. Try again later.");
  }

  return new Response(toCsv(data ?? [], [...spec.columns]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${table}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
