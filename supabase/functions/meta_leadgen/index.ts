// Receives Facebook lead ad submissions (official Leadgen webhook). Each new lead is
// fetched from the Graph API and recorded like a website enquiry: a contact and an
// opportunity, or a note on an open deal from the same person.
// Secrets (set in the Supabase dashboard, never in the repo):
//   META_APP_SECRET        verifies every delivery's signature
//   META_VERIFY_TOKEN      any long random string, also entered in Meta's webhook setup
//   META_PAGE_ID           optional: ignore leads from any other Page
//   META_PAGE_ACCESS_TOKEN optional fallback for the Page token (see metaToken.ts)

import { isValidSignature } from "../messenger_webhook/webhook.ts";
import { getPageTokenFor } from "../_shared/metaToken.ts";
import { assertMetaOpen, recordIfActionBlock } from "../_shared/metaCircuit.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  type FieldData,
  type LeadgenEvent,
  mapLeadFields,
  parseLeadgenEvents,
} from "./leadgenRules.ts";

const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain" } });

type Lead = {
  field_data?: FieldData[];
  campaign_name?: string;
  form_id?: string;
};

// The organisation that owns the Page a lead came from. Pages not on the list use Mere & Row.
const organisationFor = async (pageId: string): Promise<number> => {
  const { data } = await supabaseAdmin
    .from("meta_pages")
    .select("organisation_id")
    .eq("page_id", pageId)
    .maybeSingle();
  return Number(data?.organisation_id ?? 1);
};

const fetchLead = async (leadgenId: string, pageId: string): Promise<Lead> => {
  const token = await getPageTokenFor(pageId);
  if (!token) throw new Error("No Page access token is set");
  await assertMetaOpen();
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(leadgenId)}?fields=field_data,campaign_name,form_id`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    },
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    await recordIfActionBlock(json);
    throw new Error(`Lead lookup failed with ${response.status}`);
  }
  return json as Lead;
};

// Each lead is claimed in meta_leadgen_leads before it is processed, so a redelivery
// from Meta is ignored. If processing fails, the claim is released and the request
// returns an error, which makes Meta deliver the lead again.
const handleLead = async (event: LeadgenEvent) => {
  const organisationId = await organisationFor(event.pageId);
  const { error: claimError } = await supabaseAdmin
    .from("meta_leadgen_leads")
    .insert({
      leadgen_id: event.leadgenId,
      page_id: event.pageId,
      form_id: event.formId,
      organisation_id: organisationId,
    });
  if (claimError?.code === "23505") return; // already processed
  if (claimError) throw new Error(claimError.message);

  try {
    const lead = await fetchLead(event.leadgenId, event.pageId);
    const fields = mapLeadFields(
      lead.field_data ?? [],
      lead.campaign_name ?? null,
    );
    const { data: dealId, error } = await supabaseAdmin.rpc(
      "record_organisation_enquiry",
      {
        p_organisation_id: organisationId,
        p_name: fields.name,
        p_email: fields.email ?? "",
        p_phone: fields.phone,
        p_message: fields.message,
        p_product: fields.product,
        p_source_url: `facebook:lead-ad:${event.formId ?? lead.form_id ?? "unknown"}`,
      },
    );
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("meta_leadgen_leads")
      .update({ deal_id: dealId })
      .eq("leadgen_id", event.leadgenId);
  } catch (error) {
    await supabaseAdmin
      .from("meta_leadgen_leads")
      .delete()
      .eq("leadgen_id", event.leadgenId);
    throw error;
  }
};

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const verifyToken = Deno.env.get("META_VERIFY_TOKEN");
    if (
      url.searchParams.get("hub.mode") === "subscribe" &&
      verifyToken &&
      url.searchParams.get("hub.verify_token") === verifyToken
    ) {
      return text(url.searchParams.get("hub.challenge") ?? "");
    }
    return text("Forbidden", 403);
  }
  if (req.method !== "POST") return text("Method Not Allowed", 405);

  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (
    !(await isValidSignature(
      Deno.env.get("META_APP_SECRET") ?? "",
      raw,
      signature,
    ))
  ) {
    return text("Invalid signature", 401);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return text("Bad request", 400);
  }

  const onlyPage = Deno.env.get("META_PAGE_ID");
  for (const event of parseLeadgenEvents(body)) {
    if (onlyPage && event.pageId !== onlyPage) continue;
    try {
      await handleLead(event);
    } catch (error) {
      // Logged for the function logs; Meta is asked to deliver again.
      console.error("Lead handling failed", event.leadgenId, String(error));
      return text("Retry later", 500);
    }
  }
  return text("OK");
});
