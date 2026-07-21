import Link from "next/link";
import { computeNps } from "@ok/domain";
import { Badge, Card, KpiTile, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtDateTime, fmtNumber, fmtPercent } from "@/lib/format";

export default async function HomePage() {
  const session = await requireSession();

  const data = await withUser(session.userId, async (tx) => {
    const [liveStudies, respStats, panelStats, followupOpen, myCases, recentRuns, npsValues, recentResponses] =
      await Promise.all([
        tx`select s.id, s.title, s.status, s.study_type,
                  (select count(*) from responses r where r.study_id = s.id and r.status = 'completed') as completed
           from studies s where s.status in ('live','paused') order by s.updated_at desc limit 6`,
        tx`select count(*) filter (where started_at > now() - interval '30 days') as last30,
                  count(*) filter (where started_at > now() - interval '7 days') as last7,
                  count(*) filter (where status = 'completed') as completed_total,
                  count(*) as total
           from responses`,
        tx`select count(*) filter (where lifecycle = 'active') as active,
                  count(*) as total,
                  count(*) filter (where lifecycle in ('unsubscribed','bounced','blocked')) as unreachable
           from panelists`,
        tx`select count(*) as open from followup_cases where status in ('new','assigned','in_progress','waiting')`,
        tx`select count(*) as mine from followup_cases
           where assignee_id = ${session.userId} and status in ('new','assigned','in_progress','waiting')`,
        tx`select ar.id, ar.procedure, ar.status, ar.started_at, d.name as dataset_name
           from analysis_runs ar
           join dataset_versions dv on dv.id = ar.dataset_version_id
           join datasets d on d.id = dv.dataset_id
           order by ar.started_at desc limit 5`,
        tx`select ra.value from response_answers ra
           join responses r on r.id = ra.response_id
           where ra.question_code = 'nps_score' and r.status = 'completed'
             and r.started_at > now() - interval '90 days'`,
        tx`select r.id, s.title, r.status, r.channel, r.started_at
           from responses r join studies s on s.id = r.study_id
           order by r.started_at desc limit 6`,
      ]);
    return {
      liveStudies,
      respStats: respStats[0],
      panelStats: panelStats[0],
      followupOpen: Number(followupOpen[0].open),
      myCases: Number(myCases[0].mine),
      recentRuns,
      nps: computeNps(npsValues.map((v) => v.value)),
      recentResponses,
    };
  });

  const completionRate =
    Number(data.respStats.total) > 0
      ? (Number(data.respStats.completed_total) / Number(data.respStats.total)) * 100
      : null;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Operational overview</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile
          label="NPS · last 90 days"
          value={data.nps.score === null ? "—" : fmtNumber(data.nps.score, session.locale)}
          hint={`${data.nps.valid} valid responses`}
          tone={data.nps.score !== null && data.nps.score > 0 ? "good" : "bad"}
        />
        <KpiTile label="Responses · 30 days" value={String(data.respStats.last30)} hint={`${data.respStats.last7} in the last 7 days`} />
        <KpiTile
          label="Completion rate"
          value={fmtPercent(completionRate, session.locale)}
          hint="completed of all started"
        />
        <KpiTile
          label="Active panelists"
          value={String(data.panelStats.active)}
          hint={`${data.panelStats.unreachable} unreachable of ${data.panelStats.total}`}
        />
        <KpiTile
          label="Open follow-ups"
          value={String(data.followupOpen)}
          hint={`${data.myCases} assigned to you`}
          tone={data.followupOpen > 0 ? "bad" : "good"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Current studies" actions={<Link className="text-xs text-accent hover:underline" href="/studies">All studies</Link>}>
          <Table>
            <thead>
              <tr>
                <Th>Study</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th className="text-right">Completed</Th>
              </tr>
            </thead>
            <tbody>
              {data.liveStudies.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <Link href={`/studies/${s.id}`} className="font-medium text-accent hover:underline">
                      {s.title}
                    </Link>
                  </Td>
                  <Td>{s.study_type}</Td>
                  <Td>
                    <Badge tone={s.status === "live" ? "green" : "amber"}>{s.status}</Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{String(s.completed)}</Td>
                </tr>
              ))}
              {data.liveStudies.length === 0 && (
                <tr>
                  <Td colSpan={4} className="text-muted">No live studies.</Td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>

        <Card title="Latest response activity" actions={<Link className="text-xs text-accent hover:underline" href="/responses">Inbox</Link>}>
          <Table>
            <thead>
              <tr>
                <Th>Study</Th>
                <Th>Status</Th>
                <Th>Channel</Th>
                <Th>Started</Th>
              </tr>
            </thead>
            <tbody>
              {data.recentResponses.map((r) => (
                <tr key={r.id}>
                  <Td>{r.title}</Td>
                  <Td>
                    <Badge tone={r.status === "completed" ? "green" : r.status === "started" ? "amber" : "gray"}>{r.status}</Badge>
                  </Td>
                  <Td>{r.channel}</Td>
                  <Td className="whitespace-nowrap text-muted">{fmtDateTime(r.started_at, session.locale)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card title="Recent analyses" actions={<Link className="text-xs text-accent hover:underline" href="/analytics">Analytics</Link>}>
        {data.recentRuns.length === 0 ? (
          <p className="text-sm text-muted">No analyses have been run yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Procedure</Th>
                <Th>Dataset</Th>
                <Th>Status</Th>
                <Th>Started</Th>
              </tr>
            </thead>
            <tbody>
              {data.recentRuns.map((r) => (
                <tr key={r.id}>
                  <Td className="font-mono text-xs">{r.procedure}</Td>
                  <Td>{r.dataset_name}</Td>
                  <Td>
                    <Badge tone={r.status === "succeeded" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Badge>
                  </Td>
                  <Td className="text-muted whitespace-nowrap">{fmtDateTime(r.started_at, session.locale)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
