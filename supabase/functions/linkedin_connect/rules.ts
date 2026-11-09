// The parts of connecting LinkedIn that need no network, kept apart so they can be tested.

export const LINKEDIN_SCOPES = "openid profile w_member_social";

export const authorizeUrl = (params: {
  clientId: string;
  redirectUri: string;
  state: string;
}) =>
  `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    state: params.state,
    scope: LINKEDIN_SCOPES,
  })}`;

// LinkedIn says how many seconds the token lasts. Without a sensible number, assume the shortest
// useful stretch (one day) so the person is asked to reconnect soon rather than posting into a failure.
export const expiryFrom = (now: number, expiresIn: unknown): Date => {
  const seconds = Number(expiresIn);
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 86_400;
  return new Date(now + safe * 1000);
};

// What the app is sent back with. Kept to a short list so a hand-made address cannot show odd text.
export const outcomeFor = (error: string | null): string => {
  if (!error) return "connect=failed";
  if (error === "user_cancelled_login" || error === "user_cancelled_authorize")
    return "connect=cancelled";
  if (error === "unauthorized_scope_error" || error === "access_denied")
    return "connect=scope";
  return "connect=failed";
};
