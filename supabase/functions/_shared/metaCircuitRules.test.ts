import { describe, expect, it } from "vitest";

import { actionBlockFrom, isActionBlock } from "./metaCircuitRules";

describe("action block detection", () => {
  it("treats Graph error 368 as a block", () => {
    expect(actionBlockFrom({ error: { code: 368, message: "blocked" } })).toBe(
      true,
    );
    expect(isActionBlock({ code: "368" })).toBe(true);
  });
  it("does not treat other errors as a block", () => {
    expect(actionBlockFrom({ error: { code: 100 } })).toBe(false);
    expect(actionBlockFrom({ error: { code: 4 } })).toBe(false); // rate limit
    expect(actionBlockFrom({})).toBe(false);
    expect(actionBlockFrom(null)).toBe(false);
  });
});
