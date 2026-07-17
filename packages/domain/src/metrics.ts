/**
 * Versioned CX metric definitions. The active definition is snapshotted into
 * study_versions.metric_definitions at publish time so later changes to
 * wording or banding can never silently corrupt historical trends.
 */

export const NPS_DEFINITION_V1 = {
  id: "nps@1",
  scale: { min: 0, max: 10 },
  promoters: [9, 10],
  passives: [7, 8],
  detractors: [0, 1, 2, 3, 4, 5, 6],
  formula: "score = % promoters - % detractors (of valid responses)",
} as const;

export interface NpsResult {
  definitionId: string;
  promoters: number;
  passives: number;
  detractors: number;
  /** Valid responses = numeric answers within scale; the denominator. */
  valid: number;
  /** Answers excluded as missing/invalid/out of range. */
  excluded: number;
  /** Rounded to one decimal; null when there are no valid responses. */
  score: number | null;
}

export function computeNps(values: ReadonlyArray<unknown>): NpsResult {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  let excluded = 0;
  for (const raw of values) {
    const v = typeof raw === "number" ? raw : raw != null && raw !== "" ? Number(raw) : NaN;
    if (!Number.isInteger(v) || v < 0 || v > 10) {
      excluded += 1;
    } else if (v >= 9) {
      promoters += 1;
    } else if (v >= 7) {
      passives += 1;
    } else {
      detractors += 1;
    }
  }
  const valid = promoters + passives + detractors;
  const score =
    valid === 0 ? null : round1(((promoters - detractors) / valid) * 100);
  return { definitionId: NPS_DEFINITION_V1.id, promoters, passives, detractors, valid, excluded, score };
}

export const CSAT_DEFINITION_V1 = {
  id: "csat@1",
  scale: { min: 1, max: 5 },
  satisfied: [4, 5],
  formula: "score = % of valid responses rating 4 or 5 on the 1-5 scale",
} as const;

export interface CsatResult {
  definitionId: string;
  satisfied: number;
  valid: number;
  excluded: number;
  score: number | null; // percent satisfied
  mean: number | null;
}

export function computeCsat(values: ReadonlyArray<unknown>): CsatResult {
  let satisfied = 0;
  let excluded = 0;
  let sum = 0;
  let valid = 0;
  for (const raw of values) {
    const v = typeof raw === "number" ? raw : raw != null && raw !== "" ? Number(raw) : NaN;
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      excluded += 1;
    } else {
      valid += 1;
      sum += v;
      if (v >= 4) satisfied += 1;
    }
  }
  return {
    definitionId: CSAT_DEFINITION_V1.id,
    satisfied,
    valid,
    excluded,
    score: valid === 0 ? null : round1((satisfied / valid) * 100),
    mean: valid === 0 ? null : round2(sum / valid),
  };
}

export const CES_DEFINITION_V1 = {
  id: "ces@1",
  scale: { min: 1, max: 7 },
  lowEffort: [5, 6, 7],
  formula: "score = mean effort rating on the 1-7 scale (7 = very easy); also % rating 5-7",
} as const;

export interface CesResult {
  definitionId: string;
  lowEffort: number;
  valid: number;
  excluded: number;
  mean: number | null;
  pctLowEffort: number | null;
}

export function computeCes(values: ReadonlyArray<unknown>): CesResult {
  let lowEffort = 0;
  let excluded = 0;
  let sum = 0;
  let valid = 0;
  for (const raw of values) {
    const v = typeof raw === "number" ? raw : raw != null && raw !== "" ? Number(raw) : NaN;
    if (!Number.isInteger(v) || v < 1 || v > 7) {
      excluded += 1;
    } else {
      valid += 1;
      sum += v;
      if (v >= 5) lowEffort += 1;
    }
  }
  return {
    definitionId: CES_DEFINITION_V1.id,
    lowEffort,
    valid,
    excluded,
    mean: valid === 0 ? null : round2(sum / valid),
    pctLowEffort: valid === 0 ? null : round1((lowEffort / valid) * 100),
  };
}

export const METRIC_DEFINITIONS = {
  nps: NPS_DEFINITION_V1,
  csat: CSAT_DEFINITION_V1,
  ces: CES_DEFINITION_V1,
} as const;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
