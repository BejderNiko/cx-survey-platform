import type { ParsedFile } from "./parse";
import type { VariablePayload } from "../analytics-client";

export type RawVariableType = "numeric" | "string" | "date";
export type RawMeasurement = "nominal" | "ordinal" | "scale";

export interface RawVariableSpec {
  sourceColumn: string;
  include: boolean;
  name: string;
  label: string;
  varType: RawVariableType;
  measure: RawMeasurement;
  missingValues: string[];
}

export interface RawDatasetBuild {
  rows: Record<string, unknown>[];
  variables: VariablePayload[];
}

export function normalizeVariableName(column: string, position: number): string {
  let normalized = column
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/gi, "ae")
    .replace(/ø/gi, "oe")
    .replace(/å/gi, "aa")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  if (!normalized) normalized = `variable_${position + 1}`;
  if (/^[0-9]/.test(normalized)) normalized = `v_${normalized}`;
  return normalized.slice(0, 64);
}

function isFiniteNumber(value: string): boolean {
  if (value.trim() === "") return false;
  const normalized = value.includes(",") && !value.includes(".")
    ? value.replace(",", ".")
    : value;
  return Number.isFinite(Number(normalized));
}

function parseIsoLikeDate(value: string): string | null {
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})([T\s].*)?$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() !== month - 1
    || calendarDate.getUTCDate() !== day
  ) {
    return null;
  }
  const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!match[4]) return date;
  const timestamp = Date.parse(`${date}${match[4]}`);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function isIsoLikeDate(value: string): boolean {
  return parseIsoLikeDate(value) !== null;
}

export function inferRawVariables(parsed: ParsedFile): RawVariableSpec[] {
  const usedNames = new Set<string>();
  return parsed.columns.map((column, index) => {
    const values = parsed.rows
      .map((row) => row[column]?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 500);
    const varType: RawVariableType =
      values.length > 0 && values.every(isFiniteNumber)
        ? "numeric"
        : values.length > 0 && values.every(isIsoLikeDate)
          ? "date"
          : "string";
    const baseName = normalizeVariableName(column, index);
    let name = baseName;
    let suffix = 2;
    while (usedNames.has(name)) {
      name = `${baseName.slice(0, 60)}_${suffix++}`;
    }
    usedNames.add(name);
    return {
      sourceColumn: column,
      include: true,
      name,
      label: column.trim() || name,
      varType,
      measure: varType === "numeric" ? "scale" : "nominal",
      missingValues: [],
    };
  });
}

function numericValue(raw: string, rowNumber: number, label: string): number {
  const normalized = raw.includes(",") && !raw.includes(".")
    ? raw.replace(",", ".")
    : raw;
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new Error(`Række ${rowNumber}: '${raw}' i ${label} er ikke et gyldigt tal.`);
  }
  return value;
}

function dateValue(raw: string, rowNumber: number, label: string): string {
  const parsed = parseIsoLikeDate(raw);
  if (parsed === null) {
    throw new Error(`Række ${rowNumber}: '${raw}' i ${label} er ikke en gyldig dato.`);
  }
  return parsed;
}

export function buildRawDataset(
  parsed: ParsedFile,
  specs: RawVariableSpec[],
): RawDatasetBuild {
  const included = specs.filter((spec) => spec.include);
  if (included.length === 0) throw new Error("Vælg mindst én variabel.");

  const sourceColumns = new Set(parsed.columns);
  const names = new Set<string>();
  for (const spec of included) {
    if (!sourceColumns.has(spec.sourceColumn)) {
      throw new Error(`Kolonnen '${spec.sourceColumn}' findes ikke længere i filen.`);
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(spec.name)) {
      throw new Error(`Variabelnavnet '${spec.name}' skal starte med bogstav/underscore og kun bruge A-Z, 0-9 og underscore.`);
    }
    if (names.has(spec.name)) throw new Error(`Variabelnavnet '${spec.name}' bruges mere end én gang.`);
    names.add(spec.name);
  }

  const rows = parsed.rows.map((sourceRow, rowIndex) => {
    const output: Record<string, unknown> = {};
    for (const spec of included) {
      const raw = sourceRow[spec.sourceColumn]?.trim() ?? "";
      const missing = raw === "" || spec.missingValues.includes(raw);
      output[spec.name] = missing
        ? null
        : spec.varType === "numeric"
          ? numericValue(raw, rowIndex + 2, spec.label)
          : spec.varType === "date"
            ? dateValue(raw, rowIndex + 2, spec.label)
            : raw;
    }
    return output;
  });

  const variables: VariablePayload[] = included.map((spec) => ({
    name: spec.name,
    label: spec.label.trim() || spec.name,
    var_type: spec.varType,
    measure: spec.measure,
    value_labels: {},
    missing_values: spec.missingValues,
  }));
  return { rows, variables };
}
