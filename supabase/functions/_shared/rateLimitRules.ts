// Pure rules for rate limiting and error logging, kept apart from the database calls so
// they can be unit tested with vitest.

export type Limit = { limit: number; windowSeconds: number };

const MINUTE = 60;
const HOUR = 60 * MINUTE;

// Per signed-in user, per function. A person using the app never gets near these; a
// script looping on one endpoint does. Anything not listed gets DEFAULT_LIMIT.
export const DEFAULT_LIMIT: Limit = { limit: 120, windowSeconds: MINUTE };

export const FUNCTION_LIMITS: Record<string, Limit> = {
  messenger_send: { limit: 60, windowSeconds: MINUTE },
  comments_action: { limit: 60, windowSeconds: MINUTE },
  post_publish: { limit: 20, windowSeconds: MINUTE },
  post_autopilot: { limit: 20, windowSeconds: MINUTE },
  meta_pages: { limit: 60, windowSeconds: MINUTE },
  meta_connect: { limit: 10, windowSeconds: MINUTE },
  users: { limit: 30, windowSeconds: MINUTE },
  update_password: { limit: 5, windowSeconds: MINUTE },
  log_client_error: { limit: 20, windowSeconds: MINUTE },
};

// Public endpoints are limited per client address instead.
export const SIGNUP_LIMIT: Limit = { limit: 5, windowSeconds: HOUR };
export const ENQUIRY_LIMIT: Limit = { limit: 60, windowSeconds: HOUR };

export const limitFor = (functionName: string): Limit =>
  FUNCTION_LIMITS[functionName] ?? DEFAULT_LIMIT;

// The function name from a request path. Hosted requests look like /functions/v1/<name>/...,
// while inside the runtime the prefix may already be removed, leaving /<name>/...
export const functionName = (pathname: string): string => {
  const parts = pathname.split("/").filter(Boolean);
  const afterVersion = parts.indexOf("v1");
  return (afterVersion >= 0 ? parts[afterVersion + 1] : parts[0]) ?? "unknown";
};

// The caller's address, as the platform's proxy reports it.
export const clientAddress = (headers: Headers): string => {
  const direct = headers.get("cf-connecting-ip")?.trim();
  if (direct) return direct;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
};

// Keeps stored errors a sensible size, so one bad loop cannot fill the table.
export const clip = (value: unknown, max: number): string => {
  const text =
    typeof value === "string"
      ? value
      : value instanceof Error
        ? value.message
        : (JSON.stringify(value) ?? String(value));
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
