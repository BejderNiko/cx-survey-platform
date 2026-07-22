import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@ok/domain";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { Workbench } from "./workbench";

export default async function DatasetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const sp = await searchParams;

  const data = await withUser(session.userId, async (tx) => {
    const [dataset] = await tx`
      select d.*, u.full_name as owner, s.title as study_title, pd.name as parent_name, pd.id as parent_id
      from datasets d
      join users u on u.id = d.owner_id
      left join studies s on s.id = d.source_study_id
      left join datasets pd on pd.id = d.parent_dataset_id
      where d.id = ${id}`;
    if (!dataset) return null;
    const versions = await tx`
      select id, version_number, row_count, variable_count, lineage, created_at
      from dataset_versions where dataset_id = ${id} order by version_number desc`;
    const currentVersion = sp.v
      ? versions.find((v) => v.id === sp.v) ?? versions[0]
      : versions[0];
    if (!currentVersion) return { dataset, versions, currentVersion: null, variables: [], rows: [], recipes: [], runs: [] };
    const variables = await tx`
      select name, label, var_type, measure, value_labels, missing_values, role, position
      from variables where dataset_version_id = ${currentVersion.id} order by position`;
    const [versionRows] = await tx`select rows from dataset_versions where id = ${currentVersion.id}`;
    const recipes = await tx`
      select ar.id, ar.name, ar.procedure, ar.params, ar.created_at, u.full_name as author
      from analysis_recipes ar join users u on u.id = ar.created_by
      where ar.dataset_id = ${id} order by ar.created_at desc`;
    const runs = await tx`
      select ar.id, ar.procedure, ar.status, ar.started_at, ar.seed, ar.results, ar.error, u.full_name as author,
             dv.version_number
      from analysis_runs ar
      join dataset_versions dv on dv.id = ar.dataset_version_id
      join users u on u.id = ar.created_by
      where dv.dataset_id = ${id}
      order by ar.started_at desc limit 10`;
    return {
      dataset, versions, currentVersion, variables,
      rows: ((versionRows?.rows ?? []) as Record<string, unknown>[]).slice(0, 50),
      recipes, runs,
    };
  });
  if (!data) notFound();
  const { dataset, versions, currentVersion } = data;
  const canRun = can(session.role, "analytics.run");
  const canDerive = can(session.role, "datasets.create");
  const canExport = can(session.role, "datasets.export");

  return (
    <div className="space-y-4">
      <PageHeader
        title={dataset.name}
        description={
          <>
            {dataset.source_kind === "derived" ? "afledt" : "studie"}
            {dataset.study_title && <> · fra studiet “{dataset.study_title}”</>}
            {dataset.parent_id && (
              <> · afledt af <Link className="text-accent hover:underline" href={`/analytics/datasets/${dataset.parent_id}`}>{dataset.parent_name}</Link></>
            )}
            {" · ejer "}{dataset.owner}
          </>
        }
        actions={<Link href="/analytics" className="text-sm text-accent hover:underline">← Analyse</Link>}
      />

      <Card title="Versioner og afstamning">
        <Table>
          <thead>
            <tr><Th>Version</Th><Th className="text-right">Rækker</Th><Th className="text-right">Variabler</Th><Th>Afstamning</Th><Th>Oprettet</Th></tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className={v.id === currentVersion?.id ? "bg-accent-soft/40" : undefined}>
                <Td>
                  <Link href={`/analytics/datasets/${dataset.id}?v=${v.id}`} className="text-accent hover:underline">v{v.version_number}</Link>
                  {v.id === currentVersion?.id && <Badge className="ml-2" tone="accent">vises nu</Badge>}
                </Td>
                <Td className="text-right tabular-nums">{v.row_count}</Td>
                <Td className="text-right tabular-nums">{v.variable_count}</Td>
                <Td><code className="text-xs text-muted">{JSON.stringify(v.lineage)}</code></Td>
                <Td className="whitespace-nowrap text-muted">{fmtDateTime(v.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {currentVersion && (
        <Workbench
          versionId={currentVersion.id as string}
          versionNumber={Number(currentVersion.version_number)}
          rowCount={Number(currentVersion.row_count)}
          canRun={canRun}
          canDerive={canDerive}
          canExport={canExport}
          variables={data.variables.map((v) => ({
            name: v.name as string,
            label: v.label as string,
            varType: v.var_type as string,
            measure: v.measure as string,
            valueLabels: (v.value_labels ?? {}) as Record<string, string>,
            missingValues: (v.missing_values ?? []) as unknown[],
          }))}
          previewRows={data.rows}
          recipes={data.recipes.map((r) => ({
            id: r.id as string,
            name: r.name as string,
            procedure: r.procedure as string,
            params: JSON.stringify(r.params),
            author: r.author as string,
          }))}
          runs={data.runs.map((r) => ({
            id: r.id as string,
            procedure: r.procedure as string,
            status: r.status as string,
            version: `v${r.version_number}`,
            seed: r.seed === null ? null : Number(r.seed),
            author: r.author as string,
            startedAt: fmtDateTime(r.started_at),
            error: (r.error as string) ?? null,
            results: r.results ?? null,
          }))}
        />
      )}
    </div>
  );
}
