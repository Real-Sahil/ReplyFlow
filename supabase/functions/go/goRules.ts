// Pure helpers for tracked links. Kept free of Deno-only APIs so they can be unit tested.

export const CODE_PATTERN = /^[a-z0-9]{8}$/;

// Adds the campaign tags to the product page address, unless the address already has a
// campaign. Only secure (https) addresses are used.
export const buildRedirect = (
  target: string,
  campaign: string,
): string | null => {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!url.searchParams.has("utm_campaign")) {
    url.searchParams.set("utm_source", "facebook");
    url.searchParams.set("utm_medium", "social");
    url.searchParams.set("utm_campaign", campaign);
  }
  return url.toString();
};
