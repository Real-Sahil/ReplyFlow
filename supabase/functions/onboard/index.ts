// Creates a new business on ReplyFlow: its organisation, and its first administrator.
// Sign-up stays closed until the SIGNUP_OPEN secret is "true" (see the tenancy plan).
// The administrator gets the same invitation email as a staff invite, which confirms the
// address before they can sign in. Any step that fails is rolled back.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { parseOnboarding } from "./onboardRules.ts";

const signupOpen = () => Deno.env.get("SIGNUP_OPEN") === "true";

const rollback = async (organisationId: number, userId?: string) => {
  if (userId) {
    await supabaseAdmin.from("sales").delete().eq("user_id", userId);
    await supabaseAdmin.auth.admin.deleteUser(userId);
  }
  await supabaseAdmin.from("organisations").delete().eq("id", organisationId);
};

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }
    if (!signupOpen()) {
      return createErrorResponse(
        403,
        "Sign-up is by invitation. Ask an administrator for an invitation.",
        { code: "signup_closed" },
      );
    }

    let input: unknown;
    try {
      input = await req.json();
    } catch {
      return createErrorResponse(400, "Invalid request");
    }
    const parsed = parseOnboarding(input);
    if (!parsed.ok) return createErrorResponse(400, parsed.reason);
    const { organisationName, firstName, lastName, email, password } =
      parsed.value;

    const { data: organisation, error: organisationError } = await supabaseAdmin
      .from("organisations")
      .insert({ name: organisationName })
      .select("id")
      .single();
    if (organisationError || !organisation) {
      console.error("Could not create the organisation", organisationError);
      return createErrorResponse(500, "Could not create the business");
    }
    const organisationId = Number(organisation.id);

    let userId: string | undefined;
    try {
      // app_metadata is set by the server only, and lets the sign-up trigger accept the user.
      const { data: created, error: userError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          user_metadata: { first_name: firstName, last_name: lastName },
          app_metadata: { replyflow_invited: true },
        });
      if (userError || !created.user) {
        await rollback(organisationId);
        if (userError?.code === "email_exists") {
          return createErrorResponse(
            409,
            "That email already has an account. Sign in instead.",
            { code: "email_taken" },
          );
        }
        console.error("Could not create the user", userError);
        return createErrorResponse(
          400,
          userError?.message ?? "Could not create the account",
        );
      }
      userId = created.user.id;

      const { error: saleError } = await supabaseAdmin
        .from("sales")
        .update({
          organisation_id: organisationId,
          administrator: true,
          first_name: firstName,
          last_name: lastName,
        })
        .eq("user_id", userId);
      if (saleError) throw saleError;

      const { error: inviteError } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(email);
      if (inviteError) throw inviteError;
    } catch (error) {
      console.error("Onboarding failed, rolling back", error);
      await rollback(organisationId, userId);
      return createErrorResponse(
        500,
        "Could not finish setting up the business",
      );
    }

    return new Response(
      JSON.stringify({ data: { organisation_id: organisationId } }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }),
);
