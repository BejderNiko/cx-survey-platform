/**
 * Deterministic sampling for audience selection. The seed is recorded in the
 * distribution's audience snapshot so every selection is reproducible.
 */

/** mulberry32: small, fast, deterministic PRNG suitable for sampling (not crypto). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle with a seeded PRNG. Returns a new array. */
export function seededShuffle<T>(items: ReadonlyArray<T>, seed: number): T[] {
  const rng = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface SampleResult<T> {
  selected: T[];
  method: "random" | "handpicked" | "mixed";
  seed: number | null;
  requested: number;
}

/** Random sample of `count` items, deterministic for a given seed. */
export function randomSample<T>(items: ReadonlyArray<T>, count: number, seed: number): SampleResult<T> {
  const selected = seededShuffle(items, seed).slice(0, Math.max(0, count));
  return { selected, method: "random", seed, requested: count };
}
