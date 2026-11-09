// The parts of connecting company Pages that need no network. Pure, so they can be tested.

// Read and write posts and comments on the Pages the person administers, and list those Pages.
export const PAGES_SCOPES =
  "r_organization_social w_organization_social r_organization_admin";

export const pagesAuthorizeUrl = (params: {
  clientId: string;
  redirectUri: string;
  state: string;
}) =>
  `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    state: params.state,
    scope: PAGES_SCOPES,
  })}`;

export const MAX_PAGES = 10;

// The Pages the person administers, as numbers, from LinkedIn's role list. Duplicates and anything that
// is not a Page number are dropped, and the list is capped so one connection cannot save dozens.
export const orgIdsFromAcls = (json: {
  elements?: { organization?: unknown }[];
}): string[] => {
  const ids: string[] = [];
  for (const element of json.elements ?? []) {
    const urn = String(element.organization ?? "");
    const match = /^urn:li:organization:(\d{1,20})$/.exec(urn);
    if (match && !ids.includes(match[1])) ids.push(match[1]);
  }
  return ids.slice(0, MAX_PAGES);
};

// What to show for a Page when LinkedIn gives no name.
export const pageName = (json: { localizedName?: unknown }, orgId: string) =>
  String(json.localizedName ?? "").trim() || `Page ${orgId}`;
