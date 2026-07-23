import Link from "next/link";
import { computeNps } from "@ok/domain";
import { IconStudy } from "@/components/icons";
import { Badge, Card, KpiTile, ListRow, StatusBadge, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtDateTime, fmtNumber, fmtPercent } from "@/lib/format";
import { CHANNEL, RESPONSE_STATUS, RUN_STATUS, STUDY_STATUS, STUDY_STATUS_TONE, label } from "@/lib/labels";

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("da-DK", { hour: "numeric", hour12: false, timeZone: "Europe/Copenhagen" }).format(new Date()),
  );
  if (hour < 5) return "Godnat";
  if (hour < 10) return "Godmorgen";
  if (hour < 12) return "Godformiddag";
  if (hour < 18) return "Goddag";
  return "Godaften";
}

export default async function HomePage() {
  const session = await requireSession();
  const firstName = session.fullName.split(/\s+/)[0] ?? session.fullName;

  const data = await withUser(session.userId, session.orgId, async (tx) => {
    const [liveStudies, respStats, panelStats, recentRuns, npsValues, recentResponses] =
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
        tx`select ar.id, ar.procedure, ar.status, ar.started_at, d.name as dataset_name
           from analysis_runs ar
           join dataset_versions dv on dv.id = ar.dataset_version_id
           join datasets d on d.id = dv.dataset_id
           order by ar.started_at desc limit 5`,
        tx`select ra.value from response_answers ra
           join responses r on r.id = ra.response_id
           where ra.question_code = 'nps_score' and r.status = 'completed'
             and r.started_at > now() - interval '90 days'`,
        tx`select r.id, s.title, s.id as study_id, r.status, r.channel, r.started_at
           from responses r join studies s on s.id = r.study_id
           order by r.started_at desc limit 6`,
      ]);
    return {
      liveStudies,
      respStats: respStats[0],
      panelStats: panelStats[0],
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
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-heading">
          {greeting()}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {new Intl.DateTimeFormat("da-DK", { dateStyle: "full", timeZone: "Europe/Copenhagen" }).format(new Date())}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="NPS · seneste 90 dage"
          value={data.nps.score === null ? "—" : fmtNumber(data.nps.score)}
          hint={`${data.nps.valid} gyldige svar`}
          tone={data.nps.score !== null && data.nps.score > 0 ? "good" : "bad"}
        />
        <KpiTile label="Besvarelser · 30 dage" value={String(data.respStats.last30)} hint={`${data.respStats.last7} de seneste 7 dage`} />
        <KpiTile
          label="Gennemførselsrate"
          value={fmtPercent(completionRate)}
          hint="gennemførte af alle startede"
        />
        <KpiTile
          label="Aktive panelister"
          value={String(data.panelStats.active)}
          hint={`${data.panelStats.unreachable} kan ikke kontaktes af ${data.panelStats.total}`}
        />
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-heading">Aktuelle studier</h2>
          <Link className="text-xs text-accent hover:underline" href="/studies">Alle studier</Link>
        </div>
        <div className="space-y-2">
          {data.liveStudies.map((s) => (
            <ListRow key={s.id} href={`/studies/${s.id}`} icon={<IconStudy />}>
              <div className="flex min-w-0 items-center justify-between gap-4">
                <p className="truncate font-medium text-heading">{s.title}</p>
                <div className="hidden shrink-0 items-center gap-6 sm:flex">
                  <div className="w-28 text-right">
                    <p className="text-sm font-semibold tabular-nums text-heading">{String(s.completed)}</p>
                    <p className="text-xs text-muted">{Number(s.completed) === 1 ? "besvarelse" : "besvarelser"}</p>
                  </div>
                  <div className="w-32">
                    <StatusBadge tone={STUDY_STATUS_TONE[s.status] ?? "gray"}>
                      {label(STUDY_STATUS, s.status)}
                    </StatusBadge>
                  </div>
                </div>
              </div>
            </ListRow>
          ))}
          {data.liveStudies.length === 0 && (
            <p className="rounded-xl border border-dashed border-line-strong bg-surface px-4 py-6 text-center text-sm text-muted">
              Ingen aktive studier.
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Seneste besvarelser" actions={<span className="text-xs text-muted">på tværs af studier</span>}>
          <Table>
            <thead>
              <tr>
                <Th>Studie</Th>
                <Th>Status</Th>
                <Th>Kanal</Th>
                <Th>Påbegyndt</Th>
              </tr>
            </thead>
            <tbody>
              {data.recentResponses.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link href={`/studies/${r.study_id}/results`} className="text-accent hover:underline">
                      {r.title}
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={r.status === "completed" ? "green" : r.status === "started" ? "amber" : "gray"}>
                      {label(RESPONSE_STATUS, r.status)}
                    </Badge>
                  </Td>
                  <Td>{label(CHANNEL, r.channel)}</Td>
                  <Td className="whitespace-nowrap text-muted">{fmtDateTime(r.started_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card title="Seneste analyser" actions={<Link className="text-xs text-accent hover:underline" href="/analytics">Analyse</Link>}>
          {data.recentRuns.length === 0 ? (
            <p className="text-sm text-muted">Der er ikke kørt analyser endnu.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Procedure</Th>
                  <Th>Datasæt</Th>
                  <Th>Status</Th>
                  <Th>Startet</Th>
                </tr>
              </thead>
              <tbody>
                {data.recentRuns.map((r) => (
                  <tr key={r.id}>
                    <Td className="font-mono text-xs">{r.procedure}</Td>
                    <Td>{r.dataset_name}</Td>
                    <Td>
                      <Badge tone={r.status === "succeeded" ? "green" : r.status === "failed" ? "red" : "amber"}>
                        {label(RUN_STATUS, r.status)}
                      </Badge>
                    </Td>
                    <Td className="text-muted whitespace-nowrap">{fmtDateTime(r.started_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
