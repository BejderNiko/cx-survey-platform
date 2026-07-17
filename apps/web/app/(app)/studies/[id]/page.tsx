import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { can } from "@ok/domain";
import { Badge, Card, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { fmtDateTime } from "@/lib/format";
import { StudyActions, CommentForm, CreateDistributionForms } from "./study-actions";

const STATUS_TONE: Record<string, string> = {
  draft: "gray", review: "blue", scheduled: "blue", live: "green",
  paused: "amber", closed: "amber", archived: "gray",
};

export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const data = await withUser(session.userId, async (tx) => {
    const [study] = await tx`
      select s.*, w.name as workspace, u.full_name as owner
      from studies s join workspaces w on w.id = s.workspace_id join users u on u.id = s.owner_id
      where s.id = ${id}`;
    if (!study) return null;
    const [versions, distributions, segments, comments, respStats] = await Promise.all([
      tx`select v.id, v.version_number, v.published_at, u.full_name as publisher
         from study_versions v join users u on u.id = v.published_by
         where v.study_id = ${id} order by v.version_number desc`,
      tx`select d.id, d.kind, d.name, d.status, d.public_token, d.audience_snapshot, d.created_at,
                (select count(*) from invitations i where i.distribution_id = d.id) as invitations,
                (select count(*) from responses r where r.distribution_id = d.id and r.status = 'completed') as completed
         from distributions d where d.study_id = ${id} order by d.created_at desc`,
      tx`select id, name from segments order by name`,
      tx`select c.body, c.created_at, u.full_name as author
         from comments c join users u on u.id = c.author_id
         where c.entity_type = 'study' and c.entity_id = ${id} order by c.created_at desc limit 20`,
      tx`select count(*) filter (where status = 'completed') as completed,
                count(*) filter (where status = 'started') as partials,
                count(*) filter (where status = 'disqualified') as disqualified
         from responses where study_id = ${id}`,
    ]);
    return { study, versions, distributions, segments, comments, respStats: respStats[0] };
  });
  if (!data) notFound();
  const { study } = data;

  const publicLinks = await Promise.all(
    data.distributions
      .filter((d) => d.public_token)
      .map(async (d) => ({
        id: d.id as string,
        url: `${env.appBaseUrl}/s/${d.public_token}`,
        qr: await QRCode.toDataURL(`${env.appBaseUrl}/s/${d.public_token}`, { width: 96, margin: 1 }),
      })),
  );
  const qrById = new Map(publicLinks.map((p) => [p.id, p]));

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {study.title}
            <Badge tone={STATUS_TONE[study.status] ?? "gray"}>{study.status}</Badge>
          </span>
        }
        description={`${study.workspace} · owner ${study.owner} · ${data.respStats.completed} completed, ${data.respStats.partials} partial, ${data.respStats.disqualified} disqualified`}
        actions={
          <>
            <LinkButton href={`/studies/${id}/results`}>Results</LinkButton>
            {can(session.role, "studies.edit") && (
              <LinkButton href={`/studies/${id}/builder`} variant="primary">Builder</LinkButton>
            )}
          </>
        }
      />

      <StudyActions
        studyId={id}
        status={study.status}
        canPublish={can(session.role, "studies.publish")}
        canClose={can(session.role, "studies.close")}
        canCreate={can(session.role, "studies.create")}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Distributions">
          {data.distributions.length === 0 ? (
            <p className="text-sm text-muted">None yet. Publish the study, then create a link or invitation.</p>
          ) : (
            <Table>
              <thead>
                <tr><Th>Name</Th><Th>Kind</Th><Th>Audience</Th><Th className="text-right">Completed</Th><Th>Link</Th></tr>
              </thead>
              <tbody>
                {data.distributions.map((d) => {
                  const pub = qrById.get(d.id as string);
                  const snap = (d.audience_snapshot ?? {}) as { panelistIds?: string[]; seed?: number | null; method?: string };
                  return (
                    <tr key={d.id}>
                      <Td>{d.name}<p className="text-xs text-muted">{fmtDateTime(d.created_at, session.locale)}</p></Td>
                      <Td><Badge tone={d.kind === "public_link" ? "blue" : "accent"}>{d.kind}</Badge></Td>
                      <Td className="text-xs">
                        {d.kind === "panel_invite"
                          ? `${d.invitations} invited (${snap.method}${snap.seed ? `, seed ${snap.seed}` : ""})`
                          : "anyone with the link"}
                      </Td>
                      <Td className="text-right tabular-nums">{String(d.completed)}</Td>
                      <Td>
                        {pub ? (
                          <span className="flex items-center gap-2">
                            <a href={pub.url} target="_blank" className="text-xs text-accent underline break-all">{pub.url}</a>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={pub.qr} alt={`QR code for ${d.name}`} width={48} height={48} />
                          </span>
                        ) : (
                          <Link href="/distributions" className="text-xs text-accent underline">outbox</Link>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          {can(session.role, "distributions.create") && study.status === "live" && (
            <div className="mt-4 border-t border-line pt-3">
              <CreateDistributionForms
                studyId={id}
                segments={data.segments.map((s) => ({ id: s.id as string, name: s.name as string }))}
              />
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Published versions">
            {data.versions.length === 0 ? (
              <p className="text-sm text-muted">Not published yet — responses always reference a published version.</p>
            ) : (
              <Table>
                <thead><tr><Th>Version</Th><Th>Published</Th><Th>By</Th></tr></thead>
                <tbody>
                  {data.versions.map((v) => (
                    <tr key={v.id}>
                      <Td>v{v.version_number}</Td>
                      <Td className="text-muted whitespace-nowrap">{fmtDateTime(v.published_at, session.locale)}</Td>
                      <Td>{v.publisher}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card title="Comments">
            <CommentForm entityType="study" entityId={id} path={`/studies/${id}`} />
            <ul className="mt-3 space-y-2">
              {data.comments.map((c, i) => (
                <li key={i} className="rounded-md border border-line bg-background px-3 py-2 text-sm">
                  <p>{c.body}</p>
                  <p className="mt-0.5 text-xs text-muted">{c.author} · {fmtDateTime(c.created_at, session.locale)}</p>
                </li>
              ))}
              {data.comments.length === 0 && <li className="text-sm text-muted">No comments.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
