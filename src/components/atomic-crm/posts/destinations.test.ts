import { describe, expect, it } from "vitest";

import {
  health,
  overrideFor,
  planDestinations,
  platformOf,
  stateText,
  stateTone,
  targetState,
  valuesFor,
  wordingFrom,
  type DestinationRow,
} from "./destinations";

const row = (
  key: string,
  state: DestinationRow["state"],
  over: Partial<DestinationRow> = {},
): DestinationRow => ({
  id: 1,
  post_id: 9,
  channel_key: key,
  state,
  text_override: null,
  scheduled_for: null,
  external_id: null,
  error: null,
  posted_at: null,
  ...over,
});

describe("health", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  it("is fine without an expiry, soon within a week, expired when gone", () => {
    expect(health(null, now)).toBe("ok");
    expect(health("2026-12-30T00:00:00Z", now)).toBe("ok");
    expect(health("2026-11-14T00:00:00Z", now)).toBe("soon");
    expect(health("2026-11-09T00:00:00Z", now)).toBe("expired");
  });
});

describe("planDestinations", () => {
  const existing = [
    row("linkedin:page:1", "planned"),
    row("linkedin:page:2", "published"),
    row("linkedin:page:3", "failed"),
    row("linkedin:page:4", "removed"),
  ];
  it("adds what is new, removes what is un-ticked and unsent, keeps the rest", () => {
    const plan = planDestinations(
      existing,
      new Set(["linkedin:page:1", "linkedin:page:5", "linkedin:page:4"]),
    );
    expect(plan.add).toEqual(["linkedin:page:5"]);
    expect(plan.remove.map((r) => r.channel_key)).toEqual(["linkedin:page:3"]);
    expect(plan.keep.map((r) => r.channel_key)).toEqual([
      "linkedin:page:1",
      "linkedin:page:4",
    ]);
  });
  it("never removes a destination that has already been posted", () => {
    expect(
      planDestinations(existing, new Set()).remove.map((r) => r.channel_key),
    ).toEqual(["linkedin:page:1", "linkedin:page:3"]);
  });
});

describe("targetState", () => {
  it("schedules when the post is scheduled or approved with a time, otherwise plans", () => {
    const when = "2026-11-20T10:00:00.000Z";
    expect(targetState("schedule", when)).toEqual({
      state: "scheduled",
      scheduled_for: when,
    });
    expect(targetState("approve", when).state).toBe("scheduled");
    expect(targetState("approve", null).state).toBe("planned");
    expect(targetState("draft", when)).toEqual({
      state: "planned",
      scheduled_for: null,
    });
    expect(targetState("publish", when).state).toBe("planned");
  });
});

describe("stateText and stateTone", () => {
  it("says where each destination stands", () => {
    expect(
      stateText({ state: "planned", scheduled_for: null, error: null }),
    ).toContain("not posted");
    expect(
      stateText({ state: "published", scheduled_for: null, error: null }),
    ).toBe("Posted");
    expect(
      stateText({ state: "failed", scheduled_for: null, error: "Expired" }),
    ).toBe("Did not go out: Expired");
    expect(
      stateText({
        state: "scheduled",
        scheduled_for: "2026-11-20T10:00:00Z",
        error: null,
      }),
    ).toContain("Scheduled for");
    expect(stateTone("published")).toBe("good");
    expect(stateTone("failed")).toBe("bad");
    expect(stateTone("scheduled")).toBe("wait");
  });
});

describe("wording", () => {
  it("reads the version in use and turns it back into an override", () => {
    const rows = [row("a", "planned", { text_override: "LinkedIn words" })];
    expect(wordingFrom(rows)).toEqual({
      mode: "linkedin",
      text: "LinkedIn words",
    });
    expect(wordingFrom([row("a", "planned")])).toEqual({
      mode: "written",
      text: "",
    });
    expect(overrideFor({ mode: "linkedin", text: " Hi " })).toBe("Hi");
    expect(overrideFor({ mode: "written", text: "Hi" })).toBeNull();
    expect(overrideFor({ mode: "linkedin", text: "  " })).toBeNull();
  });
});

describe("platformOf and valuesFor", () => {
  const when = "2026-11-20T10:00:00.000Z";
  const words = { mode: "linkedin" as const, text: "LinkedIn words" };
  it("knows the platform of a channel", () => {
    expect(platformOf("facebook:page:1")).toBe("facebook");
    expect(platformOf("linkedin:profile:2")).toBe("linkedin");
    expect(platformOf("x:y:3")).toBeNull();
  });
  it("sends a Facebook Page the post's own words and never marks it scheduled itself", () => {
    expect(valuesFor("facebook:page:1", "schedule", when, words)).toEqual({
      text_override: null,
      state: "planned",
      scheduled_for: null,
    });
  });
  it("gives a LinkedIn destination the LinkedIn words and the schedule", () => {
    expect(valuesFor("linkedin:page:1", "schedule", when, words)).toEqual({
      text_override: "LinkedIn words",
      state: "scheduled",
      scheduled_for: when,
    });
    expect(
      valuesFor("linkedin:page:1", "publish", when, {
        mode: "written",
        text: "",
      }),
    ).toEqual({
      text_override: null,
      state: "planned",
      scheduled_for: null,
    });
  });
});
