import { notFound } from "next/navigation";
import { allQuestions, can, instrumentDefinition } from "@ok/domain";
import { Card, KpiTile, LinkButton, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { StudyActions, CommentForm } from "./study-actions";

/** Byg-fanen: status, instrument, versioner og kommentarer. */
export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const data = await withUser(session.userId, session.orgId, async (tx) => {
    const [study] = await tx`select * from studies where id = ${id}`;
    if (!study) return null;
    const [versions, comments, respStats] = await Promise.all([
      tx`select v.id, v.version_number, v.published_at, u.full_name as publisher
         from study_versions v join users u on u.id = v.published_by
         where v.study_id = ${id} order by v.version_number desc`,
      tx`select c.body, c.created_at, u.full_name as author
         from comments c join users u on u.id = c.author_id
         where c.entity_type = 'study' and c.entity_id = ${id} order by c.created_at desc limit 20`,
      tx`select count(*) filter (where status = 'completed') as completed,
                count(*) filter (where status = 'started') as partials,
                count(*) filter (where status = 'disqualified') as disqualified
         from responses where study_id = ${id}`,
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
          canCreate={can(session.role, "studies.create")}
        />
        {can(session.role, "studies.edit") && (
          <LinkButton href={`/studies/${id}/builder`} variant="primary">
            Åbn builder
          </LinkButton>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Spørgsmål i kladden" value={String(questionCount)} />
        <KpiTile label="Gennemførte" value={String(data.respStats.completed)} />
        <KpiTile label="Påbegyndte" value={String(data.respStats.partials)} />
        <KpiTile label="Frasorterede" value={String(data.respStats.disqualified)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Publicerede versioner">
          {data.versions.length === 0 ? (
            <p className="text-sm text-muted">
              Ikke publiceret endnu — besvarelser refererer altid til en publiceret version.
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

        <Card title="Kommentarer">
          <CommentForm entityType="study" entityId={id} path={`/studies/${id}`} />
          <ul className="mt-3 space-y-2">
            {data.comments.map((c, i) => (
              <li key={i} className="rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm">
                <p>{c.body}</p>
                <p className="mt-0.5 text-xs text-muted">{c.author} · {fmtDateTime(c.created_at)}</p>
              </li>
            ))}
            {data.comments.length === 0 && <li className="text-sm text-muted">Ingen kommentarer.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
