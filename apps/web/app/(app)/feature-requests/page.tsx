import { can } from "@ok/domain";
import { Card, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { FeatureRequestInbox } from "./feature-request-inbox";

export default async function FeatureRequestsPage() {
  const session = await requireSession();
  if (!can(session.role, "feature_requests.view")) return <Card><p>Ingen adgang.</p></Card>;
  const data = await withUser(session.userId, session.orgId, async (tx) => {
    const [requests, events, members] = await Promise.all([
      tx`select fr.id, fr.title, fr.description, fr.status, fr.owner_id, fr.updated_at, creator.full_name as creator, owner.full_name as owner_name from feature_requests fr join users creator on creator.id = fr.created_by left join users owner on owner.id = fr.owner_id where fr.org_id = ${session.orgId} order by fr.updated_at desc limit 200`,
      tx`select fre.id, fre.feature_request_id, fre.event_type, fre.details, fre.created_at, u.full_name as actor from feature_request_events fre left join users u on u.id = fre.actor_user_id where fre.org_id = ${session.orgId} order by fre.created_at asc limit 2000`,
      tx`select u.id, u.full_name from memberships m join users u on u.id = m.user_id where m.org_id = ${session.orgId} and m.deactivated_at is null order by u.full_name`,
    ]);
    return { requests, events, members };
  }).catch((error) => {
    const missing = error && typeof error === "object" && "code" in error && error.code === "42P01";
    if (!missing) throw error;
    return null;
  });

  if (!data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Feature requests" description="Intern inbox med status, ejer og audit trail." />
        <Card title="Migration kræves">
          <p className="text-sm">Migration 20260812000013 er forfattet, men ikke kørt. AGENTS.md kræver din godkendelse før migration.</p>
        </Card>
      </div>
    );
  }

  const rows = data.requests.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    description: String(row.description),
    status: String(row.status),
    ownerId: row.owner_id ? String(row.owner_id) : null,
    ownerName: row.owner_name ? String(row.owner_name) : null,
    creator: String(row.creator),
    updatedAt: fmtDateTime(row.updated_at),
    events: data.events
      .filter((event) => event.feature_request_id === row.id)
      .map((event) => ({
        id: String(event.id),
        type: String(event.event_type),
        actor: event.actor ? String(event.actor) : null,
        at: fmtDateTime(event.created_at),
        details: event.details as Record<string, unknown>,
      })),
  }));
  const members = data.members.map((row) => ({ id: String(row.id), name: String(row.full_name) }));

  return (
    <div className="space-y-4">
      <PageHeader title="Feature requests" description="Intern inbox med status, ejer og audit trail." />
      <FeatureRequestInbox canManage={can(session.role, "feature_requests.manage")} members={members} rows={rows} />
    </div>
  );
}
