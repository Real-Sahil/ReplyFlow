// Tells a business's administrators that staff have sent expense claims. Called by the database right
// after the claims are saved (one call per statement, so a sheet of claims is one notification), with
// the same Vault key as the weekly summary; nobody else can run it. The notification carries money, so
// it goes to the administrators only, never to the whole team.

import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sendPushToOrganisation } from "../_shared/webPush.ts";
import { claimsMessage, holidayMessage, hoursMessage } from "./message.ts";

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
  const kind = String(body.kind ?? "claims");
  const organisationId = Number(body.organisation_id);
  const claimantId = Number(body.claimant_id ?? body.staff_id);
  const count = Number(body.count);
  const total = Number(body.total_pence ?? 0);
  const flagged = Number(body.flagged ?? 0);
  const hours = Number(body.hours ?? 0);
  const days = Number(body.days ?? 0);
  if (
    !["claims", "hours", "holiday"].includes(kind) ||
    ![organisationId, claimantId, count, total, hours, days].every(
      Number.isFinite,
    )
  ) {
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

  const name = `${sale.first_name} ${sale.last_name}`.trim();
  const message =
    kind === "hours"
      ? hoursMessage({ name, count, hours })
      : kind === "holiday"
        ? holidayMessage({ name, count, days })
        : claimsMessage({ name, count, totalPence: total, flagged });
  const page = kind === "claims" ? "claims" : kind;
  await sendPushToOrganisation(
    organisationId,
    { ...message, url: `./#/${page}`, tag: `${kind}-${claimantId}` },
    { administratorsOnly: true },
  );
  return json(200, { sent: true });
});
