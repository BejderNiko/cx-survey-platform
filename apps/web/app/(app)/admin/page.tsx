import { assertCan } from "@ok/domain";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { MemberRow, InviteForm } from "./admin-ui";

export default async function AdminPage() {
  const session = await requireSession();
  assertCan(session.role, "members.invite");

  const data = await withUser(session.userId, session.orgId, async (tx) => {
    const members = await tx`
      select m.id as membership_id, m.role, m.created_at, m.deactivated_at,
             u.id as user_id, u.email, u.full_name
      from memberships m join users u on u.id = m.user_id
      where m.org_id = ${session.orgId}
      order by u.full_name`;
    const auditEvents = await tx`
      select a.action, a.entity_type, a.details, a.created_at, u.full_name as actor
      from audit_events a left join users u on u.id = a.actor_user_id
      order by a.created_at desc limit 60`;
    const [org] = await tx`select name, slug, settings from organizations where id = ${session.orgId}`;
    return { members, auditEvents, org };
  });

  const governance = (data.org?.settings?.governance ?? {}) as Record<string, number>;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Administration"
        description={`${data.org?.name} · kontaktregler: ${governance.contactCooldownDays ?? 14} dages karensperiode, maks. ${governance.maxInviteSize ?? 500} invitationer pr. udsendelse, ${governance.monthlyContactCap ?? 2} kontakter pr. 30 dage`}
      />

      <Card title="Invitér medlem">
        <InviteForm />
        <p className="mt-2 text-xs text-muted">
          I lokal udvikling oprettes kontoen direkte med en engangsadgangskode. I produktion sker det
          via Supabase Auth / Microsoft Entra ID (dokumenteret grænse, endnu ikke aktiveret).
        </p>
      </Card>

      <Card title={`Medlemmer (${data.members.length})`}>
        <Table>
          <thead>
            <tr><Th>Navn</Th><Th>E-mail</Th><Th>Rolle</Th><Th>Status</Th><Th>Siden</Th><Th /></tr>
          </thead>
          <tbody>
            {data.members.map((m) => (
              <MemberRow
                key={m.membership_id}
                membershipId={m.membership_id as string}
                name={m.full_name as string}
                email={m.email as string}
                role={m.role as string}
                active={!m.deactivated_at}
                since={fmtDateTime(m.created_at)}
                isSelf={m.user_id === session.userId}
              />
            ))}
          </tbody>
        </Table>
      </Card>

      <Card title="Aktivitetslog (seneste 60)">
        <Table>
          <thead>
            <tr><Th>Handling</Th><Th>Enhed</Th><Th>Udført af</Th><Th>Detaljer</Th><Th>Tidspunkt</Th></tr>
          </thead>
          <tbody>
            {data.auditEvents.map((a, i) => (
              <tr key={i}>
                <Td><Badge tone="blue">{a.action}</Badge></Td>
                <Td>{a.entity_type}</Td>
                <Td>{a.actor ?? "system"}</Td>
                <Td><code className="text-xs text-muted">{JSON.stringify(a.details)}</code></Td>
                <Td className="whitespace-nowrap text-muted">{fmtDateTime(a.created_at)}</Td>
              </tr>
            ))}
            {data.auditEvents.length === 0 && <tr><Td colSpan={5} className="text-muted">Ingen hændelser i loggen.</Td></tr>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
