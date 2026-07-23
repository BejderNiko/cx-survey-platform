"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { withAuthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { Tx } from "@/lib/db";
import { checkFile, parseImportFile } from "@/lib/import/parse";
import {
  validateRows,
  type DedupRule,
  type ImportMapping,
  type NormalizedRow,
} from "@/lib/import/validate";

/** Fixed import policy: first known column wins; custom fields use exact normalized keys. */
const DEFAULT_COLUMN_MAP: Record<string, string> = {
  external_id: "external_id", externalid: "external_id", ekstern_id: "external_id", kunde_id: "external_id", kundenummer: "external_id", customer_id: "external_id", id: "external_id",
  first_name: "first_name", firstname: "first_name", fornavn: "first_name",
  last_name: "last_name", lastname: "last_name", efternavn: "last_name",
  email: "email", mail: "email", e_mail: "email", emailadresse: "email",
  phone: "phone", telefon: "phone", mobile: "phone",
  language: "language", sprog: "language", locale: "language",
  birth_year: "birth_year", birthyear: "birth_year", foedselsaar: "birth_year",
  gender: "gender", koen: "gender",
  city: "city", by: "city",
  postal_code: "postal_code", zip: "postal_code", postnummer: "postal_code",
  country: "country", land: "country",
  customer_status: "customer_status", status: "customer_status",
  recruitment_source: "recruitment_source", source: "recruitment_source",
};

function normalizeColumn(column: string): string {
  return column.trim().toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

async function fixedImportConfig(tx: Tx, columns: string[]) {
  const customFields = await tx`select key from custom_fields order by key`;
  const customKeys = new Set(customFields.map((field) => String(field.key)));
  const usedTargets = new Set<string>();
  const mapping: ImportMapping = {};
  for (const column of columns) {
    const normalized = normalizeColumn(column);
    const target = DEFAULT_COLUMN_MAP[normalized]
      ?? (customKeys.has(normalized) ? `attr:${normalized}` : "");
    mapping[column] = target && !usedTargets.has(target) ? target : "";
    if (mapping[column]) usedTargets.add(mapping[column]);
  }
  const dedupRule: DedupRule = usedTargets.has("external_id") ? "external_id" : "email";
  return { mapping, dedupRule };
}

/**
 * Import wizard commands. The client keeps the file and re-sends it per step,
 * so the server stays stateless between steps; the batch row is created at
 * dry-run time and finalized at commit.
 */

async function fileFromForm(formData: FormData): Promise<{ buffer: Buffer; name: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Der er ikke valgt nogen fil.");
  const problem = checkFile(file.name, file.size, file.type);
  if (problem) throw new Error(problem);
  return { buffer: Buffer.from(await file.arrayBuffer()), name: file.name };
}

export async function parseStep(formData: FormData) {
  return withAuthorized("panel.import", async () => {
    const { buffer, name } = await fileFromForm(formData);
    const sheet = (formData.get("sheet") as string) || undefined;
    const parsed = await parseImportFile(buffer, name, sheet);
    return {
      filename: name,
      columns: parsed.columns,
      preview: parsed.rows.slice(0, 8),
      rowCount: parsed.meta.rowCount,
      sheetNames: parsed.sheetNames ?? null,
      delimiter: parsed.meta.delimiter ?? null,
    };
  });
}

interface PlanCounts {
  total: number;
  valid: number;
  invalid: number;
  create: number;
  update: number;
  skippedDuplicates: number;
}

function fileFingerprint(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function samePlanCounts(stored: Record<string, unknown>, current: PlanCounts): boolean {
  const keys: (keyof PlanCounts)[] = [
    "total", "valid", "invalid", "create", "update", "skippedDuplicates",
  ];
  return keys.every((key) => Number(stored[key]) === current[key]);
}

async function planImport(
  tx: Tx,
  orgId: string,
  rows: Record<string, string>[],
  mapping: ImportMapping,
  dedupRule: DedupRule,
) {
  const validation = validateRows(rows, mapping, dedupRule);
  let create = 0;
  let update = 0;
  const updates: { row: NormalizedRow; existingId: string }[] = [];
  const creates: NormalizedRow[] = [];

  if (dedupRule !== "none" && validation.valid.length > 0) {
    const keys = validation.valid.map((r) => String(r.fields[dedupRule] ?? ""));
    const existing =
      dedupRule === "external_id"
        ? await tx`select id, external_id as key from panelists where external_id = any(${keys})`
        : await tx`select id, email::text as key from panelists where email = any(${keys})`;
    const byKey = new Map(existing.map((e) => [String(e.key), e.id as string]));
    for (const row of validation.valid) {
      const id = byKey.get(String(row.fields[dedupRule] ?? ""));
      if (id) {
        update += 1;
        updates.push({ row, existingId: id });
      } else {
        create += 1;
        creates.push(row);
      }
    }
  } else {
    create = validation.valid.length;
    creates.push(...validation.valid);
  }

  const counts: PlanCounts = {
    total: rows.length,
    valid: validation.valid.length,
    invalid: validation.errors.filter((e) => e.rowNumber > 0).length,
    create,
    update,
    skippedDuplicates: validation.duplicatesInFile,
  };
  return { validation, counts, creates, updates };
}

export async function dryRunStep(formData: FormData) {
  const consentConfirmed = formData.get("consentConfirmed") === "true";
  if (!consentConfirmed) throw new Error("Bekræft samtykkegrundlaget, før importen køres.");

  return withAuthorized("panel.import", async (tx, session) => {
    const { buffer, name } = await fileFromForm(formData);
    const sheet = (formData.get("sheet") as string) || undefined;
    const parsed = await parseImportFile(buffer, name, sheet);
    const { mapping, dedupRule } = await fixedImportConfig(tx, parsed.columns);
    const { validation, counts } = await planImport(tx, session.orgId, parsed.rows, mapping, dedupRule);
    const reviewBinding = { fileSha256: fileFingerprint(buffer), sheet: sheet ?? null };

    const [batch] = await tx`
      insert into import_batches (org_id, filename, file_kind, status, mapping, dedup_rule, counts, error_report, dry_run, created_by)
      values (${session.orgId}, ${name}, ${name.endsWith(".xlsx") ? "xlsx" : "csv"}, 'dry_run',
              ${tx.json(mapping)}, ${dedupRule}, ${tx.json({ ...counts, ...reviewBinding } as never)},
              ${tx.json(validation.errors as never)}, true, ${session.userId})
      returning id`;
    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId,
      action: "panel.import.dry_run", entityType: "import_batch", entityId: batch.id as string,
      details: counts as unknown as Record<string, unknown>,
    });
    return { batchId: batch.id as string, counts, errors: validation.errors.slice(0, 100) };
  });
}

