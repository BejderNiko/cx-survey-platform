import Link from "next/link";
import { can } from "@ok/domain";
import { Badge, Card, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { analyticsHealth } from "@/lib/analytics-client";
import { getAnalyticsOverview } from "@/lib/data/analytics";
import { withUser } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { RUN_STATUS, label } from "@/lib/labels";
import { BuildDatasetButton } from "./build-dataset-button";

export default async function AnalyticsPage() {
  const session = await requireSession();
  const health = await analyticsHealth();

  const data = await withUser(
    session.userId,
    session.orgId,
    (tx) => getAnalyticsOverview(tx, session.orgId),
  );

  const canCreate = can(session.role, "datasets.create");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analyse"
        description={
          health.ok
            ? `Analysetjenesten er online · ${health.procedures.length} procedurer · pandas ${health.versions.pandas}, scipy ${health.versions.scipy}, statsmodels ${health.versions.statsmodels}`
            : "Analysetjenesten er offline — start den med: cd apps/analytics && uv run uvicorn ok_analytics.main:app --port 8000"
        }
        actions={canCreate ? <LinkButton href="/analytics/import" variant="primary">Importér rådata</LinkButton> : undefined}
      />

      {canCreate && (
        <Card title="Byg datasæt fra studiebesvarelser">
          <BuildDatasetButton studies={data.studies.map((s) => ({ id: s.id as string, title: s.title as string }))} />
          <p className="mt-2 text-xs text-muted">
            Bygger et versioneret, analyseklart datasæt fra gennemførte besvarelser. Rådata ændres aldrig;
            genopbygning opretter en ny datasætversion med registreret afstamning.
          </p>
        </Card>
      )}

      <Card title="Datasætregister">
        <Table>
          <thead>
            <tr>
              <Th>Datasæt</Th><Th>Kilde</Th><Th>Ejer</Th>
              <Th className="text-right">Version</Th><Th className="text-right">Rækker</Th>
              <Th className="text-right">Variabler</Th><Th>Oprettet</Th>
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
                  <Badge tone={d.source_kind === "derived" ? "amber" : "blue"}>{d.source_kind === "derived" ? "afledt" : d.source_kind === "file_import" ? "ekstern rådata" : "studie"}</Badge>
                  {d.study_title && <span className="ml-1 text-xs text-muted">{d.study_title}</span>}
                </Td>
                <Td>{d.owner}</Td>
                <Td className="text-right tabular-nums">v{String(d.latest_version ?? "—")}</Td>
                <Td className="text-right tabular-nums">{String(d.row_count ?? "—")}</Td>
                <Td className="text-right tabular-nums">{String(d.variable_count ?? "—")}</Td>
                <Td className="whitespace-nowrap text-muted">{fmtDateTime(d.created_at)}</Td>
              </tr>
            ))}
            {data.datasets.length === 0 && (
              <tr><Td colSpan={7} className="text-muted">Ingen datasæt endnu — byg ét fra et studie ovenfor.</Td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Card title="Seneste analysekørsler">
        <Table>
          <thead>
            <tr><Th>Procedure</Th><Th>Datasæt</Th><Th>Status</Th><Th>Af</Th><Th>Startet</Th></tr>
          </thead>
          <tbody>
            {data.runs.map((r) => (
              <tr key={r.id}>
                <Td className="font-mono text-xs">{r.procedure}</Td>
                <Td><Link className="text-accent hover:underline" href={`/analytics/datasets/${r.dataset_id}`}>{r.dataset_name}</Link></Td>
                <Td>
                  <Badge tone={r.status === "succeeded" ? "green" : r.status === "failed" ? "red" : "amber"}>{label(RUN_STATUS, r.status)}</Badge>
                  {r.error && <span className="ml-1 text-xs text-danger">{r.error}</span>}
                </Td>
                <Td>{r.author}</Td>
                <Td className="whitespace-nowrap text-muted">{fmtDateTime(r.started_at)}</Td>
              </tr>
            ))}
            {data.runs.length === 0 && <tr><Td colSpan={5} className="text-muted">Der er ikke kørt analyser endnu.</Td></tr>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
