// Posts the destinations that are due. LinkedIn cannot schedule a post, so ReplyFlow does: this runs every five
// minutes (called by the scheduled job with the same Vault key the autopilot uses; nobody else can run it), finds
// destinations that are scheduled and due, and posts them. A destination is claimed before it is sent so two
// overlapping runs can never post it twice. A failure is saved on the destination and the administrators are told.

import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sendPushToOrganisation } from "../_shared/webPush.ts";
import { failureNote, mayPost, textFor } from "../_shared/destinations.ts";
import { postToLinkedIn, PublishError } from "../_shared/linkedinPublish.ts";

const MAX_PER_RUN = 20;

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

  const { data: due, error } = await supabaseAdmin
    .from("post_destinations")
    .select(
      "id, organisation_id, post_id, channel_key, owner_sale_id, text_override",
    )
    .eq("state", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(MAX_PER_RUN);
  if (error) {
    console.error("Destination run: query failed", error.message);
    return json(500, { message: "Internal Server Error" });
  }

  let posted = 0;
  let failed = 0;
  for (const d of due ?? []) {
    // Claim it: only one run gets the row back, so a post is never sent twice.
    const { data: claimed } = await supabaseAdmin
      .from("post_destinations")
      .update({ state: "planned" })
      .eq("id", d.id)
      .eq("state", "scheduled")
      .select("id");
    if (!claimed?.length) continue;

    const fail = async (message: string) => {
      failed++;
      await supabaseAdmin
        .from("post_destinations")
        .update({ state: "failed", error: failureNote(message) })
        .eq("id", d.id);
      await sendPushToOrganisation(
        Number(d.organisation_id),
        {
          title: "A scheduled LinkedIn post did not go out",
          body: failureNote(message),
          url: "/app#/page_posts",
          tag: `destination-${d.id}`,
        },
        { administratorsOnly: true },
      );
    };

    try {
      const { data: post } = await supabaseAdmin
        .from("page_posts")
        .select(
          "id, message, link_url, status, media_path, media_type, image_url",
        )
        .eq("id", d.post_id)
        .eq("organisation_id", d.organisation_id)
        .maybeSingle();
      if (!post) throw new PublishError(404, "The post is gone");
      if (!mayPost(post.status, "runner")) {
        throw new PublishError(409, "The post is no longer approved");
      }
      const result = await postToLinkedIn({
        organisationId: Number(d.organisation_id),
        channelKey: String(d.channel_key),
        ownerSaleId: d.owner_sale_id ? Number(d.owner_sale_id) : null,
        post,
        text: textFor(post, d),
      });
      await supabaseAdmin
        .from("post_destinations")
        .update({
          state: "published",
          external_id: result.urn,
          posted_at: new Date().toISOString(),
          scheduled_for: null,
          error: null,
        })
        .eq("id", d.id);
      posted++;
    } catch (e) {
      await fail(
        e instanceof PublishError ? e.message : "LinkedIn could not be reached",
      );
      console.error("Destination run: post failed", d.id, (e as Error).message);
    }
  }
  return json(200, { posted, failed });
});
