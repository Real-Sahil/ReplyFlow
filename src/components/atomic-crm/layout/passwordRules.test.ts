import { describe, expect, it } from "vitest";

import { passwordProblem } from "./passwordRules";

describe("passwordProblem", () => {
  it("asks for a longer password", () => {
    expect(passwordProblem("short", "short")).toMatch(/at least 10/);
  });
  it("asks for the two to match", () => {
    expect(passwordProblem("a-long-enough-one", "a-long-enough-two")).toMatch(
      /do not match/,
    );
  });
  it("accepts a good one", () => {
    expect(
      passwordProblem("a-long-enough-one", "a-long-enough-one"),
    ).toBeNull();
  });
});
