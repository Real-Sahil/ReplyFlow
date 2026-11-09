import { describe, expect, it } from "vitest";

import {
  authorizeUrl,
  detailFor,
  expiryFrom,
  hasAdsScope,
  nonceFor,
  outcomeFor,
  purposeFromState,
} from "./rules.ts";

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
    expect(outcomeFor("invalid_scope_error")).toBe("connect=scope");
    expect(outcomeFor("something_else")).toBe("connect=failed");
    expect(outcomeFor(null)).toBe("connect=failed");
  });
});

describe("purpose", () => {
  it("asks for the ads permissions only when the purpose is ads", () => {
    const base = {
      clientId: "a",
      redirectUri: "https://x.test/cb",
      state: "s",
    };
    expect(new URL(authorizeUrl(base)).searchParams.get("scope")).not.toContain(
      "r_ads",
    );
    expect(
      new URL(authorizeUrl({ ...base, purpose: "ads" })).searchParams.get(
        "scope",
      ),
    ).toContain("r_ads_reporting");
  });
  it("carries the purpose in the state's nonce", () => {
    expect(purposeFromState(`5.999.${nonceFor("ads", "abc")}.sig`)).toBe("ads");
    expect(purposeFromState(`5.999.${nonceFor("post", "abc")}.sig`)).toBe(
      "post",
    );
  });
  it("asks for the Page permissions, and no profile or ads ones, for pages", () => {
    const scope =
      new URL(
        authorizeUrl({
          clientId: "a",
          redirectUri: "https://x.test/cb",
          state: "s",
          purpose: "pages",
        }),
      ).searchParams.get("scope") ?? "";
    expect(scope).toContain("r_organization_admin");
    expect(scope).toContain("w_organization_social");
    expect(scope).not.toContain("r_ads");
    expect(scope).not.toContain("w_member_social");
    expect(purposeFromState(`5.999.${nonceFor("pages", "abc")}.sig`)).toBe(
      "pages",
    );
  });
  it("tells whether a token carries the ads reporting permission", () => {
    expect(hasAdsScope("openid,profile,w_member_social,r_ads_reporting")).toBe(
      true,
    );
    expect(hasAdsScope("openid profile w_member_social")).toBe(false);
    expect(hasAdsScope(null)).toBe(false);
  });
});

describe("detailFor", () => {
  it("keeps LinkedIn's sentence, drops odd characters and cuts it short", () => {
    expect(detailFor("The requested permission scope is not valid")).toBe(
      "The requested permission scope is not valid",
    );
    expect(detailFor("<script>alert(1)</script>")).toBe(
      "script alert(1) script",
    );
    expect(detailFor("a".repeat(500))).toHaveLength(200);
    expect(detailFor(null)).toBe("");
  });
});
