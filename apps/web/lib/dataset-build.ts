import {
  allQuestions,
  lt,
  type InstrumentDefinition,
  type Question,
} from "@ok/domain";

/**
 * Builds a wide, analysis-ready dataset from survey responses.
 * SPSS-style conventions:
 *  - one numeric column per scale question (nps/csat/ces/rating/likert)
 *  - one 0/1 indicator column per multi-select option (`code__option`)
 *  - one numeric column per matrix row (`code__row`)
 *  - nominal string columns for single choice / dropdown
 *  - pseudonymous respondent_key only; no direct identifiers ever enter datasets
 */

export interface VariableMeta {
  name: string;
  label: string;
  varType: "numeric" | "string" | "date" | "boolean";
  measure: "nominal" | "ordinal" | "scale";
  valueLabels: Record<string, string>;
  missingValues: unknown[];
  role: string;
  position: number;
}

export interface ResponseRecord {
  respondentKey: string;
  completedAt: string | null;
  language: string;
  channel: string;
  answers: Record<string, unknown>;
  panelist?: {
    gender: string | null;
    birthYear: number | null;
    customerStatus: string | null;
  } | null;
}

export interface BuiltDataset {
  rows: Record<string, unknown>[];
  variables: VariableMeta[];
}

const BASE_VARS: VariableMeta[] = [
  { name: "respondent_key", label: "Respondent key (pseudonymous)", varType: "string", measure: "nominal", valueLabels: {}, missingValues: [], role: "id", position: 0 },
  { name: "completed_at", label: "Completed at (ISO 8601)", varType: "date", measure: "nominal", valueLabels: {}, missingValues: [], role: "none", position: 1 },
  { name: "language", label: "Response language", varType: "string", measure: "nominal", valueLabels: {}, missingValues: [], role: "input", position: 2 },
  { name: "channel", label: "Response channel", varType: "string", measure: "nominal", valueLabels: {}, missingValues: [], role: "input", position: 3 },
];

