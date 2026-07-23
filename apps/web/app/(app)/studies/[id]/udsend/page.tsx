import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { can } from "@ok/domain";
import { Badge, Card, KpiTile, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { fmtDateTime } from "@/lib/format";
import { DISTRIBUTION_KIND, INVITATION_STATUS, OUTBOX_STATUS, label } from "@/lib/labels";
import { CreateDistributionForms } from "./distribution-forms";
import { OutboxMessageView } from "./outbox-message";

/** Udsend-fanen: links, panelinvitationer, leveringstragt og simuleret udbakke. */
export default async function StudyDistributionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const data = await withUser(session.userId, session.orgId, async (tx) => {
    const [study] = await tx`select id, status from studies where id = ${id}`;
    if (!study) return null;
    const [distributions, funnel, outbox, segments] = await Promise.all([
      tx`select d.id, d.kind, d.name, d.status, d.public_token, d.audience_snapshot, d.created_at,
                (select count(*) from invitations i where i.distribution_id = d.id) as invitations,
                (select count(*) from responses r where r.distribution_id = d.id and r.status = 'completed') as completed
         from distributions d where d.study_id = ${id} order by d.created_at desc`,
      tx`select i.status::text, count(*)::int as count
         from invitations i join distributions d on d.id = i.distribution_id
         where d.study_id = ${id} group by i.status`,
      tx`select o.id, o.to_address, o.subject, o.body, o.status, o.created_at, d.name as distribution
         from outbox_messages o join distributions d on d.id = o.distribution_id
         where d.study_id = ${id}
         order by o.created_at desc limit 50`,
      tx`select id, name from segments order by name`,
    ]);
    return { study, distributions, funnel, outbox, segments };
  });
  if (!data) notFound();

  const funnelMap = new Map(data.funnel.map((f) => [f.status as string, Number(f.count)]));
  const stages = ["sent", "opened", "clicked", "started", "completed", "bounced"];

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
                const pub = qrById.get(d.id as string);
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
                          <a href={pub.url} target="_blank" className="text-xs text-accent underline break-all">{pub.url}</a>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={pub.qr} alt={`QR-kode til ${d.name}`} width={48} height={48} />
                        </span>
                      ) : (
                        <span className="text-xs text-muted">se udbakken nedenfor</span>
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
            />
          </div>
        )}
      </Card>

      <Card title="Simuleret udbakke (seneste 50)">
        <p className="mb-3 text-xs text-muted">
          Udviklingsmiljø: beskeder registreres her i stedet for at blive sendt. En rigtig
          e-mail-/SMS-leverandør er en senere, konfigurationsstyret milepæl.
        </p>
        <Table>
          <thead>
            <tr><Th>Til</Th><Th>Emne</Th><Th>Udsendelse</Th><Th>Status</Th><Th>Oprettet</Th><Th /></tr>
          </thead>
          <tbody>
            {data.outbox.map((m) => (
              <OutboxMessageView
                key={m.id}
                to={m.to_address as string}
                subject={m.subject as string}
                body={m.body as string}
                distribution={(m.distribution as string) ?? "—"}
                status={label(OUTBOX_STATUS, m.status as string)}
                createdAt={fmtDateTime(m.created_at)}
              />
            ))}
            {data.outbox.length === 0 && <tr><Td colSpan={6} className="text-muted">Udbakken er tom.</Td></tr>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
