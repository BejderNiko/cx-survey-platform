import type { Tx } from "../db";

export async function listStudies(
  tx: Tx,
  input: { orgId: string; query?: string; status?: string },
) {
  const like = input.query ? `%${input.query}%` : null;
  const status = input.status?.trim() || null;
  return tx`
    select s.id, s.title, s.status, s.study_type, s.method_tags, s.updated_at,
           coalesce(w.name, 'Tidligere workspace') as workspace,
           coalesce(u.full_name, 'Tidligere ejer') as owner,
           (select count(*) from study_versions v
            where v.org_id = ${input.orgId} and v.study_id = s.id) as versions,
           (select count(*) from responses r
            where r.org_id = ${input.orgId} and r.study_id = s.id and r.status = 'completed') as completed,
           (select count(*) from distributions d
            where d.org_id = ${input.orgId} and d.study_id = s.id) as distributions
    from studies s
    left join workspaces w
      on w.id = s.workspace_id and w.org_id = ${input.orgId}
    left join users u on u.id = s.owner_id
    where s.org_id = ${input.orgId}
      and (${like}::text is null or s.title ilike ${like})
      and (${status}::text is null or s.status::text = ${status})
    order by s.updated_at desc`;
}

export async function getStudyShell(tx: Tx, orgId: string, studyId: string) {
  const [study] = await tx`
    select s.id, s.title, s.status,
           coalesce(w.name, 'Tidligere workspace') as workspace,
           coalesce(u.full_name, 'Tidligere ejer') as owner,
           (w.id is null) as workspace_missing,
           (u.id is null) as owner_missing
    from studies s
    left join workspaces w on w.id = s.workspace_id and w.org_id = ${orgId}
    left join users u on u.id = s.owner_id
    where s.id = ${studyId} and s.org_id = ${orgId}`;
  return study ?? null;
}
