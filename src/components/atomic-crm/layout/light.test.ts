import { describe, expect, it } from "vitest";

import { ease, pointToLight, tiltToLight } from "./light";

describe("pointToLight", () => {
  it("is -1 at the left or top edge, 1 at the right or bottom, 0 in the middle", () => {
    expect(pointToLight(0, 0, 1000, 800)).toEqual({ x: -1, y: -1 });
    expect(pointToLight(1000, 800, 1000, 800)).toEqual({ x: 1, y: 1 });
    expect(pointToLight(500, 400, 1000, 800)).toEqual({ x: 0, y: 0 });
  });
  it("stays inside -1 to 1 when the pointer leaves the window", () => {
    expect(pointToLight(-50, 2000, 1000, 800)).toEqual({ x: -1, y: 1 });
  });
  it("copes with a zero-size screen", () => {
    expect(pointToLight(10, 10, 0, 0).x).toBe(1);
  });
});

describe("tiltToLight", () => {
  it("is neutral held at about 45 degrees and level", () => {
    expect(tiltToLight(0, 45)).toEqual({ x: 0, y: 0 });
  });
  it("leans with the phone and never goes past 0.9", () => {
    expect(tiltToLight(90, 45).x).toBeCloseTo(0.9);
    expect(tiltToLight(-90, 200).y).toBeCloseTo(0.9);
    expect(tiltToLight(-90, 0).x).toBeCloseTo(-0.9);
  });
});

describe("ease", () => {
  it("moves part of the way and settles", () => {
    const first = ease(0, 1);
    expect(first.value).toBeCloseTo(0.12);
    expect(first.settled).toBe(false);
    expect(ease(0.999, 1).settled).toBe(true);
  });
});
