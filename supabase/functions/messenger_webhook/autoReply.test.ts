import { describe, expect, it } from "vitest";

import {
  type AutoReplySettings,
  decideAutoReply,
  emptyState,
  isOpenNow,
} from "./autoReply";

const settings: AutoReplySettings = {
  auto_replies_enabled: true,
  greeting_text: "Hello",
  away_enabled: true,
  away_text: "We are closed",
  timezone: "Europe/London",
  open_days: [1, 2, 3, 4, 5],
  open_from: "09:00:00",
  open_to: "17:30:00",
  qualify_enabled: true,
  question_1: "Room size?",
  question_2: "Colour?",
  question_3: null,
  closing_text: "Thanks",
};

// 2026-10-21 is a Wednesday. In October the UK is on BST (UTC+1) until the 25th.
const openTime = new Date("2026-10-21T10:00:00Z"); // 11:00 in London
const closedTime = new Date("2026-10-21T20:00:00Z"); // 21:00 in London
const sunday = new Date("2026-10-25T12:00:00Z");

describe("isOpenNow", () => {
  it("uses the business time zone, weekdays and hours", () => {
    expect(isOpenNow(settings, openTime)).toBe(true);
    expect(isOpenNow(settings, closedTime)).toBe(false);
    expect(isOpenNow(settings, sunday)).toBe(false);
    expect(isOpenNow(settings, new Date("2026-10-21T16:30:00Z"))).toBe(false); // 17:30 London, closed
    expect(isOpenNow(settings, new Date("2026-10-21T16:29:00Z"))).toBe(true);
  });
});

describe("decideAutoReply", () => {
  const run = (over: Partial<Parameters<typeof decideAutoReply>[0]> = {}) =>
    decideAutoReply({
      settings,
      state: emptyState(),
      text: "Hi, do you have corner sofas?",
      now: openTime,
      humanActive: false,
      ...over,
    });

  it("does nothing when switched off or when staff are already replying", () => {
    expect(
      run({ settings: { ...settings, auto_replies_enabled: false } }).send,
    ).toEqual([]);
    expect(run({ humanActive: true }).send).toEqual([]);
  });

  it("greets a new conversation and asks the first question", () => {
    const result = run();
    expect(result.send).toEqual(["Hello", "Room size?"]);
    expect(result.state.step).toBe(1);
    expect(result.state.greeted_at).not.toBeNull();
  });

  it("adds the away message outside opening hours, once per 12 hours", () => {
    const first = run({ now: closedTime });
    expect(first.send).toEqual(["Hello", "We are closed", "Room size?"]);
    const again = run({
      now: new Date(closedTime.getTime() + 3600_000),
      state: first.state,
      text: "Big room",
    });
    expect(again.send).not.toContain("We are closed");
    const next_day = run({
      now: new Date(closedTime.getTime() + 24 * 3600_000),
      state: again.state,
      text: "Grey",
    });
    expect(next_day.send).toContain("We are closed");
  });

  it("records answers in order and finishes with the closing text", () => {
    let result = run();
    result = run({ state: result.state, text: "5m by 4m" });
    expect(result.send).toEqual(["Colour?"]);
    expect(result.state.answers.q1).toBe("5m by 4m");
    result = run({ state: result.state, text: "Dark grey velvet" });
    expect(result.send).toEqual(["Thanks"]);
    expect(result.state.done).toBe(true);
    expect(result.finishedAnswers).toEqual([
      { question: "Room size?", answer: "5m by 4m" },
      { question: "Colour?", answer: "Dark grey velvet" },
    ]);
    // After the flow is over the automation stays silent.
    expect(run({ state: result.state, text: "Thanks!" }).send).toEqual([]);
  });

  it("works with no questions at all: greeting only", () => {
    const result = run({ settings: { ...settings, qualify_enabled: false } });
    expect(result.send).toEqual(["Hello"]);
  });

  it("hands over to a person when asked, and then stays quiet", () => {
    const result = run({ text: "Can I speak to someone please" });
    expect(result.handoffRequested).toBe(true);
    expect(result.send).toHaveLength(1);
    expect(result.state.handoff).toBe(true);
    expect(run({ state: result.state, text: "hello?" }).send).toEqual([]);
  });

  it("does not treat ordinary sofa talk as a request for a person", () => {
    const result = run({
      text: "Do you have a 3 person sofa? Someone recommended you.",
    });
    expect(result.handoffRequested).toBe(false);
  });

  it("truncates very long answers", () => {
    const first = run();
    const result = run({ state: first.state, text: "x".repeat(900) });
    expect(result.state.answers.q1).toHaveLength(500);
  });
});
