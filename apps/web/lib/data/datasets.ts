import { instrumentDefinition } from "@ok/domain";
import type { Tx } from "../db";
import type { DatasetPayload, VariablePayload } from "../analytics-client";
import { buildResponseDataset, type ResponseRecord } from "../dataset-build";

/** Load a dataset version (rows + variable metadata) as an analytics payload. */
export async function loadDatasetPayload(tx: Tx, datasetVersionId: string): Promise<DatasetPayload | null> {
  const [version] = await tx`select id, rows from dataset_versions where id = ${datasetVersionId}`;
  if (!version) return null;
  const vars = await tx`
    select name, label, var_type, measure, value_labels, missing_values
    from variables where dataset_version_id = ${datasetVersionId} order by position`;
  return {
    variables: vars.map((v) => ({
      name: v.name as string,
      label: v.label as string,
      var_type: v.var_type as string,
      measure: v.measure as string,
      value_labels: (v.value_labels ?? {}) as Record<string, string>,
      missing_values: (v.missing_values ?? []) as unknown[],
    })),
    rows: (version.rows ?? []) as Record<string, unknown>[],
  };
}

export async function insertDatasetVersion(
  tx: Tx,
  input: {
    orgId: string;
    datasetId: string;
    rows: Record<string, unknown>[];
    variables: VariablePayload[];
    lineage: Record<string, unknown>;
    createdBy: string;
  },
): Promise<string> {
  const [next] = await tx`
    select coalesce(max(version_number), 0) + 1 as v from dataset_versions where dataset_id = ${input.datasetId}`;
  const [version] = await tx`
    insert into dataset_versions (org_id, dataset_id, version_number, row_count, variable_count, lineage, rows, created_by)
    values (${input.orgId}, ${input.datasetId}, ${next.v}, ${input.rows.length}, ${input.variables.length},
            ${tx.json(input.lineage as never)}, ${tx.json(input.rows as never)}, ${input.createdBy})
    returning id`;
  for (let i = 0; i < input.variables.length; i++) {
    const v = input.variables[i];
    await tx`insert into variables (org_id, dataset_version_id, name, label, var_type, measure, value_labels, missing_values, role, position)
             values (${input.orgId}, ${version.id}, ${v.name}, ${v.label}, ${v.var_type}, ${v.measure},
                     ${tx.json(v.value_labels)}, ${tx.json(v.missing_values as never)}, 'input', ${i})`;
  }
  return version.id as string;
}

/** Build (or refresh) the response dataset for a study: never mutates responses. */
export async function buildStudyDataset(
  tx: Tx,
  input: { orgId: string; studyId: string; userId: string },
): Promise<{ datasetId: string; versionId: string; rowCount: number }> {
  const [study] = await tx`select id, title from studies where id = ${input.studyId}`;
  if (!study) throw new Error("Study not found");
  const [version] = await tx`
    select id, version_number, definition from study_versions
    where study_id = ${input.studyId} order by version_number desc limit 1`;
  if (!version) throw new Error("The study has no published version yet.");
  const def = instrumentDefinition.parse(version.definition);

  const respRows = await tx`
    select r.id, r.respondent_key, r.completed_at, r.language, r.channel, r.panelist_id,
           p.gender, p.birth_year, p.customer_status
    from responses r left join panelists p on p.id = r.panelist_id
    where r.study_id = ${input.studyId} and r.study_version_id = ${version.id} and r.status = 'completed'
    order by r.started_at`;
  const answers = await tx`
    select response_id, question_code, value from response_answers
    where response_id in (select id from responses where study_id = ${input.studyId}
      and study_version_id = ${version.id} and status = 'completed')`;
  const byResponse = new Map<string, Record<string, unknown>>();
  for (const a of answers) {
    const m = byResponse.get(a.response_id) ?? {};
    m[a.question_code] = a.value;
    byResponse.set(a.response_id, m);
  }
  const records: ResponseRecord[] = respRows.map((r) => ({
    respondentKey: r.respondent_key,
    completedAt: r.completed_at?.toISOString() ?? null,
    language: r.language,
    channel: r.channel,
    answers: byResponse.get(r.id) ?? {},
    panelist: r.panelist_id ? { gender: r.gender, birthYear: r.birth_year, customerStatus: r.customer_status } : null,
  }));
  const built = buildResponseDataset(def, records, { includePanelist: true });

  const name = `${study.title} — v${version.version_number} responses`;
  const [existing] = await tx`select id from datasets where org_id = ${input.orgId} and name = ${name}`;
  let datasetId: string;
  if (existing) {
    datasetId = existing.id as string;
  } else {
    const [ds] = await tx`
      insert into datasets (org_id, name, description, source_kind, source_study_id, owner_id)
      values (${input.orgId}, ${name}, 'Wide response dataset built from one immutable study version.',
              'study_responses', ${input.studyId}, ${input.userId})
      returning id`;
    datasetId = ds.id as string;
  }
  const versionId = await insertDatasetVersion(tx, {
    orgId: input.orgId,
    datasetId,
    rows: built.rows,
    variables: built.variables.map((v) => ({
      name: v.name, label: v.label, var_type: v.varType, measure: v.measure,
      value_labels: v.valueLabels, missing_values: v.missingValues,
    })),
    lineage: {
      studyId: input.studyId,
      studyVersion: version.version_number,
      builtAt: new Date().toISOString(),
      method: "buildResponseDataset@1",
    },
    createdBy: input.userId,
  });
  return { datasetId, versionId, rowCount: built.rows.length };
}
