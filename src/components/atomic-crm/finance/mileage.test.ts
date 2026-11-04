import { describe, expect, it } from "vitest";

import { mileageAmountPence, mileageNote } from "./mileage";

describe("mileage", () => {
  it("works out the claim in pence", () => {
    expect(mileageAmountPence(100, 45)).toBe(4500);
    expect(mileageAmountPence(12.5, 45)).toBe(563);
    expect(mileageAmountPence(0, 45)).toBe(0);
  });
  it("writes a note that explains the amount", () => {
    expect(mileageNote(12.5, 45, "Delivery to Leeds")).toBe(
      "12.5 miles at 45p a mile: Delivery to Leeds",
    );
    expect(mileageNote(1, 25, " Post office ")).toBe(
      "1 mile at 25p a mile: Post office",
    );
  });
});
