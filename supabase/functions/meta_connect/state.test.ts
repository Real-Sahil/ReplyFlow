import { describe, expect, it } from "vitest";
import { signState, STATE_TTL_MS, verifyState } from "./state";

const SECRET = "test-app-secret";
const NOW = Date.UTC(2026, 9, 23, 9, 0, 0);

describe("signed connect state", () => {
  it("accepts a genuine state and returns the administrator", async () => {
    const state = await signState(SECRET, "42", NOW, "abc123");
    expect(await verifyState(SECRET, state, NOW)).toBe("42");
  });

  it("rejects a state signed with another secret", async () => {
    const state = await signState("other-secret", "42", NOW, "abc123");
    expect(await verifyState(SECRET, state, NOW)).toBeNull();
  });

  it("rejects a state whose administrator was changed", async () => {
    const state = await signState(SECRET, "42", NOW, "abc123");
    const forged = state.replace(/^42\./, "7.");
    expect(await verifyState(SECRET, forged, NOW)).toBeNull();
  });

  it("rejects a state after it expires", async () => {
    const state = await signState(SECRET, "42", NOW, "abc123");
    expect(await verifyState(SECRET, state, NOW + STATE_TTL_MS)).toBeNull();
    expect(await verifyState(SECRET, state, NOW + STATE_TTL_MS - 1)).toBe("42");
  });

  it("rejects malformed input", async () => {
    expect(await verifyState(SECRET, "", NOW)).toBeNull();
    expect(await verifyState(SECRET, "a.b.c", NOW)).toBeNull();
    expect(await verifyState(SECRET, "x.1.2.3", NOW)).toBeNull();
  });
});
