import { describe, expect, it } from "vitest";

import type { AutoReplySettings } from "../messenger_webhook/autoReply";
import { nextOpening } from "./sendWindow";

// Monday to Friday, 09:00 to 18:00, London time.
const hours: AutoReplySettings = {
  auto_replies_enabled: true,
  greeting_text: "",
  away_enabled: true,
  away_text: "",
  timezone: "Europe/London",
  open_days: [1, 2, 3, 4, 5],
  open_from: "09:00",
  open_to: "18:00",
  qualify_enabled: false,
  question_1: null,
  question_2: null,
  question_3: null,
  closing_text: "",
};

describe("nextOpening", () => {
  it("returns now when already inside business hours", () => {
    const now = new Date("2026-10-22T10:00:00Z"); // Thursday 11:00 London
    expect(nextOpening(hours, now)?.getTime()).toBe(now.getTime());
  });

  it("waits for the next morning after close", () => {
    const friday = new Date("2026-10-23T19:30:00Z"); // Friday 20:30 London
    // Monday 26 October, 09:00 London (British Summer Time ends 25 October, so GMT)
    expect(nextOpening(hours, friday)?.toISOString()).toBe(
      "2026-10-26T09:00:00.000Z",
    );
  });

  it("waits until the opening minute, not a rounded slot", () => {
    const early = new Date("2026-10-22T07:50:00Z"); // Thursday 08:50 London
    expect(nextOpening(hours, early)?.toISOString()).toBe(
      "2026-10-22T08:00:00.000Z",
    );
  });

  it("returns null when no day is ever open", () => {
    expect(nextOpening({ ...hours, open_days: [] }, new Date())).toBeNull();
  });
});
