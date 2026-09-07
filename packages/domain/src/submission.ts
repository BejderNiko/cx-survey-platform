import { allQuestions, type InstrumentDefinition, type Question } from "./instrument";
import { MAX_FIRST_CLICK_INTERACTIONS_PER_QUESTION, MAX_PROTOTYPE_INTERACTIONS_PER_QUESTION, MAX_SUBMISSION_INTERACTIONS } from "./interaction-budget";
export { MAX_FIRST_CLICK_INTERACTIONS_PER_QUESTION, MAX_PROTOTYPE_INTERACTIONS_PER_QUESTION, MAX_SUBMISSION_INTERACTIONS } from "./interaction-budget";
import { nextStep, type AnswerMap } from "./logic";

export interface SubmittedAnswer {
  code: string;
  type: string;
  value: unknown;
}

export interface SubmittedInteraction {
  code: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface SubmissionInput {
  status: "completed" | "disqualified";
  answers: SubmittedAnswer[];
  interactions: SubmittedInteraction[];
}

export interface ValidatedSubmission {
  status: "completed" | "disqualified";
  answers: SubmittedAnswer[];
  interactions: SubmittedInteraction[];
  answerMap: AnswerMap;
}

export type SubmissionValidation =
  | { ok: true; value: ValidatedSubmission }
  | { ok: false; errors: string[] };

export type InteractionRecordResult =
  | { ok: true; interactions: SubmittedInteraction[] }
  | { ok: false; interactions: SubmittedInteraction[]; error: string };

/** Shared client budget policy. Server validation uses the same constants. */
export function recordSubmissionInteraction(
  def: InstrumentDefinition,
  current: SubmittedInteraction[],
  interaction: SubmittedInteraction,
): InteractionRecordResult {
  const question = allQuestions(def).find((item) => item.code === interaction.code);
  if (!question || !["prototype_test", "first_click"].includes(question.type)) {
    return { ok: false, interactions: current, error: "Interaction is not supported for this question." };
  }
  if (question.type === "first_click") {
    const retained = current.filter((entry) => entry.code !== interaction.code);
    if (interaction.eventType !== "first_click" || retained.length + 1 > MAX_SUBMISSION_INTERACTIONS) {
      return { ok: false, interactions: current, error: "First-click telemetry budget is exhausted." };
    }
    return { ok: true, interactions: [...retained, interaction] };
  }
  const ownCount = current.filter((entry) => entry.code === interaction.code).length;
  if (ownCount >= MAX_PROTOTYPE_INTERACTIONS_PER_QUESTION || current.length >= MAX_SUBMISSION_INTERACTIONS) {
    return { ok: false, interactions: current, error: "Prototype telemetry budget is exhausted." };
  }
  return { ok: true, interactions: [...current, interaction] };
}

/**
 * Validate an untrusted respondent payload against its immutable instrument.
 * The path is rebuilt one question at a time, so stale answers from a branch
 * the respondent backed out of cannot affect flow or enter the dataset.
 */
export function validateSubmission(
  def: InstrumentDefinition,
  input: SubmissionInput,
): SubmissionValidation {
  const errors: string[] = [];
  const questions = new Map(allQuestions(def).map((q) => [q.code, q]));
  const supplied = new Map<string, SubmittedAnswer>();

  for (const answer of input.answers) {
    const question = questions.get(answer.code);
    if (!question) {
      errors.push(`Unknown question '${answer.code}'.`);
      continue;
    }
    if (question.type !== answer.type) {
      errors.push(`Question '${answer.code}' has the wrong type.`);
      continue;
    }
    if (supplied.has(answer.code)) {
      errors.push(`Question '${answer.code}' was submitted more than once.`);
      continue;
    }
    const problem = validateAnswerValue(question, answer.value);
    if (problem) {
      errors.push(`Question '${answer.code}': ${problem}`);
      continue;
    }
    supplied.set(answer.code, answer);
  }

  if (errors.length > 0) return { ok: false, errors };

  const answerMap: AnswerMap = {};
  const pathCodes = new Set<string>();
  const answers: SubmittedAnswer[] = [];
  let fromCode: string | null = null;
  let finalStatus: "completed" | "disqualified" = "completed";

  // Forward-only branches are enforced by validateInstrument at publication.
  for (let guard = 0; guard <= questions.size; guard += 1) {
    const step = nextStep(def, fromCode, answerMap);
    if (step.kind !== "question") {
      finalStatus = step.kind === "disqualified" ? "disqualified" : "completed";
      break;
    }

    const question = step.question;
    pathCodes.add(question.code);
    const submitted = supplied.get(question.code);
    if (submitted) {
      if (question.required && !answerIsPresent(submitted.value)) {
        errors.push(`Required question '${question.code}' is empty.`);
      } else {
        answerMap[question.code] = submitted.value;
        answers.push(submitted);
      }
    } else if (question.required) {
      errors.push(`Required question '${question.code}' is missing.`);
    }
    fromCode = question.code;

    if (guard === questions.size) {
      errors.push("Survey path did not terminate.");
    }
  }

  if (input.status !== finalStatus) {
    errors.push(`Submitted status '${input.status}' does not match survey path '${finalStatus}'.`);
  }

  if (input.interactions.length > MAX_SUBMISSION_INTERACTIONS) {
    errors.push(`Submission has more than ${MAX_SUBMISSION_INTERACTIONS} interaction events.`);
  }
  const prototypeInteractionCounts = new Map<string, number>();
  const interactions: SubmittedInteraction[] = [];
  const interactionCodes = new Set<string>();
  for (const interaction of input.interactions) {
    const question = questions.get(interaction.code);
    if (!question || !pathCodes.has(interaction.code)) {
      errors.push(`Interaction for '${interaction.code}' is not allowed on this survey path.`);
      continue;
    }
    if (question.type === "prototype_test") {
      const count = (prototypeInteractionCounts.get(interaction.code) ?? 0) + 1;
      prototypeInteractionCounts.set(interaction.code, count);
      if (count > MAX_PROTOTYPE_INTERACTIONS_PER_QUESTION) {
        errors.push(`Interaction for '${interaction.code}' exceeds per-prototype limit.`);
        continue;
      }
      const problem = validatePrototypeInteraction(interaction);
      if (problem) errors.push(`Interaction for '${interaction.code}': ${problem}`);
      else interactions.push(interaction);
      continue;
    }
    if (question.type !== "first_click") {
      errors.push(`Interaction for '${interaction.code}' is not supported for '${question.type}'.`);
      continue;
    }
    if (interaction.eventType !== "first_click") {
      errors.push(`Interaction '${interaction.eventType}' is not supported.`);
      continue;
    }
    if (interactionCodes.has(interaction.code)) {
      errors.push(`Interaction for '${interaction.code}' was submitted more than once.`);
      continue;
    }
    const payloadProblem = validateFirstClickPayload(interaction.payload, answerMap[interaction.code], question);
    if (payloadProblem) {
      errors.push(`Interaction for '${interaction.code}': ${payloadProblem}`);
      continue;
    }
    interactionCodes.add(interaction.code);
    interactions.push(interaction);
  }

  for (const answer of answers) {
    if (answer.type === "first_click" && !interactionCodes.has(answer.code)) {
      errors.push(`First-click answer '${answer.code}' is missing its interaction metadata.`);
    }
    if (answer.type === "prototype_test") {
      const currentQuestion = questions.get(answer.code);
      const currentAnswer = answer.value as Record<string, unknown>;
      const frames = interactions.filter((entry) => entry.code === answer.code && entry.eventType === "prototype_frame");
      if (frames.length === 0) errors.push(`Prototype answer '${answer.code}' is missing frame telemetry.`);
      if (currentAnswer.reachedGoal === true) {
        const goal = currentQuestion?.prototype?.goalFrameId;
        if (!goal || !frames.some((entry) => entry.payload.frameId === goal)) {
          errors.push(`Prototype answer '${answer.code}' claims success without a matching goal-frame event.`);
        }
      }
    }
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: { status: finalStatus, answers, interactions, answerMap } };
}

function validateAnswerValue(question: Question, value: unknown): string | null {
  switch (question.type) {
    case "nps":
      return integerInRange(value, 0, 10);
    case "csat":
      return integerInRange(value, 1, 5);
    case "ces":
      return integerInRange(value, 1, 7);
    case "rating":
      return integerInRange(value, question.scale?.min ?? 1, question.scale?.max ?? 5);
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : "must be a finite number.";
    case "short_text":
      return boundedString(value, 500);
    case "long_text":
      return boundedString(value, 5_000);
    case "date":
      return validDate(value) ? null : "must be a real date in YYYY-MM-DD format.";
    case "consent":
      return typeof value === "boolean" ? null : "must be true or false.";
    case "single_choice":
    case "dropdown":
      return optionValues(question).some((candidate) => candidate === value)
        ? null
        : "must match an available option.";
    case "likert":
      return optionValues(question, true).some((candidate) => candidate === value)
        ? null
        : "must match an available option value.";
    case "multiple_choice": {
      if (!Array.isArray(value)) return "must be an array of option IDs.";
      const allowed = new Set((question.options ?? []).map((o) => o.id));
      const selected = value.map(String);
      if (selected.length > allowed.size || new Set(selected).size !== selected.length) {
        return "contains duplicate or too many options.";
      }
      return selected.every((id) => allowed.has(id)) ? null : "contains an unknown option.";
    }
    case "ranking": {
      if (!Array.isArray(value)) return "must rank every option.";
      const expected = (question.options ?? []).map((o) => o.id);
      const ranked = value.map(String);
      if (ranked.length !== expected.length || new Set(ranked).size !== expected.length) {
        return "must contain every option exactly once.";
      }
      const expectedSet = new Set(expected);
      return ranked.every((id) => expectedSet.has(id)) ? null : "contains an unknown option.";
    }
    case "matrix": {
      if (!isPlainObject(value)) return "must be a row-to-option object.";
      const rows = new Set((question.rows ?? []).map((r) => r.id));
      const allowed = optionValues(question, true);
      const entries = Object.entries(value);
      if (entries.some(([row]) => !rows.has(row))) return "contains an unknown row.";
      if (question.required && entries.length !== rows.size) return "must answer every row.";
      return entries.every(([, answer]) => allowed.some((candidate) => candidate === answer))
        ? null
        : "contains an unknown column value.";
    }
    case "first_click": {
      if (!isPlainObject(value) || !nonNegativeNumber(value.x) || !nonNegativeNumber(value.y)) {
        return "must contain non-negative x/y coordinates.";
      }
      const stimuli = firstClickStimuli(question);
      if (stimuli.length > 0 && (typeof value.selectedAssetId !== "string"
          || !stimuli.some((stimulus) => stimulus.assetId === value.selectedAssetId))) {
        return "selected asset must match a published stimulus.";
      }
      return null;
    }
    case "preference_test": {
      if (!isPlainObject(value)) return "must identify one selected stimulus and its display order.";
      const stimulusIds = (question.stimuli ?? []).map((stimulus) => stimulus.id);
      const allowed = new Set(stimulusIds);
      if (typeof value.selectedId !== "string" || !allowed.has(value.selectedId)) {
        return "must select one available stimulus.";
      }
      const selected = question.stimuli?.find((stimulus) => stimulus.id === value.selectedId);
      if (value.selectedAssetId !== selected?.assetId) return "selected asset does not match the stimulus.";
      if (!Array.isArray(value.displayOrder)) return "must include the stimulus display order.";
      const order = value.displayOrder.map(String);
      if (order.length !== stimulusIds.length || new Set(order).size !== stimulusIds.length) {
        return "display order must contain every stimulus exactly once.";
      }
      return order.every((id) => allowed.has(id)) ? null : "display order contains an unknown stimulus.";
    }
    case "prototype_test": {
      if (!isPlainObject(value)) return "must contain prototype completion state.";
      if (typeof value.reachedGoal !== "boolean") return "must include reachedGoal.";
      if (value.lastFrameId !== null && (typeof value.lastFrameId !== "string" || value.lastFrameId.length > 200)) {
        return "lastFrameId must be null or a bounded string.";
      }
      return null;
    }
  }
}

function integerInRange(value: unknown, min: number, max: number): string | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? null
    : `must be an integer from ${min} to ${max}.`;
}

function answerIsPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ""
    && !(Array.isArray(value) && value.length === 0);
}

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return "must be text.";
  return value.length <= max ? null : `must contain at most ${max} characters.`;
}

function validDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function optionValues(question: Question, preferValue = false): unknown[] {
  return (question.options ?? []).map((option) => preferValue ? (option.value ?? option.id) : option.id);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function firstClickStimuli(question: Question) {
  return question.stimuli ?? (question.stimulus ? [question.stimulus] : []);
}

function validateFirstClickPayload(
  payload: Record<string, unknown>,
  answer: unknown,
  question: Question,
): string | null {
  const allowed = new Set(["x", "y", "naturalWidth", "naturalHeight", "elapsedMs", "assetId", "stimulusIndex"]);
  if (Object.keys(payload).some((key) => !allowed.has(key))) return "contains unsupported fields.";
  if (!nonNegativeNumber(payload.x) || !nonNegativeNumber(payload.y)) return "x/y must be non-negative numbers.";
  if (!nonNegativeNumber(payload.naturalWidth) || !nonNegativeNumber(payload.naturalHeight)
      || payload.naturalWidth === 0 || payload.naturalHeight === 0) {
    return "image dimensions must be positive numbers.";
  }
  if (payload.x > payload.naturalWidth || payload.y > payload.naturalHeight) {
    return "x/y must fall inside the image dimensions.";
  }
  if (!isPlainObject(answer) || answer.x !== payload.x || answer.y !== payload.y) {
    return "coordinates must match the submitted first-click answer.";
  }
  const stimuli = firstClickStimuli(question);
  if (stimuli.length > 0) {
    if (typeof payload.assetId !== "string" || !Number.isInteger(payload.stimulusIndex)) {
      return "assetId and stimulusIndex are required for a published stimulus.";
    }
    const selected = stimuli[Number(payload.stimulusIndex)];
    if (!selected || selected.assetId !== payload.assetId || answer.selectedAssetId !== selected.assetId) {
      return "asset binding does not match the published stimulus.";
    }
  } else if (payload.assetId !== undefined || payload.stimulusIndex !== undefined || answer.selectedAssetId !== undefined) {
    return "legacy first-click questions cannot submit asset binding fields.";
  }
  return nonNegativeNumber(payload.elapsedMs) ? null : "elapsedMs must be a non-negative number.";
}

function boundedId(value: unknown): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

function validatePrototypeInteraction(interaction: SubmittedInteraction): string | null {
  const payload = interaction.payload;
  if (interaction.eventType === "prototype_frame") {
    const allowed = new Set(["frameId", "previousFrameId", "elapsedMs", "initial"]);
    if (Object.keys(payload).some((key) => !allowed.has(key))) return "frame event contains unsupported fields.";
    if (!boundedId(payload.frameId)) return "frameId is invalid.";
    if (payload.previousFrameId !== null && payload.previousFrameId !== undefined && !boundedId(payload.previousFrameId)) {
      return "previousFrameId is invalid.";
    }
    if (!nonNegativeNumber(payload.elapsedMs)) return "elapsedMs must be non-negative.";
    return payload.initial === undefined || typeof payload.initial === "boolean" ? null : "initial must be boolean.";
  }
  if (interaction.eventType === "prototype_click") {
    const allowed = new Set(["frameId", "x", "y", "isMisclick", "targetNodeId", "scrollingFrameId", "elapsedMs"]);
    if (Object.keys(payload).some((key) => !allowed.has(key))) return "click event contains unsupported fields.";
    if (!boundedId(payload.frameId) || !nonNegativeNumber(payload.x) || !nonNegativeNumber(payload.y)) {
      return "click frameId/x/y are invalid.";
    }
    if (typeof payload.isMisclick !== "boolean" || !nonNegativeNumber(payload.elapsedMs)) {
      return "click status or elapsedMs is invalid.";
    }
    for (const key of ["targetNodeId", "scrollingFrameId"] as const) {
      if (payload[key] !== null && payload[key] !== undefined && !boundedId(payload[key])) return `${key} is invalid.`;
    }
    return null;
  }
  if (interaction.eventType === "prototype_status") {
    const allowed = new Set(["status", "elapsedMs"]);
    if (Object.keys(payload).some((key) => !allowed.has(key))) return "status event contains unsupported fields.";
    if (!["LOGIN_SCREEN_SHOWN", "PASSWORD_SCREEN_SHOWN"].includes(String(payload.status))) return "status is invalid.";
    return nonNegativeNumber(payload.elapsedMs) ? null : "elapsedMs must be non-negative.";
  }
  return `event '${interaction.eventType}' is not supported.`;
}
