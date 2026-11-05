// Sets up a new business on ReplyFlow for a customer: its organisation and its first administrator, with a
// one-time password the new administrator must change at first sign-in. No email is sent.
//
// Only a platform owner may call it (the platform_owners table, kept by hand). Public sign-up stays closed:
// this is how a business is added until sign-up is opened on purpose (see the onboard function).
//
//   GET   the businesses on the platform, so the owner can see who is set up
//   POST  { organisation_name, first_name, last_name, email } -> the new business and its one-time password
//
// Any step that fails is rolled back, like the public sign-up.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { logError } from "../_shared/errorLog.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { parseNewBusiness, passwordFrom } from "./businessRules.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const isPlatformOwner = async (userId: string) => {
  const { data } = await supabaseAdmin
    .from("platform_owners")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
};

// Removes what a failed set-up left behind.
const rollback = async (
  organisationId: number,
  email: string,
  userId?: string,
) => {
  await supabaseAdmin.from("signup_grants").delete().eq("email", email);
  if (userId) {
    await supabaseAdmin.from("sales").delete().eq("user_id", userId);
    await supabaseAdmin.auth.admin.deleteUser(userId);
  }
  await supabaseAdmin.from("organisations").delete().eq("id", organisationId);
};

const list = async () => {
  const [{ data: organisations }, { data: people }] = await Promise.all([
    supabaseAdmin
      .from("organisations")
      .select("id, name, created_at")
      .order("id"),
    supabaseAdmin
      .from("sales")
      .select(
        "organisation_id, first_name, last_name, administrator, disabled",
      ),
  ]);
  const businesses = (organisations ?? []).map((o) => {
    const mine = (people ?? []).filter(
      (p) => p.organisation_id === o.id && !p.disabled,
    );
    return {
      id: o.id,
      name: o.name,
      created_at: o.created_at,
      people: mine.length,
      administrators: mine
        .filter((p) => p.administrator)
        .map((p) => `${p.first_name} ${p.last_name}`.trim()),
    };
  });
  return json({ data: businesses });
};

const create = async (req: Request, ownerId: string) => {
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return createErrorResponse(400, "Invalid request");
  }
  const parsed = parseNewBusiness(input);
  if (!parsed.ok) return createErrorResponse(400, parsed.reason);
  const { organisationName, firstName, lastName, email } = parsed.value;

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

  // The grant lets the sign-up trigger accept this one email, and says which business it belongs to.
  const { error: grantError } = await supabaseAdmin
    .from("signup_grants")
    .insert({ email, organisation_id: organisationId });
  if (grantError) {
    console.error("Could not record the grant", grantError);
    await rollback(organisationId, email);
    return createErrorResponse(500, "Could not start the set-up");
  }

  const password = passwordFrom(crypto.getRandomValues(new Uint8Array(12)));
  let userId: string | undefined;
  try {
    const { data: created, error: userError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          must_change_password: true,
        },
      });
    if (userError || !created.user) {
      await rollback(organisationId, email);
      if (userError?.code === "email_exists") {
        return createErrorResponse(409, "That email already has an account.", {
          code: "email_taken",
        });
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
    await supabaseAdmin.from("signup_grants").delete().eq("email", email);
  } catch (error) {
    await logError("function:create_business", error, { step: "create" });
    await rollback(organisationId, email, userId);
    return createErrorResponse(500, "Could not finish setting up the business");
  }

  console.warn(
    `Business ${organisationId} created by platform owner ${ownerId}`,
  );
  return json({
    data: {
      organisation_id: organisationId,
      organisation_name: organisationName,
      email,
      first_name: firstName,
      last_name: lastName,
      temporary_password: password,
    },
  });
};

Deno.serve((req: Request) =>
  OptionsMiddleware(req, (req) =>
    AuthMiddleware(req, (req) =>
      UserMiddleware(req, async (req, user) => {
        if (!user || !(await isPlatformOwner(user.id))) {
          return createErrorResponse(
            403,
            "Only the platform owner can do this.",
          );
        }
        if (req.method === "GET") return await list();
        if (req.method === "POST") return await create(req, user.id);
        return createErrorResponse(405, "Method Not Allowed");
      }),
    ),
  ),
);
