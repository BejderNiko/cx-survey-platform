import { can } from "@ok/domain";
import { Card, KpiTile, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { CaseBoard, RulesPanel } from "./followup-ui";

export default async function FollowupPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const mineOnly = sp.view === "mine";

  const data = await withUser(session.userId, async (tx) => {
    const cases = await tx`
      select fc.id, fc.title, fc.priority, fc.status, fc.due_at, fc.resolution, fc.created_at,
             s.title as study_title, u.full_name as assignee, fc.assignee_id, fc.response_id,
             (select value from response_answers ra where ra.response_id = fc.response_id and ra.question_type = 'nps' limit 1) as nps,
             (select value from response_answers ra where ra.response_id = fc.response_id and ra.question_type = 'long_text' limit 1) as verbatim
      from followup_cases fc
      left join studies s on s.id = fc.study_id
      left join users u on u.id = fc.assignee_id
      where (${mineOnly} = false or fc.assignee_id = ${session.userId})
      order by
        case fc.status when 'new' then 0 when 'assigned' then 1 when 'in_progress' then 2 when 'waiting' then 3 else 4 end,
        fc.created_at desc
      limit 200`;
    const activity = await tx`
      select fa.case_id, fa.activity_type, fa.detail, fa.created_at, u.full_name as actor
      from followup_activity fa left join users u on u.id = fa.actor_id
      where fa.case_id = any(${cases.map((c) => c.id as string)})
      order by fa.created_at asc`;
    const members = await tx`
      select u.id, u.full_name from users u
      join memberships m on m.user_id = u.id
      where m.deactivated_at is null and m.org_id = ${session.orgId}
      order by u.full_name`;
    const rules = await tx`
      select fr.id, fr.name, fr.is_active, fr.conditions, fr.actions, s.title as study_title, fr.study_id
      from followup_rules fr left join studies s on s.id = fr.study_id
      order by fr.created_at desc`;
    const studies = await tx`select id, title from studies order by title`;
    const [stats] = await tx`
      select count(*) filter (where status in ('new','assigned','in_progress','waiting')) as open,
             count(*) filter (where status = 'resolved') as resolved,
             count(*) filter (where status in ('new','assigned') and due_at < now()) as overdue,
             round(avg(extract(epoch from (resolved_at - created_at)) / 3600) filter (where resolved_at is not null))::int as avg_hours
      from followup_cases`;
    return { cases, activity, members, rules, studies, stats };
  });

  const activityByCase = new Map<string, (typeof data.activity)[number][]>();
  for (const a of data.activity) {
    const list = activityByCase.get(a.case_id as string) ?? [];
    list.push(a);
    activityByCase.set(a.case_id as string, list);
  }

  const canManage = can(session.role, "followup.manage");
  const canRules = can(session.role, "followup.rules.manage");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Follow-up"
        description="Closed-loop cases created by rules or manually. No feedback left behind."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Open cases" value={String(data.stats.open)} tone={Number(data.stats.open) > 0 ? "bad" : "good"} />
        <KpiTile label="Overdue" value={String(data.stats.overdue)} />
        <KpiTile label="Resolved" value={String(data.stats.resolved)} tone="good" />
        <KpiTile label="Avg. resolution time" value={data.stats.avg_hours ? `${data.stats.avg_hours} h` : "—"} />
      </div>

      <CaseBoard
        mineOnly={mineOnly}
        canManage={canManage}
        currentUserId={session.userId}
        members={data.members.map((m) => ({ id: m.id as string, name: m.full_name as string }))}
        cases={data.cases.map((c) => ({
          id: c.id as string,
          title: c.title as string,
          priority: c.priority as string,
          status: c.status as string,
          study: (c.study_title as string) ?? "—",
          assigneeId: (c.assignee_id as string) ?? null,
          assignee: (c.assignee as string) ?? null,
          nps: c.nps === null || c.nps === undefined ? null : Number(c.nps),
          verbatim: (c.verbatim as string) ?? null,
          due: c.due_at ? fmtDateTime(c.due_at, session.locale) : null,
          overdue: c.due_at ? new Date(c.due_at as string) < new Date() && !["resolved", "dismissed"].includes(c.status as string) : false,
          resolution: (c.resolution as string) ?? null,
          created: fmtDateTime(c.created_at, session.locale),
          activity: (activityByCase.get(c.id as string) ?? []).map((a) => ({
            type: a.activity_type as string,
            detail: a.detail as Record<string, unknown>,
            actor: (a.actor as string) ?? "rule",
            at: fmtDateTime(a.created_at, session.locale),
          })),
        }))}
      />

      <RulesPanel
        canManage={canRules}
        studies={data.studies.map((s) => ({ id: s.id as string, title: s.title as string }))}
        rules={data.rules.map((r) => ({
          id: r.id as string,
          name: r.name as string,
          isActive: r.is_active as boolean,
          study: (r.study_title as string) ?? "All studies",
          conditions: JSON.stringify(r.conditions),
          actions: JSON.stringify(r.actions),
        }))}
      />
    </div>
  );
}
