import { randomUUID } from "node:crypto";
import type { Tx } from "../db";
import {
  validateRows,
  type DedupRule,
  type ImportMapping,
  type NormalizedRow,
} from "./validate";

const WRITE_CHUNK_SIZE = 500;

export interface PanelImportCounts {
  total: number;
  valid: number;
  invalid: number;
  create: number;
  update: number;
  skippedDuplicates: number;
  before: number;
  after?: number;
}

export interface PanelImportPlan {
  validation: ReturnType<typeof validateRows>;
  counts: PanelImportCounts;
  creates: NormalizedRow[];
  updates: { row: NormalizedRow; existingId: string }[];
}

type PanelistFields = {
  externalId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  language: string | null;
  birthYear: number | null;
  gender: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  customerStatus: string | null;
  recruitmentSource: string | null;
};

type PanelistWrite = PanelistFields & {
  id: string;
  attributes: Record<string, string>;
  tags?: string[];
};

function chunks<T>(items: T[], size = WRITE_CHUNK_SIZE): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    result.push(items.slice(offset, offset + size));
  }
  return result;
}

function fieldsFor(row: NormalizedRow): PanelistFields {
  return {
    externalId: (row.fields.external_id as string) ?? null,
    firstName: (row.fields.first_name as string) ?? null,
    lastName: (row.fields.last_name as string) ?? null,
    email: (row.fields.email as string) ?? null,
    phone: (row.fields.phone as string) ?? null,
    language: (row.fields.language as string) ?? null,
    birthYear: (row.fields.birth_year as number) ?? null,
    gender: (row.fields.gender as string) ?? null,
    city: (row.fields.city as string) ?? null,
    postalCode: (row.fields.postal_code as string) ?? null,
    country: (row.fields.country as string) ?? null,
    customerStatus: (row.fields.customer_status as string) ?? null,
    recruitmentSource: (row.fields.recruitment_source as string) ?? null,
  };
}

function keyFor(value: unknown, dedupRule: DedupRule): string {
  const key = String(value ?? "");
  return dedupRule === "email" ? key.toLowerCase() : key;
}

export const PANEL_COMMIT_LEASE_MINUTES = 15;
const STALE_COMMIT_MESSAGE = "Importen blev afbrudt før databasecommit og er markeret som fejlet.";

export async function recoverStalePanelImports(tx: Tx, orgId: string): Promise<number> {
  const recovered = await tx`
    update import_batches
    set status = 'failed', failed_at = now(), failure_message = ${STALE_COMMIT_MESSAGE}
    where org_id = ${orgId}
      and status = 'committing'
      and coalesce(commit_started_at, created_at) < now() - interval '15 minutes'
    returning id`;
  return recovered.length;
}

export async function startPanelImportCommit(
  tx: Tx,
  input: {
    orgId: string;
    batchId: string;
    filename: string;
    mapping: ImportMapping;
    dedupRule: DedupRule;
    fileSha256: string;
    sheet: string | null;
  },
): Promise<Record<string, unknown>> {
  const [batch] = await tx`
    select counts
    from import_batches
    where id = ${input.batchId}
      and org_id = ${input.orgId}
      and status = 'dry_run'
      and filename = ${input.filename}
      and mapping = ${tx.json(input.mapping as never)}
      and dedup_rule = ${input.dedupRule}
    for update`;
  if (!batch) throw new Error("Valideringen svarer ikke længere til denne import.");
  const stored = batch.counts as Record<string, unknown> & {
    fileSha256?: string;
    sheet?: string | null;
  };
  if (stored.fileSha256 !== input.fileSha256 || stored.sheet !== input.sheet) {
    throw new Error("Filen eller arket er ændret efter valideringen. Vælg filen igen.");
  }
  const started = await tx`
    update import_batches
    set status = 'committing', commit_started_at = now(),
        failure_message = null, failed_at = null
    where id = ${input.batchId} and org_id = ${input.orgId} and status = 'dry_run'
    returning id`;
  if (started.length !== 1) throw new Error("Importen kunne ikke startes.");
  return stored;
}

