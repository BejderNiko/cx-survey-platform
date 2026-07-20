import { describe, expect, it } from "vitest";
import { randomSample, seededShuffle } from "../src/sampling";

describe("seeded sampling", () => {
  const items = Array.from({ length: 100 }, (_, i) => `p${i}`);

  it("is deterministic for the same seed", () => {
    const a = randomSample(items, 10, 42);
    const b = randomSample(items, 10, 42);
    expect(a.selected).toEqual(b.selected);
    expect(a.seed).toBe(42);
  });

  it("differs across seeds", () => {
    const a = randomSample(items, 10, 1);
    const b = randomSample(items, 10, 2);
    expect(a.selected).not.toEqual(b.selected);
  });

  it("returns exactly the requested count and no duplicates", () => {
    const r = randomSample(items, 25, 7);
    expect(r.selected).toHaveLength(25);
    expect(new Set(r.selected).size).toBe(25);
  });

  it("caps at population size and preserves all items in a shuffle", () => {
    const r = randomSample(items, 500, 3);
    expect(r.selected).toHaveLength(100);
    expect([...seededShuffle(items, 9)].sort()).toEqual([...items].sort());
  });
});
