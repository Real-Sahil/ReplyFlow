import { describe, expect, it } from "vitest";

import {
  commentsUrl,
  parseComments,
  parsePerPost,
  perPostStatsUrls,
  postResults,
  parsePeople,
  peopleUrl,
  personIds,
  parseFollowers,
  parsePosts,
  parseShareStats,
  postsUrl,
  replyBody,
  validCommentUrn,
  validPostUrn,
  validReply,
} from "./activityRules.ts";

describe("urls", () => {
  it("percent-encode each urn", () => {
    expect(postsUrl("12")).toContain("author=urn%3Ali%3Aorganization%3A12");
    expect(commentsUrl("urn:li:share:9")).toContain(
      "/socialActions/urn%3Ali%3Ashare%3A9/comments",
    );
  });
});

describe("urn checks", () => {
  it("accept LinkedIn's shapes and nothing else", () => {
    expect(validPostUrn("urn:li:share:123")).toBe(true);
    expect(validPostUrn("urn:li:ugcPost:123")).toBe(true);
    expect(validPostUrn("urn:li:share:123/../x")).toBe(false);
    expect(validPostUrn(5)).toBe(false);
    expect(validCommentUrn("urn:li:comment:(urn:li:activity:1,2)")).toBe(true);
    expect(validCommentUrn("urn:li:comment:(x,2)")).toBe(false);
  });
});

describe("parsePosts", () => {
  it("keeps posts with a valid urn, newest data first as given", () => {
    const posts = parsePosts({
      elements: [
        { id: "urn:li:share:1", commentary: "Hello", publishedAt: 100 },
        { id: "bad", commentary: "x" },
      ],
    });
    expect(posts).toEqual([
      { urn: "urn:li:share:1", text: "Hello", publishedAt: 100 },
    ]);
  });
});

describe("parseComments", () => {
  const json = {
    elements: [
      {
        $URN: "urn:li:comment:(urn:li:share:1,22)",
        actor: "urn:li:person:abc",
        message: { text: "Nice" },
        created: { time: 200 },
      },
      {
        $URN: "urn:li:comment:(urn:li:share:1,21)",
        actor: "urn:li:organization:12",
        message: { text: "Thanks" },
        created: { time: 100 },
      },
    ],
  };
  it("orders oldest first and marks the Page's own replies", () => {
    const comments = parseComments(json, "12");
    expect(comments.map((c) => c.text)).toEqual(["Thanks", "Nice"]);
    expect(comments[0].fromPage).toBe(true);
    expect(comments[1].fromPage).toBe(false);
  });
});

describe("replyBody", () => {
  it("replies as the Page, and to a comment when one is given", () => {
    const body = replyBody(
      "12",
      "urn:li:share:1",
      "Thanks",
      "urn:li:comment:(urn:li:share:1,22)",
    );
    expect(body.actor).toBe("urn:li:organization:12");
    expect(body.object).toBe("urn:li:share:1");
    expect(body.parentComment).toContain("urn:li:comment:");
    expect(replyBody("12", "urn:li:share:1", "x")).not.toHaveProperty(
      "parentComment",
    );
  });
  it("accepts a sensible reply only", () => {
    expect(validReply("Thanks!")).toBe(true);
    expect(validReply("   ")).toBe(false);
    expect(validReply("a".repeat(1251))).toBe(false);
  });
});

describe("parseShareStats and parseFollowers", () => {
  it("reads the totals and works out engagement when LinkedIn does not", () => {
    const stats = parseShareStats({
      elements: [
        {
          totalShareStatistics: {
            impressionCount: 1000,
            clickCount: 20,
            likeCount: 30,
            commentCount: 5,
            shareCount: 5,
          },
        },
      ],
    });
    expect(stats.impressions).toBe(1000);
    expect(stats.engagementRate).toBeCloseTo(0.06);
  });
  it("copes with nothing", () => {
    expect(parseShareStats({}).impressions).toBe(0);
    expect(parseShareStats({}).engagementRate).toBeNull();
    expect(parseFollowers({ firstDegreeSize: 42 })).toBe(42);
    expect(parseFollowers({})).toBe(0);
  });
});

