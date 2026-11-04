import { describe, expect, it } from "vitest";

import { claimsMessage } from "./message.ts";

describe("claimsMessage", () => {
  it("words one claim", () => {
    expect(
      claimsMessage({
        name: "Sam Jones",
        count: 1,
        totalPence: 1250,
        flagged: 0,
      }),
    ).toEqual({
      title: "New expense claim",
      body: "Sam Jones sent a claim for £12.50.",
    });
  });
  it("words a sheet and warns about duplicates", () => {
    const m = claimsMessage({
      name: "Sam Jones",
      count: 12,
      totalPence: 18420,
      flagged: 2,
    });
    expect(m.title).toBe("12 new expense claims");
    expect(m.body).toBe(
      "Sam Jones sent 12 claims, £184.20 in all. 2 may be duplicates.",
    );
  });
  it("copes with a missing name", () => {
    expect(
      claimsMessage({ name: "", count: 1, totalPence: 500, flagged: 1 }).body,
    ).toBe("Someone sent a claim for £5.00. One may be a duplicate.");
  });
});
