// The parts of connecting LinkedIn that need no network, kept apart so they can be tested.

export type Purpose = "post" | "ads";

export const LINKEDIN_SCOPES = "openid profile w_member_social";
// Reading the business's ad accounts and their results. Asked for only by an administrator who wants the
// ads report, so a person who just wants to post is never asked for it.
export const ADS_SCOPES = `${LINKEDIN_SCOPES} r_ads r_ads_reporting`;

export const scopesFor = (purpose: Purpose) =>
  purpose === "ads" ? ADS_SCOPES : LINKEDIN_SCOPES;

// The purpose travels inside the signed state's nonce, so it cannot be changed on the way back.
export const nonceFor = (purpose: Purpose, random: string) =>
  `${purpose === "ads" ? "a" : "p"}${random}`;
export const purposeFromState = (state: string): Purpose =>
  state.split(".")[2]?.startsWith("a") ? "ads" : "post";

export const hasAdsScope = (scopes: string | null | undefined) =>
  (scopes ?? "").split(/[ ,]+/).includes("r_ads_reporting");

export const authorizeUrl = (params: {
  clientId: string;
  redirectUri: string;
  state: string;
  purpose?: Purpose;
}) =>
  `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    state: params.state,
    scope: scopesFor(params.purpose ?? "post"),
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
  if (
    error === "unauthorized_scope_error" ||
    error === "invalid_scope_error" ||
    error === "access_denied"
  )
    return "connect=scope";
  return "connect=failed";
};

// LinkedIn's own words for why it refused, shown to the administrator. It comes from outside, so it is cut to
// plain characters and a short length before it is put in an address.
export const detailFor = (description: string | null | undefined) =>
  String(description ?? "")
    .replace(/[^A-Za-z0-9 .,'():_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
