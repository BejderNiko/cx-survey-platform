import Link from "next/link";
import { can } from "@ok/domain";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { INSIGHT_STATUS, label } from "@/lib/labels";
import { CommentForm } from "../studies/[id]/study-actions";
import { InsightComposer, InsightStatusButtons } from "./insights-ui";

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const data = await withUser(session.userId, async (tx) => {
    const like = sp.q ? "%" + sp.q + "%" : null;
    const insights = await tx`
      select i.*, u.full_name as owner
      from insights i join users u on u.id = i.owner_id
      where ${like}::text is null or i.title ilike ${like} or i.summary ilike ${like}
      order by i.updated_at desc`;
    const links = await tx`
      select el.insight_id, el.entity_type, el.entity_id, el.note,
             s.title as study_title, d.name as dataset_name
      from evidence_links el
      left join studies s on s.id = el.entity_id and el.entity_type = 'study'
      left join dataset_versions dv on dv.id = el.entity_id and el.entity_type = 'dataset_version'
      left join datasets d on d.id = dv.dataset_id
      order by el.created_at`;
    const comments = await tx`
      select c.entity_id, c.body, c.created_at, u.full_name as author
      from comments c join users u on u.id = c.author_id
      where c.entity_type = 'insight' order by c.created_at desc`;
    const studies = await tx`select id, title from studies order by title`;
    const runs = await tx`
      select ar.id, ar.procedure, d.name from analysis_runs ar
      join dataset_versions dv on dv.id = ar.dataset_version_id
      join datasets d on d.id = dv.dataset_id
      where ar.status = 'succeeded' order by ar.started_at desc limit 20`;
    return { insights, links, comments, studies, runs };
  });

  const linksByInsight = new Map<string, (typeof data.links)[number][]>();
  for (const l of data.links) {
    const list = linksByInsight.get(l.insight_id as string) ?? [];
    list.push(l);
    linksByInsight.set(l.insight_id as string, list);
  }
  const commentsByInsight = new Map<string, (typeof data.comments)[number][]>();
  for (const c of data.comments) {
    const list = commentsByInsight.get(c.entity_id as string) ?? [];
    list.push(c);
    commentsByInsight.set(c.entity_id as string, list);
  }

  const canManage = can(session.role, "insights.manage");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Indsigter"
        description="Søgbart arkiv over fund, beslutninger og deres dokumentation."
      />

      <form action="/insights" className="flex gap-2">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Søg i indsigter"
          aria-label="Søg i indsigter"
          className="h-9 w-72 rounded-full border border-line bg-surface px-4 text-sm placeholder:text-muted/70 focus:border-accent/60"
        />
        <button
          type="submit"
          className="h-9 cursor-pointer rounded-full border border-line bg-surface px-4 text-sm transition-colors hover:border-accent/50 hover:text-accent"
        >
          Søg
        </button>
      </form>

      {canManage && (
        <Card title="Ny indsigt">
          <InsightComposer
            studies={data.studies.map((s) => ({ id: s.id as string, title: s.title as string }))}
            runs={data.runs.map((r) => ({ id: r.id as string, label: `${r.procedure} på ${r.name}` }))}
          />
        </Card>
      )}

      <div className="space-y-3">
        {data.insights.map((i) => (
          <Card
            key={i.id}
            title={
              <span className="flex items-center gap-2">
                {i.title}
                <Badge tone={i.status === "validated" ? "green" : i.status === "archived" ? "gray" : "amber"}>
                  {label(INSIGHT_STATUS, i.status)}
                </Badge>
              </span>
            }
            actions={canManage ? <InsightStatusButtons insightId={i.id as string} status={i.status as string} /> : undefined}
          >
            <p className="text-sm">{i.summary}</p>
            {i.decision && (
              <p className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-sm">
                <strong>Beslutning / anbefaling:</strong> {i.decision}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>{i.owner} · {fmtDate(i.updated_at)}</span>
              {(i.tags as string[]).map((t) => <Badge key={t}>{t}</Badge>)}
            </div>
            {(linksByInsight.get(i.id as string) ?? []).length > 0 && (
              <div className="mt-3 border-t border-line pt-2">
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Dokumentation</h4>
                <ul className="space-y-1 text-sm">
                  {(linksByInsight.get(i.id as string) ?? []).map((l, j) => (
                    <li key={j}>
                      {l.entity_type === "study" && l.study_title ? (
                        <Link href={`/studies/${l.entity_id}/results`} className="text-accent hover:underline">
                          Studie: {l.study_title}
                        </Link>
                      ) : l.entity_type === "dataset_version" && l.dataset_name ? (
                        <span>Datasæt: {l.dataset_name}</span>
                      ) : (
                        <span>{l.entity_type}</span>
                      )}
                      {l.note && <span className="text-xs text-muted"> — {l.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-3 border-t border-line pt-2">
              <CommentForm entityType="insight" entityId={i.id as string} path="/insights" />
              <ul className="mt-2 space-y-1.5">
                {(commentsByInsight.get(i.id as string) ?? []).map((c, j) => (
                  <li key={j} className="rounded-lg border border-line bg-surface-raised px-3 py-1.5 text-sm">
                    {c.body}
                    <span className="ml-2 text-xs text-muted">{c.author} · {fmtDate(c.created_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        ))}
        {data.insights.length === 0 && <p className="text-sm text-muted">Ingen indsigter matcher søgningen.</p>}
      </div>
    </div>
  );
}
