import { describe, expect, it } from "vitest";

import {
  MAX_PAGES,
  orgIdsFromAcls,
  pageName,
  pagesAuthorizeUrl,
} from "./rules.ts";

describe("pagesAuthorizeUrl", () => {
  it("asks for the Page permissions only, with the Pages app's own client id", () => {
    const url = new URL(
      pagesAuthorizeUrl({
        clientId: "pages-app",
        redirectUri: "https://x.test/cb",
        state: "s",
      }),
    );
    expect(url.searchParams.get("client_id")).toBe("pages-app");
    const scope = url.searchParams.get("scope") ?? "";
    expect(scope).toContain("w_organization_social");
    expect(scope).not.toContain("w_member_social");
    expect(scope).not.toContain("r_ads");
  });
});

describe("orgIdsFromAcls", () => {
  it("reads Page numbers, drops duplicates and anything else", () => {
    expect(
      orgIdsFromAcls({
        elements: [
          { organization: "urn:li:organization:11" },
          { organization: "urn:li:organization:11" },
          { organization: "urn:li:person:5" },
          { organization: "urn:li:organization:abc" },
          { organization: "urn:li:organization:22" },
          {},
        ],
      }),
    ).toEqual(["11", "22"]);
  });
  it("caps the number of Pages", () => {
    const elements = Array.from({ length: 30 }, (_, i) => ({
      organization: `urn:li:organization:${i + 1}`,
    }));
    expect(orgIdsFromAcls({ elements })).toHaveLength(MAX_PAGES);
  });
  it("copes with an empty answer", () => {
    expect(orgIdsFromAcls({})).toEqual([]);
  });
});

describe("pageName", () => {
  it("falls back to the number", () => {
    expect(pageName({ localizedName: " Acme Ltd " }, "9")).toBe("Acme Ltd");
    expect(pageName({}, "9")).toBe("Page 9");
  });
});