export function buildResponseDataset(
  def: InstrumentDefinition,
  records: ResponseRecord[],
  opts: { includePanelist?: boolean } = {},
): BuiltDataset {
  const questions = allQuestions(def);
  const variables: VariableMeta[] = [...BASE_VARS];
  let pos = variables.length;

  const columnBuilders: {
    name: string;
    extract: (r: ResponseRecord) => unknown;
  }[] = [];

  for (const q of questions) {
    const label = lt(q.label, def.defaultLanguage) || q.code;
    switch (q.type) {
      case "nps":
      case "csat":
      case "ces":
      case "rating":
      case "number": {
        variables.push(numVar(q.code, label, q.type === "number" ? "scale" : "scale", pos++));
        columnBuilders.push({ name: q.code, extract: (r) => toNumber(r.answers[q.code]) });
        break;
      }
      case "likert": {
        const valueLabels = optionValueLabels(q, def);
        variables.push({ ...numVar(q.code, label, "ordinal", pos++), valueLabels });
        columnBuilders.push({ name: q.code, extract: (r) => toNumber(r.answers[q.code]) });
        break;
      }
      case "single_choice":
      case "dropdown": {
        const valueLabels = optionIdLabels(q, def);
        variables.push({ name: q.code, label, varType: "string", measure: "nominal", valueLabels, missingValues: [], role: "input", position: pos++ });
        columnBuilders.push({ name: q.code, extract: (r) => toStringOrNull(r.answers[q.code]) });
        break;
      }
      case "multiple_choice": {
        for (const opt of q.options ?? []) {
          const name = `${q.code}__${opt.id}`;
          variables.push({
            name,
            label: `${label} — ${lt(opt.label, def.defaultLanguage)}`,
            varType: "numeric",
            measure: "nominal",
            valueLabels: { "0": "Not selected", "1": "Selected" },
            missingValues: [],
            role: "input",
            position: pos++,
          });
          columnBuilders.push({
            name,
            extract: (r) => {
              const a = r.answers[q.code];
              if (a === undefined || a === null) return null;
              return Array.isArray(a) && a.some((v) => String(v) === opt.id) ? 1 : 0;
            },
          });
        }
        break;
      }
      case "matrix": {
        const valueLabels = optionValueLabels(q, def);
        for (const row of q.rows ?? []) {
          const name = `${q.code}__${row.id}`;
          variables.push({ ...numVar(name, `${label} — ${lt(row.label, def.defaultLanguage)}`, "ordinal", pos++), valueLabels });
          columnBuilders.push({
            name,
            extract: (r) => {
              const a = r.answers[q.code] as Record<string, unknown> | undefined;
              return a && typeof a === "object" ? toNumber(a[row.id]) : null;
            },
          });
        }
        break;
      }
      case "consent": {
        variables.push({
          name: q.code, label, varType: "numeric", measure: "nominal",
          valueLabels: { "0": "No", "1": "Yes" }, missingValues: [], role: "input", position: pos++,
        });
        columnBuilders.push({
          name: q.code,
          extract: (r) => {
            const a = r.answers[q.code];
            return a === undefined || a === null ? null : a === true || a === "true" || a === 1 ? 1 : 0;
          },
        });
        break;
      }
      case "short_text":
      case "long_text":
      case "date": {
        variables.push({
          name: q.code, label, varType: q.type === "date" ? "date" : "string",
          measure: "nominal", valueLabels: {}, missingValues: [], role: "input", position: pos++,
        });
        columnBuilders.push({ name: q.code, extract: (r) => toStringOrNull(r.answers[q.code]) });
        break;
      }
      case "ranking": {
        // rank position per option (1 = first)
        for (const opt of q.options ?? []) {
          const name = `${q.code}__rank_${opt.id}`;
          variables.push(numVar(name, `${label} — rank of ${lt(opt.label, def.defaultLanguage)}`, "ordinal", pos++));
          columnBuilders.push({
            name,
            extract: (r) => {
              const a = r.answers[q.code];
              if (!Array.isArray(a)) return null;
              const idx = a.findIndex((v) => String(v) === opt.id);
              return idx === -1 ? null : idx + 1;
            },
          });
        }
        break;
      }
      case "first_click":
        // Interaction coordinates stay in interaction_events; not a dataset column.
        break;
    }
  }

  if (opts.includePanelist) {
    variables.push(
      { name: "panelist_gender", label: "Panelist gender (when linked & permitted)", varType: "string", measure: "nominal", valueLabels: {}, missingValues: [], role: "input", position: pos++ },
      { name: "panelist_birth_year", label: "Panelist birth year", varType: "numeric", measure: "scale", valueLabels: {}, missingValues: [], role: "input", position: pos++ },
      { name: "panelist_customer_status", label: "Panelist customer status", varType: "string", measure: "nominal", valueLabels: {}, missingValues: [], role: "input", position: pos++ },
    );
  }

  const rows = records.map((r) => {
    const row: Record<string, unknown> = {
      respondent_key: r.respondentKey,
      completed_at: r.completedAt,
      language: r.language,
      channel: r.channel,
    };
    for (const cb of columnBuilders) row[cb.name] = cb.extract(r);
    if (opts.includePanelist) {
      row.panelist_gender = r.panelist?.gender ?? null;
      row.panelist_birth_year = r.panelist?.birthYear ?? null;
      row.panelist_customer_status = r.panelist?.customerStatus ?? null;
    }
    return row;
  });

  return { rows, variables };
}

function numVar(name: string, label: string, measure: VariableMeta["measure"], position: number): VariableMeta {
  return { name, label, varType: "numeric", measure, valueLabels: {}, missingValues: [], role: "input", position };
}

function optionValueLabels(q: Question, def: InstrumentDefinition): Record<string, string> {
  const out: Record<string, string> = {};
  for (const opt of q.options ?? []) {
    const v = opt.value ?? opt.id;
    out[String(v)] = lt(opt.label, def.defaultLanguage);
  }
  return out;
}

function optionIdLabels(q: Question, def: InstrumentDefinition): Record<string, string> {
  const out: Record<string, string> = {};
  for (const opt of q.options ?? []) {
    out[opt.id] = lt(opt.label, def.defaultLanguage);
  }
  return out;
}

function toNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  return String(v);
}
