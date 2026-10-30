// Based on https://github.com/supabase/supabase/blob/master/examples/edge-functions/supabase/functions/_shared/jwt/default.ts
import * as jose from "jsr:@panva/jose@6";
import { createClient, type User } from "jsr:@supabase/supabase-js@2";
import { logError, organisationOfUser } from "./errorLog.ts";
import { checkRateLimit, tooManyRequests } from "./rateLimit.ts";
import { clip, functionName, limitFor } from "./rateLimitRules.ts";
import { createErrorResponse } from "./utils.ts";

const SUPABASE_JWT_ISSUER =
  Deno.env.get("SB_JWT_ISSUER") ?? Deno.env.get("SUPABASE_URL") + "/auth/v1";

const SUPABASE_JWT_KEYS = jose.createRemoteJWKSet(
  new URL(Deno.env.get("SUPABASE_URL")! + "/auth/v1/.well-known/jwks.json"),
);

function getAuthToken(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw new Error("Missing authorization header");
  }
  const [bearer, token] = authHeader.split(" ");
  if (bearer !== "Bearer") {
    throw new Error(`Auth header is not 'Bearer {token}'`);
  }

  return token;
}

function verifySupabaseJWT(jwt: string) {
  return jose.jwtVerify(jwt, SUPABASE_JWT_KEYS, {
    issuer: SUPABASE_JWT_ISSUER,
  });
}

/**
 * Validates the Authorization header to ensure that a user is authenticated.
 */
export const AuthMiddleware = async (
  req: Request,
  next: (req: Request) => Promise<Response>,
) => {
  if (req.method === "OPTIONS") return await next(req);

  try {
    const token = getAuthToken(req);
    const isValidJWT = await verifySupabaseJWT(token);

    if (isValidJWT) return await next(req);

    return createErrorResponse(401, "Invalid authentication");
  } catch (e) {
    return createErrorResponse(401, e?.toString() || "Unauthorized");
  }
};

/**
 * Get the authenticated user using the authorization header.
 * User will be undefined for OPTIONS requests.
 */
export const UserMiddleware = async (
  req: Request,
  next: (req: Request, user?: User) => Promise<Response>,
) => {
  if (req.method === "OPTIONS") return await next(req);

  let user: User | undefined;
  try {
    const authHeader = req.headers.get("Authorization")!;
    const localClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      // SB_PUBLISHABLE_KEY is optional: Supabase injects the project's public
      // key into every function as SUPABASE_ANON_KEY.
      Deno.env.get("SB_PUBLISHABLE_KEY") ??
        Deno.env.get("SUPABASE_ANON_KEY") ??
        "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data, error: authError } = await localClient.auth.getUser();
    if (!data?.user || authError) {
      return createErrorResponse(401, "Unauthorized");
    }
    user = data.user;
  } catch (err) {
    return createErrorResponse(401, err?.toString() || "Unauthorized");
  }
  if (!user) return createErrorResponse(401, "Unauthorized");

  // Every signed-in function gets the same limit per user, then reports its own failures.
  const name = functionName(new URL(req.url).pathname);
  const rate = await checkRateLimit(`user:${user.id}:${name}`, limitFor(name));
  if (!rate.allowed) return tooManyRequests(rate.retryAfter);

  try {
    const response = await next(req, user);
    if (response.status >= 500) {
      const body = await response
        .clone()
        .text()
        .catch(() => "");
      await logError(
        `function:${name}`,
        `Responded ${response.status}: ${clip(body, 300)}`,
        { method: req.method, status: response.status },
        await organisationOfUser(user.id),
      );
    }
    return response;
  } catch (err) {
    await logError(
      `function:${name}`,
      err,
      { method: req.method },
      await organisationOfUser(user.id),
    );
    return createErrorResponse(500, "Something went wrong. Try again.");
  }
};
