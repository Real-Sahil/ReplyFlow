// Public endpoint for the enquiry form on the Mere & Row website. No sign-in: anyone
// can send one, so the checks live here instead. Each valid enquiry becomes a contact
// and an opportunity in the CRM (see record_web_enquiry in the database).
// Spam controls, all free: a size limit, a hidden honeypot field, strict field rules,
// and a repeat enquiry from the same email joins the open deal rather than adding one.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { parseEnquiry } from "./enquiryRules.ts";

const MAX_BYTES = 8 * 1024;

const received = () =>
  new Response(JSON.stringify({ data: { received: true } }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    const raw = await req.text();
    if (raw.length > MAX_BYTES) {
      return createErrorResponse(413, "That message is too long.");
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return createErrorResponse(400, "Send the enquiry form again.");
    }

    // The honeypot is a field hidden from people. Bots fill it in, so they get a
    // success reply and nothing is stored.
    if (
      body &&
      typeof body === "object" &&
      (body as { website?: unknown }).website
    ) {
      return received();
    }

    const parsed = parseEnquiry(body);
    if (!parsed.ok) {
      return createErrorResponse(422, parsed.reason, { code: "invalid" });
    }
    const v = parsed.value;

    // A form that names its organisation (?key=...) records there. Without a key the enquiry
    // goes to Mere & Row, as before.
    const key = new URL(req.url).searchParams.get("key");
    let organisationId = 1;
    if (key) {
      const { data: org } = await supabaseAdmin
        .from("organisations")
        .select("id")
        .eq("enquiry_key", key)
        .maybeSingle();
      if (!org) {
        return createErrorResponse(
          404,
          "This enquiry form is not recognised.",
          {
            code: "unknown_form",
          },
        );
      }
      organisationId = Number(org.id);
    }

    const { error } = await supabaseAdmin.rpc("record_organisation_enquiry", {
      p_organisation_id: organisationId,
      p_name: v.name,
      p_email: v.email,
      p_phone: v.phone,
      p_message: v.message,
      p_product: v.product,
      p_source_url: v.sourceUrl,
    });
    if (error) {
      console.error("record_organisation_enquiry failed", error.message);
      return createErrorResponse(
        500,
        "We could not save that. Please try again or call us.",
      );
    }
    return received();
  }),
);
