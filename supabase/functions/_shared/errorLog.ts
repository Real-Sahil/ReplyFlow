import { clip } from "./rateLimitRules.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";

// Records an error so an administrator can see it in the app. It never throws: a failure to
// log must not turn into a second failure for the person using the app.
export const logError = async (
  source: string,
  error: unknown,
  context: Record<string, unknown> = {},
  organisationId: number | null = null,
) => {
  const message = clip(error, 500);
  console.error(source, message);
  try {
    const { error: insertError } = await supabaseAdmin
      .from("error_log")
      .insert({
        organisation_id: organisationId,
        source,
        message,
        detail:
          error instanceof Error && error.stack
            ? clip(error.stack, 4000)
            : null,
        context,
      });
    if (insertError)
      console.error("Could not save the error", insertError.message);
  } catch (loggingError) {
    console.error("Could not save the error", (loggingError as Error).message);
  }
};

// The organisation a signed-in user belongs to, for filing their errors under the right business.
export const organisationOfUser = async (userId: string) => {
  try {
    const { data } = await supabaseAdmin
      .from("sales")
      .select("organisation_id")
      .eq("user_id", userId)
      .maybeSingle();
    return data?.organisation_id ? Number(data.organisation_id) : null;
  } catch {
    return null;
  }
};
