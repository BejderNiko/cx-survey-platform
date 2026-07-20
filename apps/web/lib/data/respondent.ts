import { randomBytes } from "node:crypto";
import {
  evaluateRules,
  instrumentDefinition,
  validateSubmission,
  type InstrumentDefinition,
} from "@ok/domain";
import { adminSql } from "../db";

/**
 * Anonymous respondent flow. These are the ONLY code paths that use the
 * service connection: every function validates a capability token
 * (distribution public_token or invitation token) and touches only the rows
 * that token grants. Authenticated app code never goes through here.
 */

export interface PublicSurvey {
  kind: "public" | "invitation";
  studyId: string;
  studyTitle: string;
  studyStatus: string;
  versionId: string;
  definition: InstrumentDefinition;
  distributionId: string;
  invitationId: string | null;
  panelistId: string | null;
  language: string | null;
  alreadyCompleted: boolean;
  orgId: string;
}

export async function getPublicSurvey(token: string): Promise<PublicSurvey | null> {
  const [row] = await adminSql`
    select d.id as distribution_id, d.org_id, s.id as study_id, s.title, s.status,
           v.id as version_id, v.definition
    from distributions d
    join studies s on s.id = d.study_id
    join study_versions v on v.id = d.study_version_id
    where d.public_token = ${token} and d.kind = 'public_link' and d.status = 'active'`;
  if (!row) return null;
  return {
    kind: "public",
    studyId: row.study_id,
    studyTitle: row.title,
    studyStatus: row.status,
    versionId: row.version_id,
    definition: instrumentDefinition.parse(row.definition),
    distributionId: row.distribution_id,
    invitationId: null,
    panelistId: null,
    language: null,
    alreadyCompleted: false,
    orgId: row.org_id,
  };
}

export async function getInvitationSurvey(token: string): Promise<PublicSurvey | null> {
  const [row] = await adminSql`
    select i.id as invitation_id, i.panelist_id, i.status as inv_status, d.id as distribution_id, d.org_id,
           s.id as study_id, s.title, s.status, v.id as version_id, v.definition,
           p.language as panelist_language
    from invitations i
    join distributions d on d.id = i.distribution_id
    join studies s on s.id = d.study_id
    join study_versions v on v.id = d.study_version_id
    left join panelists p on p.id = i.panelist_id
    where i.token = ${token} and d.status = 'active'
      and i.status not in ('bounced', 'unsubscribed', 'failed')`;
  if (!row) return null;
  const alreadyCompleted = row.inv_status === "completed";
  if (!alreadyCompleted && ["sent", "delivered", "opened"].includes(row.inv_status)) {
    await adminSql`update invitations set status = 'clicked', status_changed_at = now() where id = ${row.invitation_id}`;
    if (row.panelist_id) {
      await adminSql`insert into contact_events (org_id, panelist_id, event_type, distribution_id)
                     values (${row.org_id}, ${row.panelist_id}, 'clicked', ${row.distribution_id})`;
    }
  }
  return {
    kind: "invitation",
    studyId: row.study_id,
    studyTitle: row.title,
    studyStatus: row.status,
    versionId: row.version_id,
    definition: instrumentDefinition.parse(row.definition),
    distributionId: row.distribution_id,
    invitationId: row.invitation_id,
    panelistId: row.panelist_id,
    language: row.panelist_language,
    alreadyCompleted,
    orgId: row.org_id,
  };
}

