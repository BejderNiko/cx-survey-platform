import { notFound } from "next/navigation";
import { can } from "@ok/domain";
import { Badge, Card, KpiTile, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { fmtDateTime } from "@/lib/format";
import { DISTRIBUTION_KIND, INVITATION_STATUS, label } from "@/lib/labels";
import { getPanelFilterUiData } from "@/lib/data/panel-filter-ui";
import { CreateDistributionForms } from "./distribution-forms";
import { CopyLinkButton } from "./copy-link-button";

/** Udsend-fanen: links, panelinvitationer, leveringstragt og målgruppe-preview. */
export default async function StudyDistributionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const data = await withUser(session.userId, session.orgId, async (tx) => {
    const [study] = await tx`select id, status from studies where id = ${id} and org_id = ${session.orgId}`;
    if (!study) return null;
    const [distributions, funnel, segments, panelFilterUi] = await Promise.all([
      tx`select d.id, d.kind, d.name, d.status, d.public_token, d.audience_snapshot, d.created_at,
                (select count(*) from invitations i where i.distribution_id = d.id and i.org_id = ${session.orgId}) as invitations,
                (select count(*) from responses r where r.distribution_id = d.id and r.org_id = ${session.orgId} and r.status = 'completed') as completed
         from distributions d where d.study_id = ${id} and d.org_id = ${session.orgId} order by d.created_at desc`,
      tx`select i.status::text, count(*)::int as count
         from invitations i join distributions d on d.id = i.distribution_id and d.org_id = ${session.orgId}
         where d.study_id = ${id} and i.org_id = ${session.orgId} group by i.status`,
      tx`select id, name from segments where org_id = ${session.orgId} order by name`,
      getPanelFilterUiData(tx, session.orgId),
    ]);
    return { study, distributions, funnel, segments, panelFilterUi };
  });
  if (!data) notFound();

  const funnelMap = new Map(data.funnel.map((f) => [f.status as string, Number(f.count)]));
  const stages = ["sent", "opened", "clicked", "started", "completed", "bounced"];

  const publicLinks = data.distributions
    .filter((d) => d.public_token)
    .map((d) => ({
      id: d.id as string,
      url: env.appBaseUrl + "/s/" + d.public_token,
    }));
  const publicLinkById = new Map(publicLinks.map((p) => [p.id, p]));

  const hasInvites = data.distributions.some((d) => d.kind === "panel_invite");

  return (
    <div className="space-y-4">
      {hasInvites && (
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
          {stages.map((s) => (
            <KpiTile key={s} label={label(INVITATION_STATUS, s)} value={String(funnelMap.get(s) ?? 0)} />
          ))}
        </div>
      )}

      <Card title="Udsendelser">
        {data.distributions.length === 0 ? (
          <p className="text-sm text-muted">
            Ingen endnu. Publicér studiet, og opret derefter et link eller en invitation.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Navn</Th><Th>Type</Th><Th>Målgruppe</Th>
                <Th className="text-right">Gennemførte</Th><Th>Link</Th>
              </tr>
            </thead>
            <tbody>
              {data.distributions.map((d) => {
                const pub = publicLinkById.get(d.id as string);
                const snap = (d.audience_snapshot ?? {}) as { panelistIds?: string[]; seed?: number | null; method?: string };
                return (
                  <tr key={d.id}>
                    <Td>
                      {d.name}
                      <p className="text-xs text-muted">{fmtDateTime(d.created_at)}</p>
                    </Td>
                    <Td>
                      <Badge tone={d.kind === "public_link" ? "blue" : "accent"}>
                        {label(DISTRIBUTION_KIND, d.kind)}
                      </Badge>
                    </Td>
                    <Td className="text-xs">
                      {d.kind === "panel_invite"
                        ? `${d.invitations} inviteret (${snap.method === "random" ? "tilfældig stikprøve" : "alle egnede"}${snap.seed ? `, seed ${snap.seed}` : ""})`
                        : "alle med linket"}
                    </Td>
                    <Td className="text-right tabular-nums">{String(d.completed)}</Td>
                    <Td>
                      {pub ? (
                        <span className="flex items-center gap-2">
                          <a href={pub.url} target="_blank" rel="noreferrer" className="text-xs text-accent underline break-all">{pub.url}</a>
                          <CopyLinkButton url={pub.url} />
                        </span>
                      ) : (
                        <span className="text-xs text-muted">Ikke tilgængeligt</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {can(session.role, "distributions.create") && data.study.status === "live" && (
          <div className="mt-4 border-t border-line pt-3">
            <CreateDistributionForms
              studyId={id}
              segments={data.segments.map((s) => ({ id: s.id as string, name: s.name as string }))}
              filterFields={data.panelFilterUi.fields}
              messages={data.panelFilterUi.messages}
              panelTotal={data.panelFilterUi.total}
            />
          </div>
        )}
      </Card>

    </div>
  );
}
