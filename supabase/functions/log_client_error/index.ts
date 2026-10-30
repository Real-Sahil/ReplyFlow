// Receives errors from the browser, so an administrator can see them in the app instead of
// waiting for someone to report a blank screen. Signed-in users only, and rate limited by the
// shared sign-in check. The text is clipped, because anyone signed in could send anything.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { logError, organisationOfUser } from "../_shared/errorLog.ts";
import { clip } from "../_shared/rateLimitRules.ts";
import { createErrorResponse } from "../_shared/utils.ts";

Deno.serve((req: Request) =>
  OptionsMiddleware(req, (req) =>
    AuthMiddleware(req, (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }
        let body: { message?: unknown; stack?: unknown; page?: unknown };
        try {
          body = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid request");
        }
        const message = clip(body?.message ?? "Unknown error", 500);
        const error = new Error(message);
        error.stack =
          typeof body?.stack === "string" ? clip(body.stack, 4000) : undefined;
        await logError(
          "browser",
          error,
          { page: clip(body?.page ?? "", 200) },
          await organisationOfUser(user!.id),
        );
        return new Response(JSON.stringify({ data: { logged: true } }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }),
    ),
  ),
);
