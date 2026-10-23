import { describe, expect, it } from "vitest";
import { readSignedRequest, signPayload } from "./signedRequest.ts";

const encode = (obj: unknown) =>
  Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

describe("readSignedRequest", () => {
  const secret = "test-secret";

  it("accepts a correctly signed request and returns the user", async () => {
    const payload = encode({ algorithm: "HMAC-SHA256", user_id: "1234567" });
    const sig = await signPayload(secret, payload);
    expect(await readSignedRequest(`${sig}.${payload}`, secret)).toEqual({
      ok: true,
      userId: "1234567",
    });
  });

  it("refuses a request signed with another secret", async () => {
    const payload = encode({ user_id: "1" });
    const sig = await signPayload("other", payload);
    expect(await readSignedRequest(`${sig}.${payload}`, secret)).toEqual({
      ok: false,
    });
  });

  it("refuses a tampered payload", async () => {
    const payload = encode({ user_id: "1" });
    const sig = await signPayload(secret, payload);
    const tampered = encode({ user_id: "2" });
    expect(await readSignedRequest(`${sig}.${tampered}`, secret)).toEqual({
      ok: false,
    });
  });

  it("refuses when no secret is set or the text is not a request", async () => {
    expect(await readSignedRequest("abc.def", "")).toEqual({ ok: false });
    expect(await readSignedRequest("nodot", secret)).toEqual({ ok: false });
  });
});
