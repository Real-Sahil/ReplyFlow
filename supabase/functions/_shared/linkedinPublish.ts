// Sending one post to one LinkedIn channel (a person's profile or a company Page), or taking it down. Used by
// both the function a person presses and the job that posts scheduled ones, so they behave the same. The token
// is read here on the server and never leaves it.

import { parseChannelKey } from "./destinations.ts";
import { loadPostImage, uploadImage, withImage } from "./linkedinImage.ts";
import {
  organizationUrn,
  personUrn,
  postBody,
  tooLong,
} from "./linkedinPostRules.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";

const API = "https://api.linkedin.com/rest/posts";
// LinkedIn versions its API by month and retires each version after about a year. If posts start failing
// with a "version not active" message in the logs, set LINKEDIN_API_VERSION to a newer month (YYYYMM).
const LINKEDIN_VERSION = Deno.env.get("LINKEDIN_API_VERSION") ?? "202605";

export class PublishError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "LinkedIn-Version": LINKEDIN_VERSION,
  "X-Restli-Protocol-Version": "2.0.0",
  "Content-Type": "application/json",
});

const EXPIRED_PROFILE = "Your LinkedIn connection has expired. Connect again.";
const EXPIRED_PAGE =
  "The LinkedIn Page connection has expired. An administrator needs to connect it again.";

// Who the post goes out as, and the token to do it with.
const authorFor = async (
  organisationId: number,
  channelKey: string,
  ownerSaleId: number | null,
): Promise<{ author: string; token: string; expired: string }> => {
  const channel = parseChannelKey(channelKey);
  if (!channel) throw new PublishError(400, "That channel is not available");

  if (channel.kind === "profile") {
    if (!ownerSaleId || String(ownerSaleId) !== channel.id) {
      throw new PublishError(403, "That is not your LinkedIn profile");
    }
    const { data: member } = await supabaseAdmin
      .from("linkedin_members")
      .select("member_id")
      .eq("organisation_id", organisationId)
      .eq("sale_id", ownerSaleId)
      .maybeSingle();
    if (!member) {
      throw new PublishError(
        409,
        "Connect your LinkedIn account first.",
        "not_connected",
      );
    }
    const { data: token } = await supabaseAdmin.rpc("linkedin_member_token", {
      p_organisation_id: organisationId,
      p_sale_id: ownerSaleId,
    });
    if (!token) throw new PublishError(409, EXPIRED_PROFILE, "expired");
    return {
      author: personUrn(member.member_id),
      token: String(token),
      expired: EXPIRED_PROFILE,
    };
  }

  const { data: page } = await supabaseAdmin
    .from("linkedin_pages")
    .select("org_id")
    .eq("organisation_id", organisationId)
    .eq("org_id", channel.id)
    .maybeSingle();
  if (!page) {
    throw new PublishError(
      409,
      "That LinkedIn Page is not connected.",
      "not_connected",
    );
  }
  const { data: token } = await supabaseAdmin.rpc("linkedin_page_token", {
    p_organisation_id: organisationId,
    p_org_id: channel.id,
  });
  if (!token) throw new PublishError(409, EXPIRED_PAGE, "expired");
  return {
    author: organizationUrn(channel.id),
    token: String(token),
    expired: EXPIRED_PAGE,
  };
};

export type PostForLinkedIn = {
  link_url: string | null;
  media_path?: string | null;
  media_type?: string | null;
  image_url?: string | null;
};

// Posts the words (and the post's photo, if it has a usable one) and returns LinkedIn's id for the post. If
// LinkedIn refuses the photo nothing is posted, so a post is never half-sent; a photo that cannot be used
// (another type, or missing) is skipped and the post goes out as text.
export const postToLinkedIn = async (args: {
  organisationId: number;
  channelKey: string;
  ownerSaleId: number | null;
  post: PostForLinkedIn;
  text: string;
}): Promise<{ urn: string; photo: "sent" | "none" | "skipped" }> => {
  const { organisationId, channelKey, ownerSaleId, post, text } = args;
  const { author, token, expired } = await authorFor(
    organisationId,
    channelKey,
    ownerSaleId,
  );
  if (tooLong(text, post.link_url)) {
    throw new PublishError(
      422,
      "This post is too long for LinkedIn (3,000 characters at most).",
    );
  }

  let imageUrn: string | null = null;
  let photo: "sent" | "none" | "skipped" = "none";
  const image = await loadPostImage(
    post,
    supabaseAdmin.storage.from("post-media"),
  );
  if (image) {
    try {
      imageUrn = await uploadImage(token, LINKEDIN_VERSION, author, image);
      photo = "sent";
    } catch (e) {
      console.error("LinkedIn photo failed", (e as Error).message);
      throw new PublishError(
        502,
        "LinkedIn did not accept the photo, so nothing was posted. Try again.",
      );
    }
  } else if (post.media_path || post.image_url) {
    photo = "skipped";
  }

  const body = postBody(author, text, post.link_url);
  let response: Response;
  try {
    response = await fetch(API, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(imageUrn ? withImage(body, imageUrn, text) : body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new PublishError(502, "Could not reach LinkedIn");
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    console.error(
      "LinkedIn post failed",
      response.status,
      detail?.code,
      detail?.message,
    );
    if (response.status === 401)
      throw new PublishError(409, expired, "expired");
    throw new PublishError(502, "LinkedIn did not accept the post.");
  }
  const urn = response.headers.get("x-restli-id");
  if (!urn) throw new PublishError(502, "LinkedIn did not confirm the post");
  return { urn, photo };
};

// Takes a post down. LinkedIn saying it is already gone is the outcome we want.
export const removeFromLinkedIn = async (args: {
  organisationId: number;
  channelKey: string;
  ownerSaleId: number | null;
  urn: string;
}) => {
  const { token } = await authorFor(
    args.organisationId,
    args.channelKey,
    args.ownerSaleId,
  );
  let response: Response;
  try {
    response = await fetch(`${API}/${encodeURIComponent(args.urn)}`, {
      method: "DELETE",
      headers: headers(token),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new PublishError(502, "Could not reach LinkedIn");
  }
  if (!response.ok && response.status !== 404) {
    console.error("LinkedIn delete failed", response.status);
    throw new PublishError(502, "LinkedIn did not remove the post");
  }
};
