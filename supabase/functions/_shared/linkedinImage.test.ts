import { describe, expect, it } from "vitest";

import {
  imageTypeOk,
  initializeUploadBody,
  loadPostImage,
  parseUpload,
  safeImageUrl,
  withImage,
} from "./linkedinImage.ts";

describe("imageTypeOk", () => {
  it("takes JPEG and PNG only", () => {
    expect(imageTypeOk("image/jpeg")).toBe(true);
    expect(imageTypeOk("image/png; charset=binary")).toBe(true);
    expect(imageTypeOk("image/webp")).toBe(false);
    expect(imageTypeOk("text/html")).toBe(false);
    expect(imageTypeOk(null)).toBe(false);
  });
});

describe("safeImageUrl", () => {
  it("allows an ordinary public https address", () => {
    expect(safeImageUrl("https://cdn.shop.example/a.jpg")?.hostname).toBe(
      "cdn.shop.example",
    );
  });
  it("refuses everything else", () => {
    for (const bad of [
      "http://cdn.shop.example/a.jpg",
      "https://localhost/a.jpg",
      "https://127.0.0.1/a.jpg",
      "https://10.0.0.5/a.jpg",
      "https://[::1]/a.jpg",
      "https://intranet/a.jpg",
      "https://user:pw@cdn.shop.example/a.jpg",
      "https://metadata.internal/a.jpg",
      "ftp://cdn.shop.example/a.jpg",
      "not a url",
      null,
    ]) {
      expect(safeImageUrl(bad)).toBeNull();
    }
  });
});

describe("LinkedIn upload steps", () => {
  it("asks to upload for an owner", () => {
    expect(initializeUploadBody("urn:li:person:abc")).toEqual({
      initializeUploadRequest: { owner: "urn:li:person:abc" },
    });
  });
  it("reads the upload address and the image urn, and rejects odd ones", () => {
    expect(
      parseUpload({
        value: {
          uploadUrl: "https://www.linkedin.com/up/1",
          image: "urn:li:image:C4E",
        },
      }),
    ).toEqual({
      uploadUrl: "https://www.linkedin.com/up/1",
      imageUrn: "urn:li:image:C4E",
    });
    expect(
      parseUpload({
        value: { uploadUrl: "http://x", image: "urn:li:image:A" },
      }),
    ).toBeNull();
    expect(
      parseUpload({ value: { uploadUrl: "https://x.test/u", image: "bad" } }),
    ).toBeNull();
    expect(parseUpload({})).toBeNull();
  });
  it("attaches the image to a post body with short alt text", () => {
    const body = withImage({ author: "a" }, "urn:li:image:A", "x".repeat(300));
    expect(body.content.media.id).toBe("urn:li:image:A");
    expect(body.content.media.altText).toHaveLength(120);
    expect(body.author).toBe("a");
  });
});

describe("loadPostImage", () => {
  const storage = (blob: Blob | null) => ({
    download: async () => ({ data: blob, error: blob ? null : new Error("x") }),
  });
  it("reads an uploaded photo from storage", async () => {
    const image = await loadPostImage(
      { media_path: "p/a.png", media_type: "image/png" },
      storage(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })),
    );
    expect(image?.contentType).toBe("image/png");
    expect(image?.bytes).toHaveLength(3);
  });
  it("gives nothing for a missing or unsuitable photo", async () => {
    expect(
      await loadPostImage(
        { media_path: "p/a.gif", media_type: "image/gif" },
        storage(new Blob(["x"], { type: "image/gif" })),
      ),
    ).toBeNull();
    expect(
      await loadPostImage({ media_path: "p/a.png" }, storage(null)),
    ).toBeNull();
    expect(
      await loadPostImage(
        { image_url: "http://insecure.example/a.jpg" },
        storage(null),
      ),
    ).toBeNull();
    expect(await loadPostImage({}, storage(null))).toBeNull();
  });
});
