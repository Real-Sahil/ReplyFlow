// Reads a business's market and currency (chosen by an administrator in Settings, kept in
// configuration.config). The pure formatting lives in moneyFormat.ts so it can be tested without a database.

import { supabaseAdmin } from "./supabaseAdmin.ts";
import { moneyFormatFor, type MoneyFormat } from "./moneyFormat.ts";

export * from "./moneyFormat.ts";

// The format for one business, read with the service key. A business that has not chosen is in pounds.
export const getMoneyFormat = async (
  organisationId: number,
): Promise<MoneyFormat> => {
  const { data } = await supabaseAdmin
    .from("configuration")
    .select("config")
    .eq("organisation_id", organisationId)
    .maybeSingle();
  const config = (data?.config ?? {}) as Record<string, unknown>;
  return moneyFormatFor(config.currency, config.market);
};
