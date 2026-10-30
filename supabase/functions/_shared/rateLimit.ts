import { corsHeaders } from "./cors.ts";
import type { Limit } from "./rateLimitRules.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";

// Counts one hit for the key. If the counter cannot be reached the request is allowed, so a
// database problem never locks everyone out of the app.
export const checkRateLimit = async (
  key: string,
  { limit, windowSeconds }: Limit,
): Promise<{ allowed: boolean; retryAfter: number }> => {
  try {
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { allowed: true, retryAfter: 0 };
    return {
      allowed: row.allowed === true,
      retryAfter: Number(row.retry_after ?? 0),
    };
  } catch (error) {
    console.error(
      "Rate limit check failed, allowing the request:",
      (error as Error).message,
    );
    return { allowed: true, retryAfter: 0 };
  }
};

export const tooManyRequests = (retryAfter: number) =>
  new Response(
    JSON.stringify({
      status: 429,
      message: "Too many requests. Try again in a moment.",
      code: "rate_limited",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.max(1, retryAfter)),
        ...corsHeaders,
      },
    },
  );