export async function commitStep(formData: FormData) {
  const consentConfirmed = formData.get("consentConfirmed") === "true";
  if (!consentConfirmed) throw new Error("Bekræft samtykkegrundlaget, før importen gennemføres.");
  const batchId = String(formData.get("batchId") ?? "");
  if (!batchId) throw new Error("Kør valideringen først.");

  const result = await withAuthorized("panel.import", async (tx, session) => {
    const { buffer, name } = await fileFromForm(formData);
    const sheet = (formData.get("sheet") as string) || undefined;
    const parsed = await parseImportFile(buffer, name, sheet);
    const { mapping, dedupRule } = await fixedImportConfig(tx, parsed.columns);
    const [batch] = await tx`
      select counts from import_batches
      where id = ${batchId} and status = 'dry_run' and filename = ${name}
        and mapping = ${tx.json(mapping as never)} and dedup_rule = ${dedupRule}
      for update`;
    if (!batch) throw new Error("Valideringen svarer ikke længere til denne import.");
    const storedBinding = batch.counts as { fileSha256?: string; sheet?: string | null };
    if (storedBinding.fileSha256 !== fileFingerprint(buffer) || storedBinding.sheet !== (sheet ?? null)) {
      throw new Error("Filen eller arket er ændret efter valideringen. Vælg filen igen.");
    }
    const { validation, counts, creates, updates } = await planImport(tx, session.orgId, parsed.rows, mapping, dedupRule);
    if (!samePlanCounts(batch.counts as Record<string, unknown>, counts)) {
      throw new Error("Paneldata er ændret efter prøvekørslen. Kør gennemgangen igen, før du gennemfører.");
    }

    const fieldsFor = (row: NormalizedRow) => ({
      external_id: (row.fields.external_id as string) ?? null,
      first_name: (row.fields.first_name as string) ?? null,
      last_name: (row.fields.last_name as string) ?? null,
      email: (row.fields.email as string) ?? null,
      phone: (row.fields.phone as string) ?? null,
      language: (row.fields.language as string) ?? "da",
      birth_year: (row.fields.birth_year as number) ?? null,
      gender: (row.fields.gender as string) ?? null,
      city: (row.fields.city as string) ?? null,
      postal_code: (row.fields.postal_code as string) ?? null,
      country: (row.fields.country as string) ?? "DK",
      customer_status: (row.fields.customer_status as string) ?? null,
      recruitment_source: (row.fields.recruitment_source as string) ?? null,
    });

    const customFields = await tx`select id, key from custom_fields`;
    const fieldIdByKey = new Map(customFields.map((f) => [f.key as string, f.id as string]));

    async function writeAttributes(panelistId: string, attributes: Record<string, string>) {
      for (const [key, value] of Object.entries(attributes)) {
        const fieldId = fieldIdByKey.get(key);
        if (!fieldId) continue;
        await tx`insert into panelist_attributes (panelist_id, field_id, org_id, value)
                 values (${panelistId}, ${fieldId}, ${session.orgId}, ${tx.json(value)})
                 on conflict (panelist_id, field_id) do update set value = excluded.value, updated_at = now()`;
      }
    }

    for (const row of creates) {
      const f = fieldsFor(row);
      const [p] = await tx`
        insert into panelists (org_id, external_id, first_name, last_name, email, phone, language,
                               birth_year, gender, city, postal_code, country, customer_status,
                               recruitment_source, lifecycle, import_batch_id)
        values (${session.orgId}, ${f.external_id}, ${f.first_name}, ${f.last_name}, ${f.email}, ${f.phone},
                ${f.language}, ${f.birth_year}, ${f.gender}, ${f.city}, ${f.postal_code}, ${f.country},
                ${f.customer_status}, ${f.recruitment_source}, 'active', ${batchId})
        returning id`;
      await tx`insert into consent_records (org_id, panelist_id, purpose, status, source, granted_at)
               values (${session.orgId}, ${p.id}, 'survey_contact', 'granted', ${"import:" + name}, now()),
                      (${session.orgId}, ${p.id}, 'panel_membership', 'granted', ${"import:" + name}, now())`;
      await writeAttributes(p.id as string, row.attributes);
    }

    for (const { row, existingId } of updates) {
      const f = fieldsFor(row);
      await tx`
        update panelists set
          first_name = coalesce(${f.first_name}, first_name),
          last_name = coalesce(${f.last_name}, last_name),
          email = coalesce(${f.email}, email),
          phone = coalesce(${f.phone}, phone),
          language = coalesce(${f.language}, language),
          birth_year = coalesce(${f.birth_year}, birth_year),
          gender = coalesce(${f.gender}, gender),
          city = coalesce(${f.city}, city),
          postal_code = coalesce(${f.postal_code}, postal_code),
          customer_status = coalesce(${f.customer_status}, customer_status),
          updated_at = now()
        where id = ${existingId}`;
      await writeAttributes(existingId, row.attributes);
    }

    await tx`update import_batches set status = 'committed', dry_run = false,
             counts = ${tx.json(counts as never)}, error_report = ${tx.json(validation.errors as never)},
             committed_at = now()
             where id = ${batchId} and status = 'dry_run'`;
    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId,
      action: "panel.import.commit", entityType: "import_batch", entityId: batchId,
      details: counts as unknown as Record<string, unknown>,
    });
    return { batchId, counts, errorCount: validation.errors.length };
  });
  revalidatePath("/panel");
  return result;
}

export async function listBatches() {
  return withAuthorized("panel.view", async (tx) => {
    const rows = await tx`
      select ib.id, ib.filename, ib.status, ib.counts, ib.created_at, ib.committed_at,
             jsonb_array_length(ib.error_report) as error_count, u.full_name as author
      from import_batches ib join users u on u.id = ib.created_by
      order by ib.created_at desc limit 25`;
    return rows.map((r) => ({
      id: r.id as string,
      filename: r.filename as string,
      status: r.status as string,
      counts: r.counts as Record<string, number>,
      createdAt: (r.created_at as Date).toISOString(),
      errorCount: Number(r.error_count ?? 0),
      author: r.author as string,
    }));
  });
}
