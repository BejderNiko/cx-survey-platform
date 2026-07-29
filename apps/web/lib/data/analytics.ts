import type { Tx } from "../db";

/** Analytics overview scoped explicitly to the organization selected in the session. */
export async function getAnalyticsOverview(tx: Tx, orgId: string) {
  const datasets = await tx`
    select d.id, d.name, d.description, d.source_kind, d.created_at, u.full_name as owner,
           s.title as study_title,
           (select max(version_number) from dataset_versions v
            where v.dataset_id = d.id and v.org_id = ${orgId}) as latest_version,
           (select row_count from dataset_versions v
            where v.dataset_id = d.id and v.org_id = ${orgId}
            order by version_number desc limit 1) as row_count,
           (select variable_count from dataset_versions v
            where v.dataset_id = d.id and v.org_id = ${orgId}
            order by version_number desc limit 1) as variable_count
    from datasets d
    join users u on u.id = d.owner_id
    left join studies s on s.id = d.source_study_id and s.org_id = ${orgId}
    where d.org_id = ${orgId}
    order by d.created_at desc`;
  const studies = await tx`
    select s.id, s.title from studies s
    where s.org_id = ${orgId}
      and exists (
        select 1 from study_versions v
        where v.study_id = s.id and v.org_id = ${orgId}
      )
    order by s.title`;
  const runs = await tx`
    select ar.id, ar.procedure, ar.status, ar.started_at, ar.error,
           u.full_name as author, d.name as dataset_name, d.id as dataset_id
    from analysis_runs ar
    join dataset_versions dv
      on dv.id = ar.dataset_version_id and dv.org_id = ${orgId}
    join datasets d on d.id = dv.dataset_id and d.org_id = ${orgId}
    join users u on u.id = ar.created_by
    where ar.org_id = ${orgId}
    order by ar.started_at desc limit 15`;
  return { datasets, studies, runs };
}

/** Dataset detail/workbench data scoped independently of RLS for defense in depth. */
export async function getDatasetWorkbenchData(
  tx: Tx,
  input: { orgId: string; datasetId: string; requestedVersionId?: string },
) {
  const [dataset] = await tx`
    select d.*, u.full_name as owner, s.title as study_title,
           pd.name as parent_name, pd.id as parent_id
    from datasets d
    join users u on u.id = d.owner_id
    left join studies s
      on s.id = d.source_study_id and s.org_id = ${input.orgId}
    left join datasets pd
      on pd.id = d.parent_dataset_id and pd.org_id = ${input.orgId}
    where d.id = ${input.datasetId} and d.org_id = ${input.orgId}`;
  if (!dataset) return null;

  const versions = await tx`
    select id, version_number, row_count, variable_count, lineage, created_at
    from dataset_versions
    where dataset_id = ${input.datasetId} and org_id = ${input.orgId}
    order by version_number desc`;
  const currentVersion = input.requestedVersionId
    ? versions.find((version) => version.id === input.requestedVersionId) ?? versions[0]
    : versions[0];
  if (!currentVersion) {
    return {
      dataset,
      versions,
      currentVersion: null,
      variables: [],
      rows: [],
      recipes: [],
      runs: [],
    };
  }

  const variables = await tx`
    select name, label, var_type, measure, value_labels, missing_values, role, position
    from variables
    where dataset_version_id = ${currentVersion.id} and org_id = ${input.orgId}
    order by position`;
  const [versionRows] = await tx`
    select rows from dataset_versions
    where id = ${currentVersion.id} and org_id = ${input.orgId}`;
  const recipes = await tx`
    select ar.id, ar.name, ar.procedure, ar.params, ar.created_at,
           u.full_name as author
    from analysis_recipes ar
    join users u on u.id = ar.created_by
    where ar.dataset_id = ${input.datasetId} and ar.org_id = ${input.orgId}
    order by ar.created_at desc`;
  const runs = await tx`
    select ar.id, ar.procedure, ar.status, ar.started_at, ar.seed,
           ar.results, ar.error, u.full_name as author, dv.version_number
    from analysis_runs ar
    join dataset_versions dv
      on dv.id = ar.dataset_version_id and dv.org_id = ${input.orgId}
    join users u on u.id = ar.created_by
    where ar.org_id = ${input.orgId}
      and dv.dataset_id = ${input.datasetId}
    order by ar.started_at desc limit 10`;
  return {
    dataset,
    versions,
    currentVersion,
    variables,
    rows: ((versionRows?.rows ?? []) as Record<string, unknown>[]).slice(0, 50),
    recipes,
    runs,
  };
}
