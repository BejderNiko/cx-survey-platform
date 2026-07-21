import { describe, expect, it } from "vitest";
import { computeCes, computeCsat, computeNps } from "../src/metrics";

describe("computeNps", () => {
  it("matches the canonical fixture: %promoters - %detractors", () => {
    // 10 responses: 4 promoters (9,10,9,10), 3 passives (7,8,7), 3 detractors (0,3,6)
    const values = [9, 10, 9, 10, 7, 8, 7, 0, 3, 6];
    const r = computeNps(values);
    expect(r.promoters).toBe(4);
    expect(r.passives).toBe(3);
    expect(r.detractors).toBe(3);
    expect(r.valid).toBe(10);
    expect(r.excluded).toBe(0);
    expect(r.score).toBe(10); // 40% - 30% = +10
  });

  it("uses the 9-10 / 7-8 / 0-6 banding exactly at the boundaries", () => {
    expect(computeNps([9]).promoters).toBe(1);
    expect(computeNps([8]).passives).toBe(1);
    expect(computeNps([7]).passives).toBe(1);
    expect(computeNps([6]).detractors).toBe(1);
    expect(computeNps([0]).detractors).toBe(1);
    expect(computeNps([10]).promoters).toBe(1);
  });

  it("excludes missing, out-of-range, and non-integer values from the denominator", () => {
    const r = computeNps([10, null, undefined, "", 11, -1, 7.5, "9", 0]);
    expect(r.valid).toBe(3); // 10, "9" (coerced), 0
    expect(r.excluded).toBe(6);
    expect(r.promoters).toBe(2);
    expect(r.detractors).toBe(1);
    expect(r.score).toBe(33.3); // (2-1)/3 = 33.333 -> 33.3
  });

  it("returns null score with zero valid responses", () => {
    expect(computeNps([]).score).toBeNull();
    expect(computeNps([null, "x"]).score).toBeNull();
  });

  it("reaches -100 and +100 at the extremes", () => {
    expect(computeNps([0, 1, 2]).score).toBe(-100);
    expect(computeNps([9, 10]).score).toBe(100);
  });
});

describe("computeCsat", () => {
  it("computes % of 4-5 ratings on the 1-5 scale", () => {
    const r = computeCsat([5, 4, 3, 2, 1, 4]);
    expect(r.valid).toBe(6);
    expect(r.satisfied).toBe(3);
    expect(r.score).toBe(50);
    expect(r.mean).toBe(3.17);
  });
  it("handles empty input", () => {
    expect(computeCsat([]).score).toBeNull();
  });
});

describe("computeCes", () => {
  it("computes mean effort and % low effort (5-7) on the 1-7 scale", () => {
    const r = computeCes([7, 6, 5, 4, 1]);
    expect(r.valid).toBe(5);
    expect(r.lowEffort).toBe(3);
    expect(r.mean).toBe(4.6);
    expect(r.pctLowEffort).toBe(60);
  });
});
