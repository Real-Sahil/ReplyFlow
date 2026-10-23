import { describe, expect, it } from "vitest";
import { bestSlots, MIN_POSTS_PER_SLOT } from "./bestTime";

// January dates: London is on GMT then, so UTC and London time are the same.
// 5 January 2026 is a Monday.
const monday6pm = (week: number) =>
  new Date(Date.UTC(2026, 0, 5 + week * 7, 18, 0)).toISOString();
const tuesday9am = (week: number) =>
  new Date(Date.UTC(2026, 0, 6 + week * 7, 9, 0)).toISOString();

describe("bestSlots", () => {
  it("ranks slots by average engagement, read on the London clock", () => {
    const posts = [
      { published_at: monday6pm(0), engagement: 90 },
      { published_at: monday6pm(1), engagement: 110 },
      { published_at: monday6pm(2), engagement: 100 },
      { published_at: tuesday9am(0), engagement: 20 },
      { published_at: tuesday9am(1), engagement: 30 },
      { published_at: tuesday9am(2), engagement: 25 },
    ];
    const { slots, enough } = bestSlots(posts);
    expect(enough).toBe(true);
    expect(slots[0]).toEqual({ day: "Mon", hour: 18, average: 100, posts: 3 });
    expect(slots[1].day).toBe("Tue");
    expect(slots[1].hour).toBe(9);
  });

  it("does not recommend a slot with too few posts behind it", () => {
    const posts = Array.from({ length: MIN_POSTS_PER_SLOT - 1 }, (_, i) => ({
      published_at: monday6pm(i),
      engagement: 500,
    }));
    expect(bestSlots(posts)).toEqual({ slots: [], enough: false });
  });

  it("skips posts with a missing date or engagement", () => {
    expect(
      bestSlots([{ published_at: "not a date", engagement: 5 }]).enough,
    ).toBe(false);
  });
});
