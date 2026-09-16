import { notFound } from "next/navigation";
import { allQuestions, can, instrumentDefinition } from "@ok/domain";
import { Card, KpiTile, LinkButton, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { StudyActions } from "./study-actions";
import { CommentsPanel, type StudyCommentRow } from "./comments-panel";

/** Byg-fanen: status, instrument, versioner og kommentarer. */
export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const data = await withUser(session.userId, session.orgId, async (tx) => {
    const [study] = await tx`select * from studies where id = ${id} and org_id = ${session.orgId}`;
    if (!study) return null;
    const [versions, comments, respStats] = await Promise.all([
      tx`select v.id, v.version_number, v.published_at, coalesce(u.full_name, 'Former user') as publisher
         from study_versions v left join users u on u.id = v.published_by
         where v.study_id = ${id} and v.org_id = ${session.orgId} order by v.version_number desc`,
      tx`select c.id, c.parent_id,
             case when c.question_code like '__section__:%' then null else c.question_code end as question_code,
             case when to_jsonb(c)->>'section_id' is not null then to_jsonb(c)->>'section_id'
                  when c.question_code like '__section__:%' then substring(c.question_code from 12)
                  else null end as section_id, c.body, c.status,
                c.author_id, c.created_at::text, c.resolved_at::text, coalesce(u.full_name, 'Former user') as author,
                resolver.full_name as resolved_by_name
         from comments c
         left join users u on u.id = c.author_id
         left join users resolver on resolver.id = c.resolved_by
         where c.study_id = ${id} and c.org_id = ${session.orgId}
         order by c.created_at asc limit 200`,
      tx`select count(*) filter (where status = 'completed') as completed,
                count(*) filter (where status = 'started') as partials,
                count(*) filter (where status = 'disqualified') as disqualified
         from responses where study_id = ${id} and org_id = ${session.orgId}`,
    ]);
    return { study, versions, comments, respStats: respStats[0] };
  });
  if (!data) notFound();
  const { study } = data;

  const draft = instrumentDefinition.safeParse(study.draft_definition);
  const questionCount = draft.success ? allQuestions(draft.data).length : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StudyActions
          studyId={id}
          status={study.status}
          canPublish={can(session.role, "studies.publish")}
          canClose={can(session.role, "studies.close")}
          canDelete={can(session.role, "studies.delete")}
        />
        {can(session.role, "studies.edit") && (
          <LinkButton href={`/studies/${id}/builder`} variant="primary">
            Open builder
          </LinkButton>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Questions in draft" value={String(questionCount)} />
        <KpiTile label="Completed" value={String(data.respStats.completed)} />
        <KpiTile label="Started" value={String(data.respStats.partials)} />
        <KpiTile label="Disqualified" value={String(data.respStats.disqualified)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Published versions">
          <p className="mb-3 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">V1 draft is canonical and updates automatically while you edit. Published versions remain immutable snapshots for existing responses.</p>
          {data.versions.length === 0 ? (
            <p className="text-sm text-muted">
              Not published yet. Responses always reference a published version.
            </p>
          ) : (
            <Table>
              <thead><tr><Th>Version</Th><Th>Publiceret</Th><Th>Af</Th></tr></thead>
              <tbody>
                {data.versions.map((v) => (
                  <tr key={v.id}>
                    <Td>v{v.version_number}</Td>
                    <Td className="text-muted whitespace-nowrap">{fmtDateTime(v.published_at)}</Td>
                    <Td>{v.publisher}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Comments">
          <CommentsPanel
            studyId={id}
            comments={data.comments as unknown as StudyCommentRow[]}
            canResolve={can(session.role, "comments.resolve")}
            currentUserId={session.userId}
          />
        </Card>
      </div>
    </div>
  );
}
