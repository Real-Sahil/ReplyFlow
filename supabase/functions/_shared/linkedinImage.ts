// Sending a post's photo to LinkedIn. LinkedIn takes a photo in two steps: ask where to upload it, then
// upload the bytes; the post then refers to the uploaded image. The pure checks are kept apart so they can
// be tested.

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// The photo types the app accepts when a person uploads one (and LinkedIn takes).
export const imageTypeOk = (contentType: string | null | undefined) =>
  /^image\/(jpeg|png)\b/i.test(contentType ?? "");

// The server fetches a product's photo address itself, so only an ordinary public https address is allowed:
// no other scheme, no address typed as numbers, no local or internal names.
export const safeImageUrl = (value: unknown): URL | null => {
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":")
  ) {
    return null;
  }
  return url;
};

export const initializeUploadBody = (ownerUrn: string) => ({
  initializeUploadRequest: { owner: ownerUrn },
});

// What LinkedIn returns for the first step: where to upload, and the image's urn.
export const parseUpload = (json: {
  value?: { uploadUrl?: unknown; image?: unknown };
}): { uploadUrl: string; imageUrn: string } | null => {
  const uploadUrl = json?.value?.uploadUrl;
  const imageUrn = json?.value?.image;
  if (
    typeof uploadUrl !== "string" ||
    !uploadUrl.startsWith("https://") ||
    typeof imageUrn !== "string" ||
    !/^urn:li:image:[A-Za-z0-9_-]{1,60}$/.test(imageUrn)
  ) {
    return null;
  }
  return { uploadUrl, imageUrn };
};

// A post body with the photo attached.
export const withImage = <T extends object>(
  body: T,
  imageUrn: string,
  altText: string,
) => ({
  ...body,
  content: { media: { id: imageUrn, altText: altText.slice(0, 120) } },
});

export type LoadedImage = { bytes: Uint8Array; contentType: string };

// Loads the photo of a post: the uploaded file from the private bucket, else the product's photo address.
// Returns null when there is no usable photo. Never throws for a missing or unsuitable photo.
export const loadPostImage = async (
  post: {
    media_path?: string | null;
    media_type?: string | null;
    image_url?: string | null;
  },
  storage: {
    download: (path: string) => Promise<{ data: Blob | null; error: unknown }>;
  },
): Promise<LoadedImage | null> => {
  if (post.media_path) {
    const { data, error } = await storage.download(post.media_path);
    if (error || !data) return null;
    const contentType = post.media_type || data.type;
    if (!imageTypeOk(contentType) || data.size > MAX_IMAGE_BYTES) return null;
    return {
      bytes: new Uint8Array(await data.arrayBuffer()),
      contentType: contentType.split(";")[0],
    };
  }
  const url = safeImageUrl(post.image_url);
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const contentType = response.headers.get("content-type");
    const length = Number(response.headers.get("content-length") ?? 0);
    if (!response.ok || !imageTypeOk(contentType) || length > MAX_IMAGE_BYTES) {
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) return null;
    return { bytes, contentType: (contentType ?? "").split(";")[0] };
  } catch {
    return null;
  }
};

// Uploads the photo and returns its urn. Throws when LinkedIn refuses a step.
export const uploadImage = async (
  token: string,
  version: string,
  ownerUrn: string,
  image: LoadedImage,
): Promise<string> => {
  const init = await fetch(
    "https://api.linkedin.com/rest/images?action=initializeUpload",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "LinkedIn-Version": version,
        "X-Restli-Protocol-Version": "2.0.0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(initializeUploadBody(ownerUrn)),
      signal: AbortSignal.timeout(15000),
    },
  );
  const parsed = init.ok
    ? parseUpload(await init.json().catch(() => ({})))
    : null;
  if (!parsed)
    throw new Error(`LinkedIn would not take the photo (${init.status})`);
  const put = await fetch(parsed.uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": image.contentType,
    },
    body: image.bytes,
    signal: AbortSignal.timeout(30000),
  });
  if (!put.ok) throw new Error(`The photo upload failed (${put.status})`);
  return parsed.imageUrn;
};
