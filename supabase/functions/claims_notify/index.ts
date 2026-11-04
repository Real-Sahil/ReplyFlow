// Tells a business's administrators that staff have sent expense claims. Called by the database right
// after the claims are saved (one call per statement, so a sheet of claims is one notification), with
// the same Vault key as the weekly summary; nobody else can run it. The notification carries money, so
// it goes to the administrators only, never to the whole team.

import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sendPushToOrganisation } from "../_shared/webPush.ts";
import { claimsMessage } from "./message.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST")
    return json(405, { message: "Method Not Allowed" });

  const given = req.headers.get("x-autopilot-key");
  if (!given) return json(401, { message: "Unauthorized" });
  const { data: allowed } = await supabaseAdmin.rpc("post_autopilot_key_ok", {
    candidate: given,
  });
  if (allowed !== true) return json(401, { message: "Unauthorized" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { message: "Bad Request" });
  }
  const organisationId = Number(body.organisation_id);
  const claimantId = Number(body.claimant_id);
  const count = Number(body.count);
  const total = Number(body.total_pence);
  const flagged = Number(body.flagged ?? 0);
  if (![organisationId, claimantId, count, total].every(Number.isFinite)) {
    return json(400, { message: "Bad Request" });
  }

  // The name comes from the database, not from the request.
  const { data: sale } = await supabaseAdmin
    .from("sales")
    .select("first_name, last_name")
    .eq("id", claimantId)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (!sale) return json(404, { message: "Not Found" });

  const message = claimsMessage({
    name: `${sale.first_name} ${sale.last_name}`.trim(),
    count,
    totalPence: total,
    flagged,
  });
  await sendPushToOrganisation(
    organisationId,
    { ...message, url: "./#/claims", tag: `claims-${claimantId}` },
    { administratorsOnly: true },
  );
  return json(200, { sent: true });
});
