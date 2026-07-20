import { z } from "zod";

/**
 * Instrument definition: the versioned survey document stored in
 * studies.draft_definition and snapshotted immutably into study_versions.
 * Danish and English variants live side by side in LocalizedText.
 */

export const LOCALES = ["da", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const localizedText = z.object({
  da: z.string().optional(),
  en: z.string().optional(),
});
export type LocalizedText = z.infer<typeof localizedText>;

/** Resolve text for a locale with fallback to the other configured locale. */
export function lt(text: LocalizedText | undefined, locale: Locale): string {
  if (!text) return "";
  return text[locale] ?? text[locale === "da" ? "en" : "da"] ?? "";
}

export const QUESTION_TYPES = [
  "nps",
  "csat",
  "ces",
  "single_choice",
  "multiple_choice",
  "dropdown",
  "short_text",
  "long_text",
  "number",
  "date",
  "rating",
  "likert",
  "matrix",
  "ranking",
  "consent",
  "first_click",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const conditionOp = z.enum([
  "eq", "ne", "lt", "lte", "gt", "gte", "in", "not_in", "contains", "answered", "not_answered",
]);
export type ConditionOp = z.infer<typeof conditionOp>;

export const condition = z.object({
  questionCode: z.string(),
  op: conditionOp,
  // string | number | boolean | array of those; unused for (not_)answered
  value: z.unknown().optional(),
});
export type Condition = z.infer<typeof condition>;

export const branchRule = z.object({
  id: z.string(),
  when: z.array(condition).min(1), // all conditions must hold (AND)
  goTo: z.string(), // question code, or "END" | "DISQUALIFY"
});
export type BranchRule = z.infer<typeof branchRule>;

export const option = z.object({
  id: z.string(),
  label: localizedText,
  value: z.union([z.string(), z.number()]).optional(),
});
export type Option = z.infer<typeof option>;

export const question = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]*$/, "codes are snake_case identifiers"),
  type: z.enum(QUESTION_TYPES),
  label: localizedText,
  helpText: localizedText.optional(),
  required: z.boolean().default(false),
  options: z.array(option).optional(),          // choice / likert / ranking types
  randomizeOptions: z.boolean().optional(),
  scale: z
    .object({
      min: z.number(),
      max: z.number(),
      minLabel: localizedText.optional(),
      maxLabel: localizedText.optional(),
    })
    .optional(),                                 // rating; nps/csat/ces have fixed scales
  rows: z.array(option).optional(),              // matrix rows (columns = options)
  imageUrl: z.string().optional(),               // first_click stimulus (data URI or path)
  taskText: localizedText.optional(),            // first_click task instruction
  visibleIf: z.array(condition).optional(),      // display conditions (AND)
  branches: z.array(branchRule).optional(),      // evaluated after answering
  isScreener: z.boolean().optional(),            // disqualifying screener question
});
export type Question = z.infer<typeof question>;

export const block = z.object({
  id: z.string(),
  title: localizedText.optional(),
  questions: z.array(question),
});
export type Block = z.infer<typeof block>;

export const instrumentMessages = z.object({
  intro: localizedText.optional(),
  thankYou: localizedText.optional(),
  disqualified: localizedText.optional(),
  closed: localizedText.optional(),
  quotaFull: localizedText.optional(),
});

export const instrumentDefinition = z.object({
  languages: z.array(z.enum(LOCALES)).min(1),
  defaultLanguage: z.enum(LOCALES),
  blocks: z.array(block),
  messages: instrumentMessages.default({}),
});
export type InstrumentDefinition = z.infer<typeof instrumentDefinition>;
/** Author-facing input shape (before zod defaults are applied). */
export type InstrumentDefinitionInput = z.input<typeof instrumentDefinition>;

export function allQuestions(def: InstrumentDefinition): Question[] {
  return def.blocks.flatMap((b) => b.questions);
}

/** Validation used by the builder and by publish. Returns human-readable problems. */
export function validateInstrument(def: InstrumentDefinition): string[] {
  const problems: string[] = [];
  const qs = allQuestions(def);
  if (qs.length === 0) problems.push("Instrument has no questions.");
  if (!def.languages.includes(def.defaultLanguage)) {
    problems.push("Default language must be included in instrument languages.");
  }
  const codes = new Set<string>();
  for (const q of qs) {
    if (codes.has(q.code)) problems.push(`Duplicate question code '${q.code}'.`);
    codes.add(q.code);
    if (!lt(q.label, def.defaultLanguage)) {
      problems.push(`Question '${q.code}' is missing a label in the default language.`);
    }
    const needsOptions = ["single_choice", "multiple_choice", "dropdown", "likert", "ranking"];
    if (needsOptions.includes(q.type) && (!q.options || q.options.length < 2)) {
      problems.push(`Question '${q.code}' needs at least two options.`);
    }
    if (q.type === "matrix" && (!q.rows?.length || !q.options?.length)) {
      problems.push(`Matrix question '${q.code}' needs rows and columns.`);
    }
    const optionIds = (q.options ?? []).map((optionItem) => optionItem.id);
    if (new Set(optionIds).size !== optionIds.length) {
      problems.push(`Question '${q.code}' has duplicate option IDs.`);
    }
    const rowIds = (q.rows ?? []).map((rowItem) => rowItem.id);
    if (new Set(rowIds).size !== rowIds.length) {
      problems.push(`Question '${q.code}' has duplicate matrix row IDs.`);
    }
    if (["likert", "matrix"].includes(q.type)
      && (q.options ?? []).some((optionItem) => !Number.isFinite(Number(optionItem.value ?? optionItem.id)))) {
      problems.push(`Question '${q.code}' needs numeric option values for analysis.`);
    }
    if (q.type === "rating") {
      const min = q.scale?.min ?? 1;
      const max = q.scale?.max ?? 5;
      if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max || max - min > 20) {
        problems.push(`Rating question '${q.code}' needs an integer scale spanning 1 to 20 steps.`);
      }
    }
    if (q.type === "first_click" && !q.imageUrl) {
      problems.push(`First-click question '${q.code}' needs a stimulus image.`);
    }
  }
  const order = qs.map((q) => q.code);
  for (const q of qs) {
    for (const b of q.branches ?? []) {
      if (b.goTo !== "END" && b.goTo !== "DISQUALIFY" && !codes.has(b.goTo)) {
        problems.push(`Branch on '${q.code}' targets unknown question '${b.goTo}'.`);
      }
      if (b.goTo !== "END" && b.goTo !== "DISQUALIFY" && order.indexOf(b.goTo) <= order.indexOf(q.code)) {
        problems.push(`Branch on '${q.code}' must jump forward (to avoid loops).`);
      }
      for (const c of b.when) {
        if (!codes.has(c.questionCode)) {
          problems.push(`Branch condition on '${q.code}' references unknown question '${c.questionCode}'.`);
        } else if (order.indexOf(c.questionCode) > order.indexOf(q.code)) {
          problems.push(`Branch condition on '${q.code}' cannot reference a later question.`);
        }
      }
    }
    for (const c of q.visibleIf ?? []) {
      if (!codes.has(c.questionCode)) {
        problems.push(`Display condition on '${q.code}' references unknown question '${c.questionCode}'.`);
      } else if (order.indexOf(c.questionCode) >= order.indexOf(q.code)) {
        problems.push(`Display condition on '${q.code}' must reference an earlier question.`);
      }
    }
  }
  return problems;
}
