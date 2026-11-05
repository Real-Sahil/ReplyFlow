// Builds every business's weekly summary for the week just gone and tells them it is ready.
// Called by the scheduled job each Monday with the same Vault key the autopilot uses; nobody else
// can run it. The notification carries no figures, because every member of a business receives
// it and only administrators may read the money (see the weekly_summary migration).

import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sendPushToOrganisation } from "../_shared/webPush.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const ymd = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST")
    return json(405, { message: "Method Not Allowed" });

  const given = req.headers.get("x-autopilot-key");
  if (!given) return json(401, { message: "Unauthorized" });
  const { data: allowed } = await supabaseAdmin.rpc("post_autopilot_key_ok", {
    candidate: given,
  });
  if (allowed !== true) return json(401, { message: "Unauthorized" });

  // The week just gone: the seven days ending yesterday.
  const now = new Date();
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const from = new Date(to.getTime() - 6 * 86_400_000);

  const { data: organisations, error } = await supabaseAdmin
    .from("organisations")
    .select("id");
  if (error) {
    console.error("Weekly summary: organisations failed", error.message);
    return json(500, { message: "Internal Server Error" });
  }

  let built = 0;
  for (const organisation of organisations ?? []) {
    // One business failing never stops the rest.
    try {
      const { data, error: buildError } = await supabaseAdmin.rpc(
        "build_weekly_summary",
        { p_org: organisation.id, p_from: ymd(from), p_to: ymd(to) },
      );
      if (buildError) throw buildError;
      const { error: saveError } = await supabaseAdmin
        .from("weekly_summaries")
        .upsert(
          {
            organisation_id: organisation.id,
            week_from: ymd(from),
            week_to: ymd(to),
            data,
          },
          { onConflict: "organisation_id,week_from" },
        );
      if (saveError) throw saveError;
      await sendPushToOrganisation(Number(organisation.id), {
        title: "Your week is ready",
        body: "Your weekly summary is ready to read.",
        url: "/app#/summary",
        tag: `weekly-${ymd(from)}`,
      });
      built++;
    } catch (e) {
      console.error(
        "Weekly summary failed for organisation",
        organisation.id,
        (e as Error).message,
      );
    }
  }
  return json(200, { built });
});
