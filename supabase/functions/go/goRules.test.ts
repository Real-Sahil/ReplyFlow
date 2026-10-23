import { describe, expect, it } from "vitest";
import { buildRedirect, CODE_PATTERN } from "./goRules.ts";

describe("buildRedirect", () => {
  it("adds the campaign tags to a product page", () => {
    expect(
      buildRedirect("https://mereandrow.co.uk/sofas/harlow", "post-42"),
    ).toBe(
      "https://mereandrow.co.uk/sofas/harlow?utm_source=facebook&utm_medium=social&utm_campaign=post-42",
    );
  });

  it("keeps the campaign already on the address", () => {
    expect(
      buildRedirect("https://mereandrow.co.uk/?utm_campaign=spring", "post-42"),
    ).toBe("https://mereandrow.co.uk/?utm_campaign=spring");
  });

  it("refuses anything that is not a secure web address", () => {
    expect(buildRedirect("http://mereandrow.co.uk/", "post-1")).toBeNull();
    expect(buildRedirect("javascript:alert(1)", "post-1")).toBeNull();
    expect(buildRedirect("not a url", "post-1")).toBeNull();
  });
});

describe("CODE_PATTERN", () => {
  it("accepts an eight character lower-case code only", () => {
    expect(CODE_PATTERN.test("a1b2c3d4")).toBe(true);
    expect(CODE_PATTERN.test("A1B2C3D4")).toBe(false);
    expect(CODE_PATTERN.test("short")).toBe(false);
  });
});
