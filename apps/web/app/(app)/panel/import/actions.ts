"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { withAuthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { Tx } from "@/lib/db";
import { checkFile, parseImportFile } from "@/lib/import/parse";
import {
  completePanelImport,
  failPanelImport,
  planPanelImport,
  recoverStalePanelImports,
  startPanelImportCommit,
  writePanelImport,
  type PanelImportCounts,
} from "@/lib/import/panel-commit";
import type { DedupRule, ImportMapping } from "@/lib/import/validate";

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

async function fixedImportConfig(tx: Tx, orgId: string, columns: string[]) {
  const customFields = await tx`
    select key from custom_fields where org_id = ${orgId} order by key`;
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

function fileFingerprint(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function samePlanCounts(stored: Record<string, unknown>, current: PanelImportCounts): boolean {
  const keys: (keyof PanelImportCounts)[] = [
    "total", "valid", "invalid", "create", "update", "skippedDuplicates", "before",
  ];
  return keys.every((key) => Number(stored[key]) === current[key]);
}

function failureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Importen fejlede.";
  return message.slice(0, 1000);
}

export async function dryRunStep(formData: FormData) {
  const consentConfirmed = formData.get("consentConfirmed") === "true";
  if (!consentConfirmed) throw new Error("Bekræft samtykkegrundlaget, før importen køres.");

  return withAuthorized("panel.import", async (tx, session) => {
    await recoverStalePanelImports(tx, session.orgId);
    const { buffer, name } = await fileFromForm(formData);
    const sheet = (formData.get("sheet") as string) || undefined;
    const parsed = await parseImportFile(buffer, name, sheet);
    const { mapping, dedupRule } = await fixedImportConfig(tx, session.orgId, parsed.columns);
    const plan = await planPanelImport(tx, session.orgId, parsed.rows, mapping, dedupRule);
    const reviewBinding = { fileSha256: fileFingerprint(buffer), sheet: sheet ?? null };

    const [batch] = await tx`
      insert into import_batches (
        org_id, filename, file_kind, status, mapping, dedup_rule, counts,
        error_report, dry_run, created_by
      )
      values (
        ${session.orgId}, ${name}, ${name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv"},
        'dry_run', ${tx.json(mapping)}, ${dedupRule},
        ${tx.json({ ...plan.counts, ...reviewBinding } as never)},
        ${tx.json(plan.validation.errors as never)}, true, ${session.userId}
      )
      returning id`;
    await audit(tx, {
      orgId: session.orgId,
      actorUserId: session.userId,
      action: "panel.import.dry_run",
      entityType: "import_batch",
      entityId: batch.id as string,
      details: plan.counts as unknown as Record<string, unknown>,
    });
    return {
      batchId: batch.id as string,
      status: "dry_run" as const,
      counts: plan.counts,
      errors: plan.validation.errors.slice(0, 100),
    };
  });
}

export async function commitStep(formData: FormData) {
  const consentConfirmed = formData.get("consentConfirmed") === "true";
  if (!consentConfirmed) throw new Error("Bekræft samtykkegrundlaget, før importen gennemføres.");
  const batchId = String(formData.get("batchId") ?? "");
  if (!batchId) throw new Error("Kør valideringen først.");

  const prepared = await withAuthorized("panel.import", async (tx, session) => {
    await recoverStalePanelImports(tx, session.orgId);
    const { buffer, name } = await fileFromForm(formData);
    const sheet = (formData.get("sheet") as string) || undefined;
    const parsed = await parseImportFile(buffer, name, sheet);
    const { mapping, dedupRule } = await fixedImportConfig(tx, session.orgId, parsed.columns);
    await startPanelImportCommit(tx, {
      orgId: session.orgId,
      batchId,
      filename: name,
      mapping,
      dedupRule,
      fileSha256: fileFingerprint(buffer),
      sheet: sheet ?? null,
    });
    return {
      orgId: session.orgId,
      name,
      parsed,
      mapping,
      dedupRule,
    };
  });

  try {
    const result = await withAuthorized("panel.import", async (tx, session) => {
      if (session.orgId !== prepared.orgId) throw new Error("Organisationen er ændret under importen.");

      // Serialize panel commits within one organization. Every import path uses
      // this organization row lock before it calculates create/update counts.
      const orgLock = await tx`
        select id from organizations where id = ${session.orgId} for update`;
      if (orgLock.length !== 1) throw new Error("Organisationen blev ikke fundet.");

      const [batch] = await tx`
        select counts
        from import_batches
        where id = ${batchId}
          and org_id = ${session.orgId}
          and status = 'committing'
        for update`;
      if (!batch) throw new Error("Importen er ikke klar til databasecommit.");

      const plan = await planPanelImport(
        tx,
        session.orgId,
        prepared.parsed.rows,
        prepared.mapping,
        prepared.dedupRule,
      );
      if (!samePlanCounts(batch.counts as Record<string, unknown>, plan.counts)) {
        throw new Error("Paneldata er ændret efter prøvekørslen. Kør gennemgangen igen, før du gennemfører.");
      }

      const verification = await writePanelImport(tx, {
        orgId: session.orgId,
        batchId,
        filename: prepared.name,
        plan,
      });
      const expectedAfter = plan.counts.before + plan.counts.create;
      if (verification.after !== expectedAfter) {
        throw new Error(
          `Paneltotal efter commit er ${verification.after}; ${expectedAfter} var forventet.`,
        );
      }
      if (verification.linked !== plan.counts.valid) {
        throw new Error(
          `${verification.linked} panelister peger på importbatch; ${plan.counts.valid} var forventet.`,
        );
      }

      const counts = { ...plan.counts, after: verification.after };
      await completePanelImport(tx, {
        orgId: session.orgId,
        batchId,
        counts,
        errors: plan.validation.errors,
      });
      await audit(tx, {
        orgId: session.orgId,
        actorUserId: session.userId,
        action: "panel.import.commit",
        entityType: "import_batch",
        entityId: batchId,
        details: counts as unknown as Record<string, unknown>,
      });
      return {
        batchId,
        status: "committed" as const,
        counts,
        errorCount: plan.validation.errors.length,
      };
    });
    revalidatePath("/panel");
    revalidatePath("/panel/import");
    return result;
  } catch (error) {
    const message = failureMessage(error);
    try {
      await withAuthorized("panel.import", async (tx, session) => {
        const failed = await failPanelImport(tx, {
          orgId: session.orgId,
          batchId,
          message,
        });
        if (failed) {
          await audit(tx, {
            orgId: session.orgId,
            actorUserId: session.userId,
            action: "panel.import.failed",
            entityType: "import_batch",
            entityId: batchId,
            details: { message },
          });
        }
      });
    } catch {
      // Keep original commit failure. Database outage can also prevent durable
      // failure finalization; caller still receives controlled failure text.
    }
    revalidatePath("/panel/import");
    throw error;
  }
}

export async function listBatches() {
  return withAuthorized("panel.view", async (tx, session) => {
    await recoverStalePanelImports(tx, session.orgId);
    const rows = await tx`
      select ib.id, ib.filename, ib.status, ib.counts, ib.created_at,
             ib.committed_at, ib.failure_message,
             jsonb_array_length(ib.error_report) as error_count,
             u.full_name as author
      from import_batches ib
      join users u on u.id = ib.created_by
      where ib.org_id = ${session.orgId}
      order by ib.created_at desc
      limit 25`;
    return rows.map((row) => ({
      id: row.id as string,
      filename: row.filename as string,
      status: row.status as string,
      counts: row.counts as Record<string, number>,
      createdAt: (row.created_at as Date).toISOString(),
      errorCount: Number(row.error_count ?? 0),
      failureMessage: (row.failure_message as string | null) ?? null,
      author: row.author as string,
    }));
  });
}