export async function completePanelImport(
  tx: Tx,
  input: {
    orgId: string;
    batchId: string;
    counts: PanelImportCounts;
    errors: unknown[];
  },
): Promise<void> {
  const committed = await tx`
    update import_batches
    set status = 'committed', dry_run = false,
        counts = ${tx.json(input.counts as never)},
        error_report = ${tx.json(input.errors as never)},
        committed_at = now(), failure_message = null, failed_at = null
    where id = ${input.batchId}
      and org_id = ${input.orgId}
      and status = 'committing'
    returning status, committed_at`;
  if (
    committed.length !== 1
    || committed[0].status !== "committed"
    || !committed[0].committed_at
  ) {
    throw new Error("Importbatch blev ikke dokumenteret som gennemført.");
  }
}

export async function failPanelImport(
  tx: Tx,
  input: { orgId: string; batchId: string; message: string },
): Promise<boolean> {
  const failed = await tx`
    update import_batches
    set status = 'failed', failed_at = now(), failure_message = ${input.message}
    where id = ${input.batchId}
      and org_id = ${input.orgId}
      and status = 'committing'
    returning id`;
  return failed.length === 1;
}
export async function planPanelImport(
  tx: Tx,
  orgId: string,
  rows: Record<string, string>[],
  mapping: ImportMapping,
  dedupRule: DedupRule,
): Promise<PanelImportPlan> {
  const validation = validateRows(rows, mapping, dedupRule);
  const updates: PanelImportPlan["updates"] = [];
  const creates: NormalizedRow[] = [];

  if (dedupRule !== "none" && validation.valid.length > 0) {
    const keys = validation.valid.map((row) => String(row.fields[dedupRule] ?? ""));
    const existing =
      dedupRule === "external_id"
        ? await tx`
            select id, external_id as key
            from panelists
            where org_id = ${orgId} and external_id = any(${keys})`
        : await tx`
            select id, email::text as key
            from panelists
            where org_id = ${orgId} and email = any(${keys})`;
    const byKey = new Map(
      existing.map((entry) => [
        keyFor(entry.key, dedupRule),
        entry.id as string,
      ]),
    );
    for (const row of validation.valid) {
      const existingId = byKey.get(keyFor(row.fields[dedupRule], dedupRule));
      if (existingId) updates.push({ row, existingId });
      else creates.push(row);
    }
  } else {
    creates.push(...validation.valid);
  }

  const [panelTotal] = await tx`
    select count(*)::int as count from panelists where org_id = ${orgId}`;
  const invalidRows = new Set(
    validation.errors
      .filter((error) => error.rowNumber > 0)
      .map((error) => error.rowNumber),
  );
  return {
    validation,
    counts: {
      total: rows.length,
      valid: validation.valid.length,
      invalid: invalidRows.size,
      create: creates.length,
      update: updates.length,
      skippedDuplicates: validation.duplicatesInFile,
      before: Number(panelTotal.count),
    },
    creates,
    updates,
  };
}

async function insertPanelists(
  tx: Tx,
  orgId: string,
  batchId: string,
  rows: PanelistWrite[],
): Promise<void> {
  for (const group of chunks(rows)) {
    const inserted = await tx`
      insert into panelists (
        id, org_id, external_id, first_name, last_name, email, phone, language,
        birth_year, gender, city, postal_code, country, customer_status,
        recruitment_source, lifecycle, import_batch_id
      )
      select
        input.id, ${orgId}, input.external_id, input.first_name, input.last_name,
        input.email::citext, input.phone, coalesce(input.language, 'da'),
        input.birth_year, input.gender, input.city, input.postal_code,
        coalesce(input.country, 'DK'), input.customer_status,
        input.recruitment_source, 'active'::panelist_lifecycle, ${batchId}
      from unnest(
        ${group.map((row) => row.id)}::uuid[],
        ${group.map((row) => row.externalId)}::text[],
        ${group.map((row) => row.firstName)}::text[],
        ${group.map((row) => row.lastName)}::text[],
        ${group.map((row) => row.email)}::text[],
        ${group.map((row) => row.phone)}::text[],
        ${group.map((row) => row.language)}::text[],
        ${group.map((row) => row.birthYear)}::int[],
        ${group.map((row) => row.gender)}::text[],
        ${group.map((row) => row.city)}::text[],
        ${group.map((row) => row.postalCode)}::text[],
        ${group.map((row) => row.country)}::text[],
        ${group.map((row) => row.customerStatus)}::text[],
        ${group.map((row) => row.recruitmentSource)}::text[]
      ) as input(
        id, external_id, first_name, last_name, email, phone, language,
        birth_year, gender, city, postal_code, country, customer_status,
        recruitment_source
      )
      returning id`;
    if (inserted.length !== group.length) {
      throw new Error(
        `Databaseoprettelse gav ${inserted.length} rækker; ${group.length} var forventet.`,
      );
    }
  }
}

