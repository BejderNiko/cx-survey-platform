"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAuthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { insertDatasetVersion } from "@/lib/data/datasets";
import { checkFile, IMPORT_LIMITS, parseImportFile } from "@/lib/import/parse";
import {
  buildRawDataset,
  inferRawVariables,
  type RawVariableSpec,
} from "@/lib/import/raw-dataset";

const variableSpecSchema = z.object({
  sourceColumn: z.string().min(1).max(300),
  include: z.boolean(),
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/),
  label: z.string().min(1).max(300),
  varType: z.enum(["numeric", "string", "date"]),
  measure: z.enum(["nominal", "ordinal", "scale"]),
  missingValues: z.array(z.string().max(200)).max(50),
});
const variableSpecsSchema = z.array(variableSpecSchema).min(1).max(500);
const datasetNameSchema = z.string().trim().min(1).max(160);

async function readFile(formData: FormData): Promise<{ buffer: Buffer; name: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Vælg en CSV- eller XLSX-fil.");
  const problem = checkFile(file.name, file.size, file.type);
  if (problem) throw new Error(problem);
  return { buffer: Buffer.from(await file.arrayBuffer()), name: file.name };
}

function fingerprint(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function selectedSheet(formData: FormData): string | undefined {
  const value = String(formData.get("sheet") ?? "").trim();
  return value || undefined;
}

export async function previewRawData(formData: FormData) {
  await withAuthorized("datasets.create", async () => true);
  const { buffer, name } = await readFile(formData);
  const sheet = selectedSheet(formData);
  const parsed = await parseImportFile(buffer, name, sheet);
  return {
    filename: name,
    fingerprint: fingerprint(buffer),
    sheet: parsed.meta.sheet ?? sheet ?? null,
    sheetNames: parsed.sheetNames ?? null,
    delimiter: parsed.meta.delimiter ?? null,
    rowCount: parsed.meta.rowCount,
    columns: parsed.columns,
    previewRows: parsed.rows.slice(0, 8),
    variables: inferRawVariables(parsed),
    limits: {
      maxBytes: IMPORT_LIMITS.maxBytes,
      maxRows: IMPORT_LIMITS.maxRows,
    },
  };
}

export async function importRawData(formData: FormData) {
  await withAuthorized("datasets.create", async () => true);
  const { buffer, name: filename } = await readFile(formData);
  const expectedFingerprint = String(formData.get("fingerprint") ?? "");
  const actualFingerprint = fingerprint(buffer);
  if (!expectedFingerprint || expectedFingerprint !== actualFingerprint) {
    throw new Error("Filen er ændret efter preview. Indlæs preview igen.");
  }

  const sheet = selectedSheet(formData);
  const parsed = await parseImportFile(buffer, filename, sheet);
  const datasetName = datasetNameSchema.parse(formData.get("datasetName"));
  let specs: RawVariableSpec[];
  try {
    specs = variableSpecsSchema.parse(JSON.parse(String(formData.get("variables") ?? "[]")));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new Error("Variabelmetadata er ugyldige. Gennemgå mappingen og prøv igen.");
    }
    throw error;
  }
  const built = buildRawDataset(parsed, specs);
  const format = filename.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv";
  const importedAt = new Date().toISOString();

  const result = await withAuthorized("datasets.create", async (tx, session) => {
    const [dataset] = await tx`
      insert into datasets (
        org_id, name, description, source_kind, owner_id
      )
      values (
        ${session.orgId}, ${datasetName},
        ${`Ekstern rådata fra ${filename}. Kildedata ændres ikke.`},
        'file_import', ${session.userId}
      )
      returning id`;
    const versionId = await insertDatasetVersion(tx, {
      orgId: session.orgId,
      datasetId: dataset.id as string,
      rows: built.rows,
      variables: built.variables,
      lineage: {
        sourceKind: "external_raw_data",
        filename,
        format,
        worksheet: parsed.meta.sheet ?? sheet ?? null,
        delimiter: parsed.meta.delimiter ?? null,
        fileSha256: actualFingerprint,
        importedAt,
        parser: "raw-dataset@1",
      },
      createdBy: session.userId,
    });
    await audit(tx, {
      orgId: session.orgId,
      actorUserId: session.userId,
      action: "dataset.file_import",
      entityType: "dataset",
      entityId: dataset.id as string,
      details: {
        versionId,
        filename,
        format,
        worksheet: parsed.meta.sheet ?? sheet ?? null,
        rows: built.rows.length,
        variables: built.variables.length,
      },
    });
    return {
      datasetId: dataset.id as string,
      versionId,
      sourceKind: "file_import" as const,
      rowCount: built.rows.length,
      variableCount: built.variables.length,
    };
  });
  revalidatePath("/analytics");
  return result;
}
