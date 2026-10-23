import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, parseOnboarding } from "./onboardRules.ts";

const valid = {
  organisation_name: "  Harbour Glazing  ",
  first_name: "Sam",
  last_name: "Reid",
  email: "Sam@Harbour.example",
  password: "a-long-password",
};

describe("parseOnboarding", () => {
  it("accepts a complete sign-up and trims and lowercases what it keeps", () => {
    expect(parseOnboarding(valid)).toEqual({
      ok: true,
      value: {
        organisationName: "Harbour Glazing",
        firstName: "Sam",
        lastName: "Reid",
        email: "sam@harbour.example",
        password: "a-long-password",
      },
    });
  });

  it("refuses a missing or non-object body", () => {
    expect(parseOnboarding(null).ok).toBe(false);
    expect(parseOnboarding("hello").ok).toBe(false);
  });

  it("needs a business name, a name and a valid email", () => {
    expect(parseOnboarding({ ...valid, organisation_name: "A" }).ok).toBe(
      false,
    );
    expect(parseOnboarding({ ...valid, last_name: "  " }).ok).toBe(false);
    expect(parseOnboarding({ ...valid, email: "not-an-email" }).ok).toBe(false);
  });

  it("needs a password of the minimum length", () => {
    const short = "x".repeat(MIN_PASSWORD_LENGTH - 1);
    const result = parseOnboarding({ ...valid, password: short });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toContain(String(MIN_PASSWORD_LENGTH));
  });
});
