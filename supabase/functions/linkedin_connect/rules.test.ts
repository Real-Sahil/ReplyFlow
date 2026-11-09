import { describe, expect, it } from "vitest";

import { authorizeUrl, expiryFrom, outcomeFor } from "./rules.ts";

describe("authorizeUrl", () => {
  it("asks for the sign-in and posting permissions and carries the state", () => {
    const url = new URL(
      authorizeUrl({
        clientId: "abc",
        redirectUri: "https://x.test/cb",
        state: "s.1.2.3",
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://www.linkedin.com/oauth/v2/authorization",
    );
    expect(url.searchParams.get("scope")).toBe(
      "openid profile w_member_social",
    );
    expect(url.searchParams.get("state")).toBe("s.1.2.3");
    expect(url.searchParams.get("redirect_uri")).toBe("https://x.test/cb");
    expect(url.searchParams.get("response_type")).toBe("code");
  });
});

describe("expiryFrom", () => {
  it("uses the number of seconds LinkedIn gives", () => {
    expect(expiryFrom(0, 5184000).getTime()).toBe(5184000 * 1000);
  });
  it("falls back to a day when the number is missing or silly", () => {
    expect(expiryFrom(0, undefined).getTime()).toBe(86_400_000);
    expect(expiryFrom(0, -5).getTime()).toBe(86_400_000);
  });
});

describe("outcomeFor", () => {
  it("maps LinkedIn's errors to a short list", () => {
    expect(outcomeFor("user_cancelled_login")).toBe("connect=cancelled");
    expect(outcomeFor("unauthorized_scope_error")).toBe("connect=scope");
    expect(outcomeFor("something_else")).toBe("connect=failed");
    expect(outcomeFor(null)).toBe("connect=failed");
  });
});
