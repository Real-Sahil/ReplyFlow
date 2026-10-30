// Lets a signed-in person turn notifications on or off for this device.
//   GET     the public key the browser needs to subscribe
//   POST    { subscription } save this device
//   DELETE  { endpoint }     forget this device

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { organisationOfUser } from "../_shared/errorLog.ts";
import { clip } from "../_shared/rateLimitRules.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getVapidKeys } from "../_shared/webPush.ts";
import { createErrorResponse } from "../_shared/utils.ts";

const json = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

Deno.serve((req: Request) =>
  OptionsMiddleware(req, (req) =>
    AuthMiddleware(req, (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method === "GET") {
          const { publicKey } = await getVapidKeys();
          return json({ publicKey });
        }

        let body: {
          subscription?: {
            endpoint?: unknown;
            keys?: { p256dh?: unknown; auth?: unknown };
          };
          endpoint?: unknown;
        };
        try {
          body = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid request");
        }

        if (req.method === "POST") {
          const sub = body?.subscription;
          const endpoint =
            typeof sub?.endpoint === "string" ? sub.endpoint : "";
          const p256dh = sub?.keys?.p256dh;
          const auth = sub?.keys?.auth;
          if (
            !endpoint.startsWith("https://") ||
            endpoint.length > 1000 ||
            typeof p256dh !== "string" ||
            typeof auth !== "string"
          ) {
            return createErrorResponse(400, "Invalid subscription");
          }
          const organisationId = await organisationOfUser(user!.id);
          if (!organisationId) return createErrorResponse(403, "No business");
          const { error } = await supabaseAdmin
            .from("push_subscriptions")
            .upsert(
              {
                user_id: user!.id,
                organisation_id: organisationId,
                endpoint,
                p256dh: clip(p256dh, 200),
                auth: clip(auth, 100),
              },
              { onConflict: "endpoint" },
            );
          if (error) return createErrorResponse(500, "Could not save");
          return json({ saved: true });
        }

        if (req.method === "DELETE") {
          const endpoint =
            typeof body?.endpoint === "string" ? body.endpoint : "";
          // Only your own devices.
          await supabaseAdmin
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", endpoint)
            .eq("user_id", user!.id);
          return json({ removed: true });
        }

        return createErrorResponse(405, "Method Not Allowed");
      }),
    ),
  ),
);
