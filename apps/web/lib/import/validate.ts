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
  "tags",
] as const;
export type TargetField = (typeof TARGET_FIELDS)[number];

/** column name -> target field name or `attr:<custom_field_key>` or "" (skip) */
export type ImportMapping = Record<string, string>;

export type DedupRule = "external_id" | "email" | "none";

export interface NormalizedRow {
  rowNumber: number;
  fields: Partial<Record<TargetField, string | number | null>>;
  attributes: Record<string, string>;
  consents?: Partial<Record<ConsentPurpose, ConsentEvidence>>;
  /** Undefined means no Tags column was mapped; [] means mapped but empty. */
  tags?: string[];
}

export type ConsentPurpose = "survey_contact" | "panel_membership";
export type ImportedConsentStatus = "granted" | "withdrawn";

export interface ConsentEvidence {
  status: ImportedConsentStatus;
  grantedAt: string | null;
  withdrawnAt: string | null;
  evidenceRef: string;
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
const CONSENT_TARGETS: Record<string, { purpose: ConsentPurpose; field: "status" | "grantedAt" | "withdrawnAt" | "evidenceRef" }> = {
  "consent:survey_contact.status": { purpose: "survey_contact", field: "status" },
  "consent:survey_contact.granted_at": { purpose: "survey_contact", field: "grantedAt" },
  "consent:survey_contact.withdrawn_at": { purpose: "survey_contact", field: "withdrawnAt" },
  "consent:survey_contact.evidence_ref": { purpose: "survey_contact", field: "evidenceRef" },
  "consent:panel_membership.status": { purpose: "panel_membership", field: "status" },
  "consent:panel_membership.granted_at": { purpose: "panel_membership", field: "grantedAt" },
  "consent:panel_membership.withdrawn_at": { purpose: "panel_membership", field: "withdrawnAt" },
  "consent:panel_membership.evidence_ref": { purpose: "panel_membership", field: "evidenceRef" },
};
const ISO_TIMESTAMP_WITH_OFFSET_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/;

function isIsoTimestampWithOffset(value: string): boolean {
  const match = ISO_TIMESTAMP_WITH_OFFSET_RE.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offset, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  return Boolean(
    offset
    && Number.isFinite(Date.parse(value))
    && month >= 1 && month <= 12
    && day >= 1 && day <= daysInMonth
    && Number(hourText) <= 23 && Number(minuteText) <= 59 && Number(secondText) <= 59
    && Number(offsetHourText ?? 0) <= 23 && Number(offsetMinuteText ?? 0) <= 59,
  );
}

/** XLSX/CSV convention: one cell can contain several tags. */
export function parseTags(value: string): string[] {
  const unique = new Map<string, string>();
  for (const raw of value.split(/[,;|\n]/)) {
    const tag = raw.trim().toLowerCase();
    if (tag && !unique.has(tag)) unique.set(tag, tag);
  }
  return [...unique.values()];
}
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
    const consentInput: Partial<Record<ConsentPurpose, Partial<Record<"status" | "grantedAt" | "withdrawnAt" | "evidenceRef", string>>>> = {};
    let tags: string[] | undefined;
    const rowErrors: RowError[] = [];

    for (const [column, target] of Object.entries(mapping)) {
      if (!target) continue;
      const value = (raw[column] ?? "").trim();
      const consentTarget = CONSENT_TARGETS[target];
      if (consentTarget) {
        if (value) (consentInput[consentTarget.purpose] ??= {})[consentTarget.field] = value;
        continue;
      }
      if (target.startsWith("attr:")) {
        if (value !== "") attributes[target.slice(5)] = value;
        continue;
      }
      const field = target as TargetField;
      if (field === "tags") {
        tags = parseTags(value);
        continue;
      }
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

    const consents: Partial<Record<ConsentPurpose, ConsentEvidence>> = {};
    for (const purpose of ["survey_contact", "panel_membership"] as const) {
      const input = consentInput[purpose];
      if (!input) continue;
      const column = Object.entries(mapping).find(([, target]) => CONSENT_TARGETS[target]?.purpose === purpose)?.[0] ?? purpose;
      const status = input.status?.toLowerCase();
      if (!status) {
        rowErrors.push({ rowNumber, column, message: `Missing ${purpose} consent status for supplied evidence.` });
        continue;
      }
      if (status !== "granted" && status !== "withdrawn") {
        rowErrors.push({ rowNumber, column, message: `Invalid ${purpose} consent status; use granted or withdrawn.` });
        continue;
      }
      const evidenceRef = input.evidenceRef?.trim() ?? "";
      if (!evidenceRef || evidenceRef.length > 500 || /[\u0000-\u001f\u007f]/.test(evidenceRef)) {
        rowErrors.push({ rowNumber, column, message: `Invalid or missing ${purpose} consent evidence reference.` });
        continue;
      }
      const grantedAt = input.grantedAt?.trim() ?? "";
      const withdrawnAt = input.withdrawnAt?.trim() ?? "";
      if (grantedAt && !isIsoTimestampWithOffset(grantedAt)) {
        rowErrors.push({ rowNumber, column, message: `Invalid ${purpose} grant timestamp; use ISO-8601 with timezone offset.` });
        continue;
      }
      if (withdrawnAt && !isIsoTimestampWithOffset(withdrawnAt)) {
        rowErrors.push({ rowNumber, column, message: `Invalid ${purpose} withdrawal timestamp; use ISO-8601 with timezone offset.` });
        continue;
      }
      if (status === "granted" && (!grantedAt || withdrawnAt)) {
        rowErrors.push({ rowNumber, column, message: `Granted ${purpose} consent requires a grant timestamp and no withdrawal timestamp.` });
        continue;
      }
      if (status === "withdrawn" && !withdrawnAt) {
        rowErrors.push({ rowNumber, column, message: `Withdrawn ${purpose} consent requires a withdrawal timestamp.` });
        continue;
      }
      consents[purpose] = {
        status,
        grantedAt: grantedAt || null,
        withdrawnAt: withdrawnAt || null,
        evidenceRef,
      };
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
      valid.push({ rowNumber, fields, attributes, ...(Object.keys(consents).length ? { consents } : {}), ...(tags === undefined ? {} : { tags }) });
    }
  });

  return { valid, errors, duplicatesInFile };
}