async function updatePanelists(
  tx: Tx,
  orgId: string,
  batchId: string,
  rows: PanelistWrite[],
): Promise<void> {
  for (const group of chunks(rows)) {
    const updated = await tx`
      update panelists as panelist set
        external_id = coalesce(input.external_id, panelist.external_id),
        first_name = coalesce(input.first_name, panelist.first_name),
        last_name = coalesce(input.last_name, panelist.last_name),
        email = coalesce(input.email::citext, panelist.email),
        phone = coalesce(input.phone, panelist.phone),
        language = coalesce(input.language, panelist.language),
        birth_year = coalesce(input.birth_year, panelist.birth_year),
        gender = coalesce(input.gender, panelist.gender),
        city = coalesce(input.city, panelist.city),
        postal_code = coalesce(input.postal_code, panelist.postal_code),
        country = coalesce(input.country, panelist.country),
        customer_status = coalesce(input.customer_status, panelist.customer_status),
        recruitment_source = coalesce(input.recruitment_source, panelist.recruitment_source),
        import_batch_id = ${batchId},
        updated_at = now()
      from unnest(
        ${group.map((row) => row.id)}::uuid[],
        ${group.map((row) => row.externalId)}::text[],
        ${group.map((row) => row.firstName)}::text[],
        ${group.map((row) => row.lastName)}::text[],
        ${group.map((row) => row.email)}::text[],
        ${group.map((row) => row.phone)}::text[],
        ${group.map((row) => row.language)}::text[],
        ${group.map((row) => row.birthYear)}::int[],
        ${group.map((row) => row.gender)}::text[],
        ${group.map((row) => row.city)}::text[],
        ${group.map((row) => row.postalCode)}::text[],
        ${group.map((row) => row.country)}::text[],
        ${group.map((row) => row.customerStatus)}::text[],
        ${group.map((row) => row.recruitmentSource)}::text[]
      ) as input(
        id, external_id, first_name, last_name, email, phone, language,
        birth_year, gender, city, postal_code, country, customer_status,
        recruitment_source
      )
      where panelist.id = input.id and panelist.org_id = ${orgId}
      returning panelist.id`;
    if (updated.length !== group.length) {
      throw new Error(
        `Databaseopdatering gav ${updated.length} rækker; ${group.length} var forventet.`,
      );
    }
  }
}

async function insertCreateConsents(
  tx: Tx,
  orgId: string,
  filename: string,
  panelistIds: string[],
): Promise<void> {
  for (const group of chunks(panelistIds)) {
    await tx`
      insert into consent_records (
        org_id, panelist_id, purpose, status, source, granted_at
      )
      select
        ${orgId}, imported.id, purpose.name, 'granted'::consent_status,
        ${`import:${filename}`}, now()
      from unnest(${group}::uuid[]) as imported(id)
      cross join (
        values ('survey_contact'::text), ('panel_membership'::text)
      ) as purpose(name)`;
  }
}