describe("commenters' names", () => {
  it("finds the people among the commenters, once each", () => {
    const comments = parseComments(
      {
        elements: [
          {
            $URN: "urn:li:comment:(urn:li:share:1,1)",
            actor: "urn:li:person:abc",
            message: { text: "a" },
            created: { time: 1 },
          },
          {
            $URN: "urn:li:comment:(urn:li:share:1,2)",
            actor: "urn:li:person:abc",
            message: { text: "b" },
            created: { time: 2 },
          },
          {
            $URN: "urn:li:comment:(urn:li:share:1,3)",
            actor: "urn:li:organization:99",
            message: { text: "c" },
            created: { time: 3 },
          },
        ],
      },
      "12",
    );
    expect(personIds(comments)).toEqual(["abc"]);
    expect(comments[2].personId).toBeNull();
  });
  it("builds LinkedIn's batch address", () => {
    expect(peopleUrl(["a", "b"])).toContain("/people?ids=List((id:a),(id:b))");
  });
  it("reads names, and a profile link when LinkedIn gives one", () => {
    const people = parsePeople({
      results: {
        "(id:abc)": {
          localizedFirstName: "Sam",
          localizedLastName: "Jones",
          vanityName: "sam-jones",
        },
        "(id:def)": {
          firstName: { localized: { en_GB: "Ana" } },
          lastName: { localized: { en_GB: "Lee" } },
        },
        "(id:ghi)": {},
      },
    });
    expect(people.abc).toEqual({
      name: "Sam Jones",
      url: "https://www.linkedin.com/in/sam-jones",
    });
    expect(people.def).toEqual({ name: "Ana Lee", url: null });
    expect(people.ghi).toBeUndefined();
  });
  it("copes with nothing", () => {
    expect(parsePeople({})).toEqual({});
  });
});

describe("per-post results", () => {
  it("asks for shares and ugcPosts separately", () => {
    const urls = perPostStatsUrls("12", [
      "urn:li:share:1",
      "urn:li:ugcPost:2",
      "urn:li:share:3",
    ]);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain(
      "shares=List(urn%3Ali%3Ashare%3A1,urn%3Ali%3Ashare%3A3)",
    );
    expect(urls[1]).toContain("ugcPosts=List(urn%3Ali%3AugcPost%3A2)");
    expect(perPostStatsUrls("12", [])).toEqual([]);
  });
  it("reads each post's engagement, using LinkedIn's figure or working it out", () => {
    const out = parsePerPost({
      elements: [
        { share: "urn:li:share:1", totalShareStatistics: { engagement: 0.05 } },
        {
          ugcPost: "urn:li:ugcPost:2",
          totalShareStatistics: {
            impressionCount: 100,
            clickCount: 2,
            likeCount: 3,
            commentCount: 0,
            shareCount: 0,
          },
        },
        {
          share: "urn:li:share:3",
          totalShareStatistics: { impressionCount: 0 },
        },
        { share: "bad" },
      ],
    });
    expect(out["urn:li:share:1"]).toBe(0.05);
    expect(out["urn:li:ugcPost:2"]).toBeCloseTo(0.05);
    expect(out["urn:li:share:3"]).toBeUndefined();
    expect(Object.keys(out)).toHaveLength(2);
  });
  it("keeps posts that have both a date and a result", () => {
    const results = postResults(
      [
        { urn: "urn:li:share:1", text: "", publishedAt: 1_700_000_000_000 },
        { urn: "urn:li:share:2", text: "", publishedAt: null },
        { urn: "urn:li:share:3", text: "", publishedAt: 1_700_000_000_000 },
      ],
      { "urn:li:share:1": 0.04, "urn:li:share:2": 0.1 },
    );
    expect(results).toEqual([
      { published_at: "2023-11-14T22:13:20.000Z", engagement: 0.04 },
    ]);
  });
});
