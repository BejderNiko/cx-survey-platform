"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { withAuthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { Tx } from "@/lib/db";
import { checkFile, parseImportFile } from "@/lib/import/parse";
import { normalizeImportColumn, resolveImportConfig } from "@/lib/import/column-map";
import {
  completePanelImport,
  failPanelImport,
  planPanelImport,
  recoverStalePanelImports,
  startPanelImportCommit,
  writePanelImport,
  type PanelImportCounts,
} from "@/lib/import/panel-commit";

function previewRows(rows: Record<string, string>[]): Record<string, string>[] {
  return rows.slice(0, 8).map((row) => Object.fromEntries(
    Object.entries(row).map(([column, value]) => [
      column,
      /^(survey_contact|panel_membership)_(consent_)?evidence_ref$/i.test(normalizeImportColumn(column))
        ? "[reference hidden]"
        : value,
    ]),
  ));
}

async function fixedImportConfig(tx: Tx, orgId: string, columns: string[]) {
  const customFields = await tx`
    select key from custom_fields where org_id = ${orgId} order by key`;
  return resolveImportConfig(columns, customFields.map((field) => String(field.key)));
}

async function fileFromForm(formData: FormData): Promise<{ buffer: Buffer; name: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Der er ikke valgt nogen fil.");
  const problem = checkFile(file.name, file.size, file.type);
  if (problem) throw new Error(problem);
  return { buffer: Buffer.from(await file.arrayBuffer()), name: file.name };
}

export async function parseStep(formData: FormData) {
  return withAuthorized("panel.import", async (tx, session) => {
    const { buffer, name } = await fileFromForm(formData);
    const sheet = (formData.get("sheet") as string) || undefined;
    const parsed = await parseImportFile(buffer, name, sheet);
    const config = await fixedImportConfig(tx, session.orgId, parsed.columns);
    return {
      filename: name,
      columns: parsed.columns,
      preview: previewRows(parsed.rows),
      rowCount: parsed.meta.rowCount,
      mappedColumnCount: Object.values(config.mapping).filter(Boolean).length,
      unmappedColumns: config.unmappedColumns,
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
    "surveyContactGranted", "surveyContactWithdrawn", "surveyContactNoEvidence",
    "panelMembershipGranted", "panelMembershipWithdrawn", "panelMembershipNoEvidence",
  ];
  return keys.every((key) => Number(stored[key]) === current[key]);
}

const IMPORT_COMMIT_FAILURE_MESSAGE = "Importen kunne ikke gennemføres. Kontroller filen og prøv igen.";

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
  } catch {
    const message = IMPORT_COMMIT_FAILURE_MESSAGE;
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
      // Database outage can also prevent durable failure finalization.
    }
    revalidatePath("/panel/import");
    throw new Error(message);
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
