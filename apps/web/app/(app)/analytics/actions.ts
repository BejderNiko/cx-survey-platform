"use server";

import { revalidatePath } from "next/cache";
import { withAuthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  runAnalysisRemote,
  AnalyticsServiceError,
  type AnalysisResultPayload,
} from "@/lib/analytics-client";
import { buildStudyDataset, insertDatasetVersion, loadDatasetPayload } from "@/lib/data/datasets";

export async function createDatasetFromStudy(studyId: string) {
  const result = await withAuthorized("datasets.create", async (tx, session) => {
    const res = await buildStudyDataset(tx, { orgId: session.orgId, studyId, userId: session.userId });
    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId,
      action: "dataset.build", entityType: "dataset", entityId: res.datasetId,
      details: { studyId, rows: res.rowCount },
    });
    return res;
  });
  revalidatePath("/analytics");
  return result;
}

export interface RunAnalysisInput {
  datasetVersionId: string;
  procedure: string;
  params: Record<string, unknown>;
  seed?: number | null;
  recipeName?: string | null; // save as reusable recipe when provided
  recipeId?: string | null;   // rerun of an existing recipe
}

export async function runAnalysis(input: RunAnalysisInput): Promise<{
  runId: string;
  result: AnalysisResultPayload | null;
  error: string | null;
}> {
  return withAuthorized("analytics.run", async (tx, session) => {
    const payload = await loadDatasetPayload(tx, input.datasetVersionId);
    if (!payload) throw new Error("Dataset version not found");

    let recipeId = input.recipeId ?? null;
    if (!recipeId && input.recipeName) {
      const [version] = await tx`select dataset_id from dataset_versions where id = ${input.datasetVersionId}`;
      const [recipe] = await tx`
        insert into analysis_recipes (org_id, dataset_id, name, procedure, params, created_by)
        values (${session.orgId}, ${version.dataset_id}, ${input.recipeName}, ${input.procedure},
                ${tx.json(input.params as never)}, ${session.userId})
        returning id`;
      recipeId = recipe.id as string;
    }

    const [run] = await tx`
      insert into analysis_runs (org_id, recipe_id, dataset_version_id, procedure, params, status, seed, created_by)
      values (${session.orgId}, ${recipeId}, ${input.datasetVersionId}, ${input.procedure},
              ${tx.json(input.params as never)}, 'running', ${input.seed ?? null}, ${session.userId})
      returning id`;

    try {
      const result = await runAnalysisRemote({
        procedure: input.procedure,
        params: input.params,
        seed: input.seed ?? null,
        dataset: payload,
      });
      await tx`update analysis_runs set status = 'succeeded', results = ${tx.json(result as never)},
               library_versions = ${tx.json(result.library_versions)}, seed = ${result.seed},
               finished_at = now() where id = ${run.id}`;
      revalidatePath("/analytics");
      return { runId: run.id as string, result, error: null };
    } catch (e) {
      const message = e instanceof AnalyticsServiceError ? e.message : "Analysis failed.";
      await tx`update analysis_runs set status = 'failed', error = ${message}, finished_at = now()
               where id = ${run.id}`;
      return { runId: run.id as string, result: null, error: message };
    }
  });
}

/** Rerun a saved recipe against a dataset version (defaults to the recipe's original params). */
export async function rerunRecipe(recipeId: string, datasetVersionId: string) {
  const recipe = await withAuthorized("analytics.run", async (tx) => {
    const [r] = await tx`select procedure, params from analysis_recipes where id = ${recipeId}`;
    return r ?? null;
  });
  if (!recipe) throw new Error("Recipe not found");
  return runAnalysis({
    datasetVersionId,
    procedure: recipe.procedure as string,
    params: recipe.params as Record<string, unknown>,
    recipeId,
  });
}

export interface DeriveInput {
  datasetVersionId: string;
  name: string;
  filterVariable?: string | null;
  filterOp?: string | null;
  filterValue?: string | null;
  keepVariables: string[];
}

/** Create a derived dataset (filter + column selection) without touching the source. */
export async function deriveDataset(input: DeriveInput) {
  const result = await withAuthorized("datasets.create", async (tx, session) => {
    const payload = await loadDatasetPayload(tx, input.datasetVersionId);
    if (!payload) throw new Error("Dataset version not found");
    const [source] = await tx`
      select dv.dataset_id, dv.version_number, d.name as dataset_name
      from dataset_versions dv join datasets d on d.id = dv.dataset_id
      where dv.id = ${input.datasetVersionId}`;

    let rows = payload.rows;
    let filterDesc: string | null = null;
    if (input.filterVariable && input.filterOp && input.filterValue !== null && input.filterValue !== undefined && input.filterValue !== "") {
      const raw = input.filterValue;
      const num = Number(raw);
      const cmp = (v: unknown): boolean => {
        if (v === null || v === undefined) return false;
        const numeric = !Number.isNaN(num) && typeof v !== "boolean";
        const a = numeric ? Number(v) : String(v);
        const b = numeric ? num : raw;
        switch (input.filterOp) {
          case "eq": return a === b;
          case "ne": return a !== b;
          case "lt": return a < b;
          case "lte": return a <= b;
          case "gt": return a > b;
          case "gte": return a >= b;
          case "contains": return String(v).includes(raw);
          default: return false;
        }
      };
      rows = rows.filter((r) => cmp(r[input.filterVariable!]));
      filterDesc = `${input.filterVariable} ${input.filterOp} ${raw}`;
    }
    const keep = new Set(input.keepVariables);
    const variables = payload.variables.filter((v) => keep.has(v.name));
    rows = rows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const v of variables) out[v.name] = r[v.name] ?? null;
      return out;
    });

    const [ds] = await tx`
      insert into datasets (org_id, name, description, source_kind, parent_dataset_id, owner_id)
      values (${session.orgId}, ${input.name}, ${`Derived from ${source.dataset_name} v${source.version_number}${filterDesc ? ` where ${filterDesc}` : ""}`},
              'derived', ${source.dataset_id}, ${session.userId})
      returning id`;
    const versionId = await insertDatasetVersion(tx, {
      orgId: session.orgId,
      datasetId: ds.id as string,
      rows,
      variables,
      lineage: {
        parentDatasetId: source.dataset_id,
        parentVersion: source.version_number,
        transformation: { filter: filterDesc, keptVariables: input.keepVariables },
        derivedAt: new Date().toISOString(),
      },
      createdBy: session.userId,
    });
    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId,
      action: "dataset.derive", entityType: "dataset", entityId: ds.id as string,
      details: { from: source.dataset_id, filter: filterDesc, rows: rows.length },
    });
    return { datasetId: ds.id as string, versionId, rowCount: rows.length };
  });
  revalidatePath("/analytics");
  return result;
}
