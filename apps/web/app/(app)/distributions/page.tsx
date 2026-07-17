import Link from "next/link";
import { Badge, Card, KpiTile, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { fmtDateTime } from "@/lib/format";
import { OutboxMessageView } from "./outbox-message";

export default async function DistributionsPage() {
  const session = await requireSession();

  const data = await withUser(session.userId, async (tx) => {
    const distributions = await tx`
      select d.id, d.name, d.kind, d.status, d.public_token, d.created_at, d.audience_snapshot,
             s.title as study_title, s.id as study_id,
             (select count(*) from invitations i where i.distribution_id = d.id) as invited,
             (select count(*) from invitations i where i.distribution_id = d.id and i.status = 'completed') as inv_completed,
             (select count(*) from responses r where r.distribution_id = d.id and r.status = 'completed') as completed
      from distributions d join studies s on s.id = d.study_id
      order by d.created_at desc`;
    const funnel = await tx`
      select status::text, count(*)::int as count from invitations group by status`;
    const outbox = await tx`
      select o.id, o.to_address, o.subject, o.body, o.status, o.created_at, d.name as distribution
      from outbox_messages o left join distributions d on d.id = o.distribution_id
      order by o.created_at desc limit 50`;
    return { distributions, funnel, outbox };
  });

  const funnelMap = new Map(data.funnel.map((f) => [f.status as string, Number(f.count)]));
  const stages = ["queued", "sent", "opened", "clicked", "started", "completed", "bounced", "unsubscribed", "failed"];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Distributions"
        description="Public links, tokenized panel invitations, and the simulated development outbox. No real messages are sent in local development."
      />

      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        {stages.filter((s) => (funnelMap.get(s) ?? 0) > 0 || ["sent", "opened", "clicked", "completed"].includes(s)).slice(0, 6).map((s) => (
          <KpiTile key={s} label={`Invitations ${s}`} value={String(funnelMap.get(s) ?? 0)} />
        ))}
      </div>

      <Card title="All distributions">
        <Table>
          <thead>
            <tr>
              <Th>Name</Th><Th>Study</Th><Th>Kind</Th><Th>Audience</Th>
              <Th className="text-right">Completed</Th><Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {data.distributions.map((d) => {
              const snap = (d.audience_snapshot ?? {}) as { method?: string; seed?: number | null };
              return (
                <tr key={d.id}>
                  <Td>{d.name}</Td>
                  <Td>
                    <Link href={`/studies/${d.study_id}`} className="text-accent hover:underline">{d.study_title}</Link>
                  </Td>
                  <Td><Badge tone={d.kind === "public_link" ? "blue" : "accent"}>{d.kind}</Badge></Td>
                  <Td className="text-xs">
                    {d.kind === "public_link" ? (
                      <a className="text-accent underline break-all" href={`${env.appBaseUrl}/s/${d.public_token}`} target="_blank">
                        /s/{d.public_token}
                      </a>
                    ) : (
                      `${d.invited} invited · ${d.inv_completed} completed${snap.method ? ` · ${snap.method}${snap.seed ? ` (seed ${snap.seed})` : ""}` : ""}`
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{String(d.completed)}</Td>
                  <Td className="whitespace-nowrap text-muted">{fmtDateTime(d.created_at, session.locale)}</Td>
                </tr>
              );
            })}
            {data.distributions.length === 0 && (
              <tr><Td colSpan={6} className="text-muted">No distributions yet.</Td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Card title="Simulated outbox (latest 50)">
        <p className="mb-3 text-xs text-muted">
          Development environment: messages are recorded here instead of being sent. A real email/SMS
          provider is a configuration-gated later milestone.
        </p>
        <Table>
          <thead>
            <tr><Th>To</Th><Th>Subject</Th><Th>Distribution</Th><Th>Status</Th><Th>Created</Th><Th /></tr>
          </thead>
          <tbody>
            {data.outbox.map((m) => (
              <OutboxMessageView
                key={m.id}
                to={m.to_address as string}
                subject={m.subject as string}
                body={m.body as string}
                distribution={(m.distribution as string) ?? "—"}
                status={m.status as string}
                createdAt={fmtDateTime(m.created_at, session.locale)}
              />
            ))}
            {data.outbox.length === 0 && <tr><Td colSpan={6} className="text-muted">Outbox is empty.</Td></tr>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
