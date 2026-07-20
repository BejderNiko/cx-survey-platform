import {
  type Condition,
  type InstrumentDefinition,
  type Question,
  allQuestions,
} from "./instrument";

/** Answer values keyed by question code. Multi-select answers are arrays. */
export type AnswerMap = Record<string, unknown>;

export function evaluateCondition(cond: Condition, answers: AnswerMap): boolean {
  const answer = answers[cond.questionCode];
  const answered = answer !== undefined && answer !== null && answer !== "" &&
    !(Array.isArray(answer) && answer.length === 0);
  switch (cond.op) {
    case "answered":
      return answered;
    case "not_answered":
      return !answered;
  }
  if (!answered) return false;
  const value = cond.value;
  const asNumber = (v: unknown) => (typeof v === "number" ? v : Number(v));
  switch (cond.op) {
    case "eq":
      return looseEquals(answer, value);
    case "ne":
      return !looseEquals(answer, value);
    case "lt":
      return asNumber(answer) < asNumber(value);
    case "lte":
      return asNumber(answer) <= asNumber(value);
    case "gt":
      return asNumber(answer) > asNumber(value);
    case "gte":
      return asNumber(answer) >= asNumber(value);
    case "in":
      return Array.isArray(value) && value.some((v) => looseEquals(answer, v));
    case "not_in":
      return Array.isArray(value) && !value.some((v) => looseEquals(answer, v));
    case "contains":
      return Array.isArray(answer)
        ? answer.some((a) => looseEquals(a, value))
        : String(answer).includes(String(value));
    default:
      return false;
  }
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (typeof a === "number" || typeof b === "number") {
    return Number(a) === Number(b);
  }
  return String(a) === String(b);
}

export function conditionsHold(conds: Condition[] | undefined, answers: AnswerMap): boolean {
  if (!conds || conds.length === 0) return true;
  return conds.every((c) => evaluateCondition(c, answers));
}

export type FlowStep =
  | { kind: "question"; question: Question }
  | { kind: "end" }
  | { kind: "disqualified" };

/**
 * Compute the next step after `fromCode` (or the first step when null),
 * honoring branch rules on the answered question and visibleIf on candidates.
 * Branches only jump forward (validated at publish), so evaluation terminates.
 */
export function nextStep(
  def: InstrumentDefinition,
  fromCode: string | null,
  answers: AnswerMap,
): FlowStep {
  const questions = allQuestions(def);
  let startIndex = 0;
  if (fromCode !== null) {
    const idx = questions.findIndex((q) => q.code === fromCode);
    if (idx === -1) return { kind: "end" };
    const from = questions[idx];
    for (const rule of from.branches ?? []) {
      if (conditionsHold(rule.when, answers)) {
        if (rule.goTo === "END") return { kind: "end" };
        if (rule.goTo === "DISQUALIFY") return { kind: "disqualified" };
        const target = questions.findIndex((q) => q.code === rule.goTo);
        if (target > idx) {
          startIndex = target;
          return firstVisibleFrom(questions, startIndex, answers);
        }
      }
    }
    startIndex = idx + 1;
  }
  return firstVisibleFrom(questions, startIndex, answers);
}

function firstVisibleFrom(questions: Question[], start: number, answers: AnswerMap): FlowStep {
  for (let i = start; i < questions.length; i++) {
    const q = questions[i];
    if (conditionsHold(q.visibleIf, answers)) {
      return { kind: "question", question: q };
    }
  }
  return { kind: "end" };
}

/** The full path a respondent with `answers` would traverse (for preview/tests). */
export function visiblePath(def: InstrumentDefinition, answers: AnswerMap): string[] {
  const path: string[] = [];
  let step = nextStep(def, null, answers);
  while (step.kind === "question") {
    path.push(step.question.code);
    step = nextStep(def, step.question.code, answers);
  }
  return path;
}
