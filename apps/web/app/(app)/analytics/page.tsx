import Link from "next/link";
import { can } from "@ok/domain";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { analyticsHealth } from "@/lib/analytics-client";
import { withUser } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { BuildDatasetButton } from "./build-dataset-button";

export default async function AnalyticsPage() {
  const session = await requireSession();
  const health = await analyticsHealth();

  const data = await withUser(session.userId, async (tx) => {
    const datasets = await tx`
      select d.id, d.name, d.description, d.source_kind, d.created_at, u.full_name as owner,
             s.title as study_title,
             (select max(version_number) from dataset_versions v where v.dataset_id = d.id) as latest_version,
             (select row_count from dataset_versions v where v.dataset_id = d.id order by version_number desc limit 1) as row_count,
             (select variable_count from dataset_versions v where v.dataset_id = d.id order by version_number desc limit 1) as variable_count
      from datasets d
      join users u on u.id = d.owner_id
      left join studies s on s.id = d.source_study_id
      order by d.created_at desc`;
    const studies = await tx`
      select s.id, s.title from studies s
      where exists (select 1 from study_versions v where v.study_id = s.id)
      order by s.title`;
    const runs = await tx`
      select ar.id, ar.procedure, ar.status, ar.started_at, ar.error, u.full_name as author, d.name as dataset_name, d.id as dataset_id
      from analysis_runs ar
      join dataset_versions dv on dv.id = ar.dataset_version_id
      join datasets d on d.id = dv.dataset_id
      join users u on u.id = ar.created_by
      order by ar.started_at desc limit 15`;
    return { datasets, studies, runs };
  });

  const canCreate = can(session.role, "datasets.create");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analytics"
        description={
          health.ok
            ? `Analytics service online · ${health.procedures.length} procedures · pandas ${health.versions.pandas}, scipy ${health.versions.scipy}, statsmodels ${health.versions.statsmodels}`
            : "Analytics service offline — start it with: cd apps/analytics && uv run uvicorn ok_analytics.main:app --port 8000"
        }
      />

      {canCreate && (
        <Card title="Build dataset from study responses">
          <BuildDatasetButton studies={data.studies.map((s) => ({ id: s.id as string, title: s.title as string }))} />
          <p className="mt-2 text-xs text-muted">
            Builds a versioned, analysis-ready dataset from completed responses. Raw responses are never modified;
            rebuilding creates a new dataset version with recorded lineage.
          </p>
        </Card>
      )}

      <Card title="Dataset registry">
        <Table>
          <thead>
            <tr>
              <Th>Dataset</Th><Th>Source</Th><Th>Owner</Th>
              <Th className="text-right">Version</Th><Th className="text-right">Rows</Th>
              <Th className="text-right">Variables</Th><Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {data.datasets.map((d) => (
              <tr key={d.id}>
                <Td>
                  <Link href={`/analytics/datasets/${d.id}`} className="font-medium text-accent hover:underline">{d.name}</Link>
                  {d.description && <p className="text-xs text-muted">{d.description}</p>}
                </Td>
                <Td>
                  <Badge tone={d.source_kind === "derived" ? "amber" : "blue"}>{d.source_kind}</Badge>
                  {d.study_title && <span className="ml-1 text-xs text-muted">{d.study_title}</span>}
                </Td>
                <Td>{d.owner}</Td>
                <Td className="text-right tabular-nums">v{String(d.latest_version ?? "—")}</Td>
                <Td className="text-right tabular-nums">{String(d.row_count ?? "—")}</Td>
                <Td className="text-right tabular-nums">{String(d.variable_count ?? "—")}</Td>
                <Td className="whitespace-nowrap text-muted">{fmtDateTime(d.created_at, session.locale)}</Td>
              </tr>
            ))}
            {data.datasets.length === 0 && (
              <tr><Td colSpan={7} className="text-muted">No datasets yet — build one from a study above.</Td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Card title="Recent analysis runs">
        <Table>
          <thead>
            <tr><Th>Procedure</Th><Th>Dataset</Th><Th>Status</Th><Th>By</Th><Th>Started</Th></tr>
          </thead>
          <tbody>
            {data.runs.map((r) => (
              <tr key={r.id}>
                <Td className="font-mono text-xs">{r.procedure}</Td>
                <Td><Link className="text-accent hover:underline" href={`/analytics/datasets/${r.dataset_id}`}>{r.dataset_name}</Link></Td>
                <Td>
                  <Badge tone={r.status === "succeeded" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Badge>
                  {r.error && <span className="ml-1 text-xs text-danger">{r.error}</span>}
                </Td>
                <Td>{r.author}</Td>
                <Td className="whitespace-nowrap text-muted">{fmtDateTime(r.started_at, session.locale)}</Td>
              </tr>
            ))}
            {data.runs.length === 0 && <tr><Td colSpan={5} className="text-muted">No analyses run yet.</Td></tr>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
