import "server-only";

import type { Tx } from "@/lib/db";
import { RESULT_RESPONSE_LIMIT } from "@/lib/results-filters";

/**
 * One authoritative, bounded result population. Dashboard, CSV and reports
 * must use this loader so version, ordering and 50k boundary cannot drift.
 */
export async function loadLatestResultData(tx: Tx, orgId: string, studyId: string) {
  const [study] = await tx`
    select id, title, status, draft_definition
    from studies
    where id = ${studyId} and org_id = ${orgId}`;
  if (!study) return null;

  const [version] = await tx`
    select id, version_number, definition
    from study_versions
    where study_id = ${studyId} and org_id = ${orgId}
    order by version_number desc
    limit 1`;
  if (!version) return { study, version: null, responses: [], answers: [], interactions: [] };

  const responses = await tx`
    select r.id, r.respondent_key, r.started_at, r.completed_at, r.channel, r.panelist_id,
           v.version_number, p.first_name, p.last_name,
           coalesce(nullif(r.meta->>'location', ''), nullif(p.country, ''), 'Ukendt') as location,
           coalesce(nullif(r.meta->>'ageRange', ''),
             case
               when p.birth_year is null then 'Ukendt'
               when extract(year from r.started_at)::int - p.birth_year < 25 then 'Under 25'
               when extract(year from r.started_at)::int - p.birth_year < 35 then '25-34'
               when extract(year from r.started_at)::int - p.birth_year < 45 then '35-44'
               when extract(year from r.started_at)::int - p.birth_year < 55 then '45-54'
               when extract(year from r.started_at)::int - p.birth_year < 65 then '55-64'
               else '65+' end) as age_range,
           coalesce(nullif(r.meta->>'source', ''), nullif(p.recruitment_source, ''), nullif(r.channel, ''), 'Ukendt') as source,
           coalesce((select array_agg(t.name order by t.name)
                     from panelist_tags pt
                     join tags t on t.id = pt.tag_id and t.org_id = pt.org_id
                     where pt.panelist_id = r.panelist_id and pt.org_id = r.org_id), '{}') as tags
    from responses r
    join study_versions v on v.id = r.study_version_id and v.org_id = r.org_id
    left join panelists p on p.id = r.panelist_id and p.org_id = r.org_id
    where r.study_id = ${studyId} and r.org_id = ${orgId}
      and r.study_version_id = ${version.id} and r.status = 'completed'
    order by r.started_at desc, r.id desc
    limit ${RESULT_RESPONSE_LIMIT}`;

  const responseIds = responses.map((row) => String(row.id));
  if (responseIds.length === 0) return { study, version, responses, answers: [], interactions: [] };

  const answers = await tx`
    select ra.response_id, ra.question_code, ra.value
    from response_answers ra
    where ra.org_id = ${orgId} and ra.response_id = any(${tx.array(responseIds)}::uuid[])`;
  const interactions = await tx`
    select ie.response_id, ie.question_code, ie.event_type, ie.payload
    from interaction_events ie
    where ie.org_id = ${orgId} and ie.response_id = any(${tx.array(responseIds)}::uuid[])
    order by ie.created_at asc, ie.id asc`;

  return { study, version, responses, answers, interactions };
}