export async function startResponse(input: {
  token: string;
  language: string;
  viewport: string;
}): Promise<{ responseId: string } | { error: string }> {
  if (input.token.startsWith("inv_")) {
    return adminSql.begin(async (tx) => {
      const [survey] = await tx`
        select i.id as invitation_id, i.panelist_id, i.status as invitation_status,
               d.id as distribution_id, d.org_id, s.id as study_id, s.status as study_status,
               v.id as version_id
        from invitations i
        join distributions d on d.id = i.distribution_id
        join studies s on s.id = d.study_id
        join study_versions v on v.id = d.study_version_id
        where i.token = ${input.token} and d.status = 'active'
          and i.status not in ('bounced', 'unsubscribed', 'failed')
        for update of i`;
      if (!survey) return { error: "unknown_token" };
      if (survey.study_status !== "live") return { error: "closed" };
      if (survey.invitation_status === "completed") return { error: "already_completed" };

      const [existing] = await tx`
        select id from responses
        where invitation_id = ${survey.invitation_id} and status = 'started'
        order by started_at desc limit 1`;
      if (existing) return { responseId: existing.id as string };

      const respondentKey = "r_" + randomBytes(9).toString("base64url");
      const [response] = await tx`
        insert into responses (org_id, study_id, study_version_id, distribution_id, invitation_id, panelist_id,
                               respondent_key, status, language, channel, device)
        values (${survey.org_id}, ${survey.study_id}, ${survey.version_id}, ${survey.distribution_id},
                ${survey.invitation_id}, ${survey.panelist_id}, ${respondentKey}, 'started',
                ${input.language}, 'email', ${tx.json({ viewport: input.viewport })})
        returning id`;
      await tx`update invitations set status = 'started', status_changed_at = now()
               where id = ${survey.invitation_id}`;
      return { responseId: response.id as string };
    }) as Promise<{ responseId: string } | { error: string }>;
  }

  const survey = await getPublicSurvey(input.token);
  if (!survey) return { error: "unknown_token" };
  if (survey.studyStatus !== "live") return { error: "closed" };

  const respondentKey = "r_" + randomBytes(9).toString("base64url");
  const [response] = await adminSql`
    insert into responses (org_id, study_id, study_version_id, distribution_id, invitation_id, panelist_id,
                           respondent_key, status, language, channel, device)
    values (${survey.orgId}, ${survey.studyId}, ${survey.versionId}, ${survey.distributionId},
            null, null, ${respondentKey}, 'started', ${input.language}, 'link',
            ${adminSql.json({ viewport: input.viewport })})
    returning id`;
  return { responseId: response.id as string };
}

export interface CompleteInput {
  responseId: string;
  token: string;
  status: "completed" | "disqualified";
  answers: { code: string; type: string; value: unknown }[];
  interactions: { code: string; eventType: string; payload: Record<string, unknown> }[];
}