async function upsertAttributes(
  tx: Tx,
  orgId: string,
  rows: PanelistWrite[],
): Promise<void> {
  const customFields = await tx`
    select id, key from custom_fields where org_id = ${orgId}`;
  const fieldIdByKey = new Map(
    customFields.map((field) => [field.key as string, field.id as string]),
  );
  const attributes = rows.flatMap((row) =>
    Object.entries(row.attributes).flatMap(([key, value]) => {
      const fieldId = fieldIdByKey.get(key);
      return fieldId ? [{ panelistId: row.id, fieldId, value }] : [];
    }),
  );
  for (const group of chunks(attributes)) {
    await tx`
      insert into panelist_attributes (
        panelist_id, field_id, org_id, value, updated_at
      )
      select
        input.panelist_id, input.field_id, ${orgId}, to_jsonb(input.value), now()
      from unnest(
        ${group.map((entry) => entry.panelistId)}::uuid[],
        ${group.map((entry) => entry.fieldId)}::uuid[],
        ${group.map((entry) => entry.value)}::text[]
      ) as input(panelist_id, field_id, value)
      on conflict (panelist_id, field_id)
      do update set value = excluded.value, updated_at = now()`;
  }
}

async function replaceImportedTags(
  tx: Tx,
  orgId: string,
  rows: PanelistWrite[],
): Promise<void> {
  const taggedRows = rows.filter((row) => row.tags !== undefined);
  if (taggedRows.length === 0) return;

  const panelistIds = taggedRows.map((row) => row.id);
  await tx`
    delete from panelist_tags
    where org_id = ${orgId} and panelist_id = any(${panelistIds})`;

  const tagNames = [...new Set(taggedRows.flatMap((row) => row.tags ?? []))];
  if (tagNames.length === 0) return;

  await tx`
    insert into tags (org_id, name)
    select ${orgId}, input.name
    from unnest(${tagNames}::text[]) as input(name)
    on conflict (org_id, name) do nothing`;

  const tagRows = await tx`
    select id, name from tags
    where org_id = ${orgId} and name = any(${tagNames})`;
  const tagIdByName = new Map(tagRows.map((tag) => [tag.name as string, tag.id as string]));
  const links = taggedRows.flatMap((row) =>
    (row.tags ?? []).flatMap((name) => {
      const tagId = tagIdByName.get(name);
      return tagId ? [{ panelistId: row.id, tagId }] : [];
    }),
  );
  for (const group of chunks(links)) {
    await tx`
      insert into panelist_tags (panelist_id, tag_id, org_id)
      select input.panelist_id, input.tag_id, ${orgId}
      from unnest(
        ${group.map((link) => link.panelistId)}::uuid[],
        ${group.map((link) => link.tagId)}::uuid[]
      ) as input(panelist_id, tag_id)
      on conflict (panelist_id, tag_id) do nothing`;
  }
}
export async function writePanelImport(
  tx: Tx,
  input: {
    orgId: string;
    batchId: string;
    filename: string;
    plan: PanelImportPlan;
  },
): Promise<{ after: number; linked: number }> {
  const creates: PanelistWrite[] = input.plan.creates.map((row) => ({
    id: randomUUID(),
    ...fieldsFor(row),
    attributes: row.attributes,
    tags: row.tags,
  }));
  const updates: PanelistWrite[] = input.plan.updates.map(({ row, existingId }) => ({
    id: existingId,
    ...fieldsFor(row),
    attributes: row.attributes,
    tags: row.tags,
  }));

  await insertPanelists(tx, input.orgId, input.batchId, creates);
  await updatePanelists(tx, input.orgId, input.batchId, updates);
  await insertCreateConsents(
    tx,
    input.orgId,
    input.filename,
    creates.map((row) => row.id),
  );
  await upsertAttributes(tx, input.orgId, [...creates, ...updates]);
  await replaceImportedTags(tx, input.orgId, [...creates, ...updates]);

  const [[panelTotal], [batchLinked]] = await Promise.all([
    tx`select count(*)::int as count from panelists where org_id = ${input.orgId}`,
    tx`
      select count(*)::int as count
      from panelists
      where org_id = ${input.orgId} and import_batch_id = ${input.batchId}`,
  ]);
  return {
    after: Number(panelTotal.count),
    linked: Number(batchLinked.count),
  };
}
