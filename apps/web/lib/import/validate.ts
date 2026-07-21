/**
 * Import validation & normalization. Pure functions so the same rules apply
 * to dry runs and commits (and are unit-testable).
 */

export const TARGET_FIELDS = [
  "external_id",
  "first_name",
  "last_name",
  "email",
  "phone",
  "language",
  "birth_year",
  "gender",
  "city",
  "postal_code",
  "country",
  "customer_status",
  "recruitment_source",
] as const;
export type TargetField = (typeof TARGET_FIELDS)[number];

/** column name -> target field name or `attr:<custom_field_key>` or "" (skip) */
export type ImportMapping = Record<string, string>;

export type DedupRule = "external_id" | "email" | "none";

export interface NormalizedRow {
  rowNumber: number;
  fields: Partial<Record<TargetField, string | number | null>>;
  attributes: Record<string, string>;
}

export interface RowError {
  rowNumber: number;
  column?: string;
  message: string;
}

export interface ValidationResult {
  valid: NormalizedRow[];
  errors: RowError[];
  duplicatesInFile: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRows(
  rows: Record<string, string>[],
  mapping: ImportMapping,
  dedupRule: DedupRule,
): ValidationResult {
  const valid: NormalizedRow[] = [];
  const errors: RowError[] = [];
  const seenKeys = new Set<string>();
  let duplicatesInFile = 0;

  const mappedTargets = Object.values(mapping).filter(Boolean);
  const hasKeyField =
    dedupRule === "none" ||
    (dedupRule === "external_id" && mappedTargets.includes("external_id")) ||
    (dedupRule === "email" && mappedTargets.includes("email"));
  if (!hasKeyField) {
    return {
      valid: [],
      errors: [{ rowNumber: 0, message: `Deduplication by ${dedupRule} requires mapping a column to ${dedupRule}.` }],
      duplicatesInFile: 0,
    };
  }

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2; // header is row 1
    const fields: NormalizedRow["fields"] = {};
    const attributes: Record<string, string> = {};
    const rowErrors: RowError[] = [];

    for (const [column, target] of Object.entries(mapping)) {
      if (!target) continue;
      const value = (raw[column] ?? "").trim();
      if (target.startsWith("attr:")) {
        if (value !== "") attributes[target.slice(5)] = value;
        continue;
      }
      const field = target as TargetField;
      if (value === "") {
        fields[field] = null;
        continue;
      }
      switch (field) {
        case "email": {
          const email = value.toLowerCase();
          if (!EMAIL_RE.test(email)) {
            rowErrors.push({ rowNumber, column, message: `Invalid email '${value}'` });
          } else {
            fields.email = email;
          }
          break;
        }
        case "birth_year": {
          const year = Number(value);
          if (!Number.isInteger(year) || year < 1900 || year > 2100) {
            rowErrors.push({ rowNumber, column, message: `Invalid birth year '${value}'` });
          } else {
            fields.birth_year = year;
          }
          break;
        }
        case "language": {
          const lang = value.toLowerCase().slice(0, 2);
          fields.language = ["da", "en"].includes(lang) ? lang : "da";
          break;
        }
        default:
          fields[field] = value;
      }
    }

    if (!fields.email && !fields.external_id) {
      rowErrors.push({ rowNumber, message: "Row has neither an email nor an external ID." });
    }

    const key =
      dedupRule === "external_id" ? fields.external_id
      : dedupRule === "email" ? fields.email
      : null;
    if (key !== null) {
      if (key === undefined || key === null || key === "") {
        rowErrors.push({ rowNumber, message: `Missing ${dedupRule} used for deduplication.` });
      } else if (seenKeys.has(String(key))) {
        duplicatesInFile += 1;
        rowErrors.push({ rowNumber, message: `Duplicate ${dedupRule} '${key}' within the file (row skipped).` });
      } else {
        seenKeys.add(String(key));
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else {
      valid.push({ rowNumber, fields, attributes });
    }
  });

  return { valid, errors, duplicatesInFile };
}
