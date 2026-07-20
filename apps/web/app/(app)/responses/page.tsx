import Link from "next/link";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";

export default async function ResponsesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const data = await withUser(session.userId, async (tx) => {
    const rows = await tx`
      select r.id, r.respondent_key, r.status, r.language, r.channel, r.started_at, r.completed_at,
             s.title as study_title, s.id as study_id, v.version_number,
             p.first_name, p.last_name, p.id as panelist_id,
             (select value from response_answers ra where ra.response_id = r.id and ra.question_type = 'nps' limit 1) as nps,
             (select count(*) from followup_cases fc where fc.response_id = r.id) as cases
      from responses r
      join studies s on s.id = r.study_id
      join study_versions v on v.id = r.study_version_id
      left join panelists p on p.id = r.panelist_id
      where (${sp.study ?? null}::uuid is null or r.study_id = ${sp.study ?? null}::uuid)
        and (${sp.status ?? null}::text is null or r.status = ${sp.status ?? null}::response_status)
        and (${sp.channel ?? null}::text is null or r.channel = ${sp.channel ?? null})
      order by r.started_at desc
      limit 200`;
    const studies = await tx`select id, title from studies order by title`;
    return { rows, studies };
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Responses" description="Inbox of incoming responses across all studies. Respondent identity is shown only when a panelist link exists and is permitted." />

      <Card>
        <form className="mb-3 flex flex-wrap gap-2" action="/responses">
          <select name="study" defaultValue={sp.study ?? ""} aria-label="Study"
            className="h-8.5 rounded-md border border-line bg-surface px-2 text-sm">
            <option value="">All studies</option>
            {data.studies.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <select name="status" defaultValue={sp.status ?? ""} aria-label="Status"
            className="h-8.5 rounded-md border border-line bg-surface px-2 text-sm">
            <option value="">All statuses</option>
            {["completed", "started", "disqualified", "abandoned"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select name="channel" defaultValue={sp.channel ?? ""} aria-label="Channel"
            className="h-8.5 rounded-md border border-line bg-surface px-2 text-sm">
            <option value="">All channels</option>
            {["link", "email", "qr", "trigger"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="submit" className="h-8.5 rounded-md border border-line bg-surface px-3 text-sm hover:bg-background cursor-pointer">
            Filter
          </button>
        </form>

        <Table>
          <thead>
            <tr>
              <Th>Respondent</Th><Th>Study</Th><Th>Ver</Th><Th>Status</Th>
              <Th>NPS</Th><Th>Channel</Th><Th>Follow-up</Th><Th>Started</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const nps = r.nps === null || r.nps === undefined ? null : Number(r.nps);
              return (
                <tr key={r.id}>
                  <Td>
                    {r.panelist_id ? (
                      <Link href={`/panel/${r.panelist_id}`} className="text-accent hover:underline">
                        {[r.first_name, r.last_name].filter(Boolean).join(" ") || "(anonymized)"}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs text-muted">{r.respondent_key}</span>
                    )}
                  </Td>
                  <Td><Link href={`/studies/${r.study_id}/results`} className="text-accent hover:underline">{r.study_title}</Link></Td>
                  <Td>v{r.version_number}</Td>
                  <Td>
                    <Badge tone={r.status === "completed" ? "green" : r.status === "disqualified" ? "gray" : "amber"}>
                      {r.status}
                    </Badge>
                  </Td>
                  <Td>
                    {nps === null ? "—" : (
                      <Badge tone={nps >= 9 ? "green" : nps >= 7 ? "amber" : "red"}>{nps}</Badge>
                    )}
                  </Td>
                  <Td>{r.channel}</Td>
                  <Td>{Number(r.cases) > 0 ? <Link href="/followup" className="text-accent underline text-xs">{r.cases} case(s)</Link> : "—"}</Td>
                  <Td className="whitespace-nowrap text-muted">{fmtDateTime(r.started_at, session.locale)}</Td>
                </tr>
              );
            })}
            {data.rows.length === 0 && <tr><Td colSpan={8} className="text-muted">No responses match.</Td></tr>}
          </tbody>
        </Table>
        {data.rows.length === 200 && <p className="mt-2 text-xs text-muted">Showing the latest 200.</p>}
      </Card>
    </div>
  );
}