export async function completeResponse(input: CompleteInput): Promise<{ ok: boolean; error?: string }> {
  return adminSql.begin(async (tx) => {
    const [resp] = await tx`
      select r.id, r.org_id, r.study_id, r.invitation_id, r.panelist_id, r.distribution_id, r.status,
             v.definition
      from responses r
      join study_versions v on v.id = r.study_version_id
      join distributions d on d.id = r.distribution_id
      left join invitations i on i.id = r.invitation_id
      where r.id = ${input.responseId}
        and (
          (r.invitation_id is not null and i.token = ${input.token}
            and i.status in ('sent', 'delivered', 'opened', 'clicked', 'started'))
          or
          (r.invitation_id is null and d.kind = 'public_link' and d.public_token = ${input.token})
        )
      for update of r`;
    if (!resp) return { ok: false, error: "unknown_response" };
    if (resp.status !== "started") return { ok: false, error: "already_finalized" };

    const def = instrumentDefinition.parse(resp.definition);
    const validation = validateSubmission(def, input);
    if (!validation.ok) return { ok: false, error: "invalid_response" };
    const submission = validation.value;

    for (const answer of submission.answers) {
      await tx`insert into response_answers (org_id, response_id, question_code, question_type, value)
               values (${resp.org_id}, ${resp.id}, ${answer.code}, ${answer.type}, ${tx.json(answer.value as never)})
               on conflict (response_id, question_code) do update set value = excluded.value`;
    }
    for (const interaction of submission.interactions) {
      await tx`insert into interaction_events (org_id, response_id, question_code, event_type, payload)
               values (${resp.org_id}, ${resp.id}, ${interaction.code}, ${interaction.eventType},
                       ${tx.json(interaction.payload as never)})`;
    }

    await tx`update responses set status = ${submission.status}::response_status, completed_at = now()
             where id = ${resp.id}`;
    if (resp.invitation_id) {
      await tx`update invitations set status = 'completed', status_changed_at = now() where id = ${resp.invitation_id}`;
    }
    if (resp.panelist_id) {
      await tx`insert into contact_events (org_id, panelist_id, event_type, distribution_id)
               values (${resp.org_id}, ${resp.panelist_id}, 'responded', ${resp.distribution_id})`;
    }

    // Closed-loop rules run on completed responses only.
    if (submission.status === "completed") {
      const rules = await tx`
        select id, study_id, is_active, conditions, actions from followup_rules
        where org_id = ${resp.org_id} and is_active and (study_id is null or study_id = ${resp.study_id})`;
      const matches = evaluateRules(
        rules.map((r) => ({
          id: r.id as string,
          studyId: r.study_id as string | null,
          isActive: r.is_active as boolean,
          conditions: r.conditions,
          actions: r.actions,
        })),
        resp.study_id as string,
        submission.answerMap,
      );
      for (const m of matches) {
        for (const action of m.actions) {
          if (action.type === "create_case") {
            let assigneeId: string | null = null;
            if (action.assigneeEmail) {
              const [u] = await tx`
                select u.id from users u join memberships mm on mm.user_id = u.id
                where u.email = ${action.assigneeEmail} and mm.org_id = ${resp.org_id} and mm.deactivated_at is null`;
              assigneeId = (u?.id as string) ?? null;
            }
            const [fc] = await tx`
              insert into followup_cases (org_id, study_id, response_id, rule_id, title, priority, status, assignee_id, due_at)
              values (${resp.org_id}, ${resp.study_id}, ${resp.id}, ${m.ruleId}, ${action.title},
                      ${action.priority}::case_priority, ${assigneeId ? "assigned" : "new"}::case_status,
                      ${assigneeId}, ${action.dueInHours ? new Date(Date.now() + action.dueInHours * 3600e3) : null})
              returning id`;
            await tx`insert into followup_activity (org_id, case_id, actor_id, activity_type, detail)
                     values (${resp.org_id}, ${fc.id}, null, 'created', ${tx.json({ by: "rule", ruleId: m.ruleId })})`;
            if (assigneeId) {
              await tx`insert into notifications (org_id, user_id, kind, title, body, entity_type, entity_id)
                       values (${resp.org_id}, ${assigneeId}, 'assignment', ${"New follow-up: " + action.title},
                               'A follow-up case was created from a new response.', 'followup_case', ${fc.id})`;
            }
          } else if (action.type === "alert") {
            const recipients = action.notifyEmail
              ? await tx`select u.id from users u join memberships mm on mm.user_id = u.id
                         where u.email = ${action.notifyEmail} and mm.org_id = ${resp.org_id} and mm.deactivated_at is null`
              : await tx`select u.id from users u join memberships mm on mm.user_id = u.id
                         where mm.org_id = ${resp.org_id} and mm.role in ('owner','administrator') and mm.deactivated_at is null`;
            for (const r of recipients) {
              await tx`insert into notifications (org_id, user_id, kind, title, body, entity_type, entity_id)
                       values (${resp.org_id}, ${r.id}, 'alert', ${action.title},
                               'Triggered by a new response.', 'response', ${resp.id})`;
            }
          } else if (action.type === "add_tag" && resp.panelist_id) {
            const [tag] = await tx`
              insert into tags (org_id, name) values (${resp.org_id}, ${action.tag})
              on conflict (org_id, name) do update set name = excluded.name returning id`;
            await tx`insert into panelist_tags (panelist_id, tag_id, org_id)
                     values (${resp.panelist_id}, ${tag.id}, ${resp.org_id}) on conflict do nothing`;
          }
        }
      }
    }
    return { ok: true };
  }) as Promise<{ ok: boolean; error?: string }>;
}
