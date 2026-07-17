"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge, Button, Card, Input, Select, Table, Td, Th, cn } from "@/components/ui";
import { PlotlyChart } from "@/components/plotly-chart";
import type { AnalysisResultPayload } from "@/lib/analytics-client";
import { deriveDataset, rerunRecipe, runAnalysis } from "../../actions";

interface VariableInfo {
  name: string;
  label: string;
  varType: string;
  measure: string;
  valueLabels: Record<string, string>;
  missingValues: unknown[];
}

interface RunInfo {
  id: string;
  procedure: string;
  status: string;
  version: string;
  seed: number | null;
  author: string;
  startedAt: string;
  error: string | null;
  results: unknown;
}

/**
 * Procedure catalog: quick layer for researchers/CX, advanced layer for
 * analysts. Field specs drive the parameter form.
 */
const PROCEDURES: {
  key: string; label: string; layer: "quick" | "advanced";
  fields: { param: string; label: string; kind: "variable" | "variables" | "choice" | "number" | "text"; options?: string[]; numericOnly?: boolean; optional?: boolean }[];
}[] = [
  { key: "nps", label: "NPS (with trend)", layer: "quick", fields: [
    { param: "variable", label: "NPS variable", kind: "variable", numericOnly: true },
    { param: "date_variable", label: "Date variable (for trend)", kind: "variable", optional: true },
    { param: "period", label: "Period", kind: "choice", options: ["week", "month", "quarter"], optional: true },
  ]},
  { key: "csat", label: "CSAT", layer: "quick", fields: [{ param: "variable", label: "CSAT variable (1-5)", kind: "variable", numericOnly: true }] },
  { key: "ces", label: "CES", layer: "quick", fields: [{ param: "variable", label: "CES variable (1-7)", kind: "variable", numericOnly: true }] },
  { key: "frequencies", label: "Frequencies", layer: "quick", fields: [{ param: "variable", label: "Variable", kind: "variable" }] },
  { key: "descriptives", label: "Descriptives", layer: "quick", fields: [
    { param: "variables", label: "Variables", kind: "variables", numericOnly: true },
    { param: "weight", label: "Weight variable", kind: "variable", numericOnly: true, optional: true },
  ]},
  { key: "missingness", label: "Missing-data summary", layer: "quick", fields: [] },
  { key: "trend", label: "Trend & forecast", layer: "quick", fields: [
    { param: "date_variable", label: "Date variable", kind: "variable" },
    { param: "variable", label: "Measure (blank = row count)", kind: "variable", numericOnly: true, optional: true },
    { param: "period", label: "Period", kind: "choice", options: ["day", "week", "month"], optional: true },
  ]},
  { key: "crosstab", label: "Crosstab + chi-square", layer: "advanced", fields: [
    { param: "row", label: "Row variable", kind: "variable" },
    { param: "column", label: "Column variable", kind: "variable" },
    { param: "percent", label: "Percentages", kind: "choice", options: ["row", "column", "total", "none"], optional: true },
  ]},
  { key: "correlation", label: "Correlation (Pearson/Spearman)", layer: "advanced", fields: [
    { param: "variables", label: "Variables", kind: "variables", numericOnly: true },
    { param: "method", label: "Method", kind: "choice", options: ["pearson", "spearman"], optional: true },
  ]},
  { key: "ttest_ind", label: "Independent t-test", layer: "advanced", fields: [
    { param: "variable", label: "Test variable", kind: "variable", numericOnly: true },
    { param: "group", label: "Grouping variable (2 levels)", kind: "variable" },
  ]},
  { key: "ttest_rel", label: "Paired t-test", layer: "advanced", fields: [
    { param: "variable1", label: "Variable 1", kind: "variable", numericOnly: true },
    { param: "variable2", label: "Variable 2", kind: "variable", numericOnly: true },
  ]},
  { key: "anova", label: "One-way ANOVA + Tukey", layer: "advanced", fields: [
    { param: "variable", label: "Test variable", kind: "variable", numericOnly: true },
    { param: "group", label: "Grouping variable", kind: "variable" },
  ]},
  { key: "mannwhitney", label: "Mann-Whitney U", layer: "advanced", fields: [
    { param: "variable", label: "Test variable", kind: "variable", numericOnly: true },
    { param: "group", label: "Grouping variable (2 levels)", kind: "variable" },
  ]},
  { key: "kruskal", label: "Kruskal-Wallis", layer: "advanced", fields: [
    { param: "variable", label: "Test variable", kind: "variable", numericOnly: true },
    { param: "group", label: "Grouping variable", kind: "variable" },
  ]},
  { key: "wilcoxon", label: "Wilcoxon signed-rank", layer: "advanced", fields: [
    { param: "variable1", label: "Variable 1", kind: "variable", numericOnly: true },
    { param: "variable2", label: "Variable 2", kind: "variable", numericOnly: true },
  ]},
  { key: "linear_regression", label: "Linear regression (OLS)", layer: "advanced", fields: [
    { param: "dependent", label: "Dependent variable", kind: "variable", numericOnly: true },
    { param: "predictors", label: "Predictors", kind: "variables" },
  ]},
  { key: "logistic_regression", label: "Binary logistic regression", layer: "advanced", fields: [
    { param: "dependent", label: "Binary outcome (0/1)", kind: "variable", numericOnly: true },
    { param: "predictors", label: "Predictors", kind: "variables" },
  ]},
  { key: "cronbach_alpha", label: "Reliability (Cronbach's alpha)", layer: "advanced", fields: [
    { param: "variables", label: "Scale items", kind: "variables", numericOnly: true },
  ]},
  { key: "bootstrap", label: "Bootstrap CI", layer: "advanced", fields: [
    { param: "variable", label: "Variable", kind: "variable", numericOnly: true },
    { param: "statistic", label: "Statistic", kind: "choice", options: ["mean", "median", "std"], optional: true },
    { param: "n_boot", label: "Resamples", kind: "number", optional: true },
  ]},
  { key: "kmeans", label: "K-means segmentation", layer: "advanced", fields: [
    { param: "variables", label: "Variables", kind: "variables", numericOnly: true },
    { param: "k", label: "Clusters (k)", kind: "number" },
  ]},
  { key: "factor", label: "Factor analysis (EFA)", layer: "advanced", fields: [
    { param: "variables", label: "Items", kind: "variables", numericOnly: true },
    { param: "n_factors", label: "Factors", kind: "number" },
  ]},
];

export function Workbench({
  datasetId, versionId, versionNumber, rowCount, variables, previewRows, recipes, runs,
  canRun, canDerive, canExport,
}: {
  datasetId: string;
  versionId: string;
  versionNumber: number;
  rowCount: number;
  variables: VariableInfo[];
  previewRows: Record<string, unknown>[];
  recipes: { id: string; name: string; procedure: string; params: string; author: string }[];
  runs: RunInfo[];
  canRun: boolean;
  canDerive: boolean;
  canExport: boolean;
}) {
  const [tab, setTab] = useState<"data" | "variables" | "analyze" | "derive">("analyze");
  const [layer, setLayer] = useState<"quick" | "advanced">("quick");
  const [procKey, setProcKey] = useState("nps");
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [seed, setSeed] = useState("");
  const [recipeName, setRecipeName] = useState("");
  const [result, setResult] = useState<AnalysisResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const proc = PROCEDURES.find((p) => p.key === procKey)!;
  const numericVars = useMemo(() => variables.filter((v) => v.varType === "numeric"), [variables]);
  const visibleProcs = PROCEDURES.filter((p) => layer === "advanced" || p.layer === "quick");

  function execute() {
    startTransition(async () => {
      setError(null);
      setResult(null);
      const res = await runAnalysis({
        datasetVersionId: versionId,
        procedure: procKey,
        params,
        seed: seed === "" ? null : Number(seed),
        recipeName: recipeName.trim() || null,
      });
      if (res.error) setError(res.error);
      else setResult(res.result);
      setRecipeName("");
    });
  }

  return (
    <>
      <Card
        title={`Workspace — v${versionNumber} (${rowCount} rows)`}
        actions={
          canExport ? (
            <span className="flex gap-2 text-xs">
              {["csv", "xlsx", "json", "sav"].map((f) => (
                <a key={f} className="text-accent underline" href={`/api/dataset-versions/${versionId}/export?format=${f}`}>
                  {f.toUpperCase()}
                </a>
              ))}
            </span>
          ) : undefined
        }
      >
        <div className="mb-3 flex gap-1 border-b border-line" role="tablist">
          {(["analyze", "data", "variables", "derive"] as const).map((t) => (
            (t !== "derive" || canDerive) && (
              <button key={t} role="tab" aria-selected={tab === t}
                className={cn("px-3 py-1.5 text-sm cursor-pointer", tab === t ? "border-b-2 border-accent font-medium text-accent" : "text-muted hover:text-foreground")}
                onClick={() => setTab(t)}>
                {t === "analyze" ? "Analyze" : t === "data" ? "Data grid" : t === "variables" ? "Variable view" : "Derive dataset"}
              </button>
            )
          ))}
        </div>

        {tab === "data" && (
          <div className="max-h-96 overflow-auto rounded border border-line">
            <Table>
              <thead>
                <tr>{variables.map((v) => <Th key={v.name}>{v.name}</Th>)}</tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i}>
                    {variables.map((v) => (
                      <Td key={v.name} className="whitespace-nowrap text-xs">
                        {row[v.name] === null || row[v.name] === undefined ? <span className="text-muted">·</span> : String(row[v.name])}
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
            {rowCount > previewRows.length && (
              <p className="px-3 py-2 text-xs text-muted">Showing the first {previewRows.length} of {rowCount} rows (full data in exports).</p>
            )}
          </div>
        )}

        {tab === "variables" && (
          <Table>
            <thead>
              <tr><Th>Name</Th><Th>Label</Th><Th>Type</Th><Th>Measure</Th><Th>Value labels</Th><Th>Missing rules</Th></tr>
            </thead>
            <tbody>
              {variables.map((v) => (
                <tr key={v.name}>
                  <Td className="font-mono text-xs">{v.name}</Td>
                  <Td>{v.label}</Td>
                  <Td><Badge>{v.varType}</Badge></Td>
                  <Td><Badge tone="blue">{v.measure}</Badge></Td>
                  <Td className="text-xs text-muted">
                    {Object.entries(v.valueLabels).slice(0, 4).map(([k, l]) => `${k}=${l}`).join(", ")}
                    {Object.keys(v.valueLabels).length > 4 && " …"}
                  </Td>
                  <Td className="text-xs text-muted">{v.missingValues.length ? JSON.stringify(v.missingValues) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {tab === "analyze" && canRun && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Layer</label>
                <div className="flex rounded-md border border-line">
                  {(["quick", "advanced"] as const).map((l) => (
                    <button key={l}
                      className={cn("px-3 py-1.5 text-sm cursor-pointer first:rounded-l-md last:rounded-r-md", layer === l ? "bg-accent text-white" : "bg-surface text-muted")}
                      onClick={() => { setLayer(l); if (l === "quick" && proc.layer === "advanced") setProcKey("nps"); }}>
                      {l === "quick" ? "Quick analysis" : "Advanced"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="wb-proc" className="mb-1 block text-xs font-medium text-muted">Procedure</label>
                <Select id="wb-proc" value={procKey} onChange={(e) => { setProcKey(e.target.value); setParams({}); setResult(null); }}>
                  {visibleProcs.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </Select>
              </div>
              {proc.fields.map((f) => (
                <div key={f.param}>
                  <label htmlFor={`wb-${f.param}`} className="mb-1 block text-xs font-medium text-muted">
                    {f.label}{f.optional ? " (optional)" : ""}
                  </label>
                  {f.kind === "variable" && (
                    <Select id={`wb-${f.param}`} value={(params[f.param] as string) ?? ""}
                      onChange={(e) => setParams((p) => ({ ...p, [f.param]: e.target.value || undefined }))}>
                      <option value="">—</option>
                      {(f.numericOnly ? numericVars : variables).map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
                    </Select>
                  )}
                  {f.kind === "variables" && (
                    <select id={`wb-${f.param}`} multiple size={4}
                      className="min-w-44 rounded-md border border-line bg-surface px-2 py-1 text-sm"
                      value={(params[f.param] as string[]) ?? []}
                      onChange={(e) => setParams((p) => ({ ...p, [f.param]: Array.from(e.target.selectedOptions).map((o) => o.value) }))}>
                      {(f.numericOnly ? numericVars : variables).map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
                    </select>
                  )}
                  {f.kind === "choice" && (
                    <Select id={`wb-${f.param}`} value={(params[f.param] as string) ?? f.options![0]}
                      onChange={(e) => setParams((p) => ({ ...p, [f.param]: e.target.value }))}>
                      {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                    </Select>
                  )}
                  {f.kind === "number" && (
                    <Input id={`wb-${f.param}`} type="number" className="w-24"
                      value={params[f.param] === undefined ? "" : String(params[f.param])}
                      onChange={(e) => setParams((p) => ({ ...p, [f.param]: e.target.value === "" ? undefined : Number(e.target.value) }))} />
                  )}
                </div>
              ))}
              {["bootstrap", "kmeans", "factor"].includes(procKey) && (
                <div>
                  <label htmlFor="wb-seed" className="mb-1 block text-xs font-medium text-muted">Seed (optional)</label>
                  <Input id="wb-seed" type="number" className="w-28" value={seed} onChange={(e) => setSeed(e.target.value)} />
                </div>
              )}
              <div>
                <label htmlFor="wb-recipe" className="mb-1 block text-xs font-medium text-muted">Save as recipe (optional)</label>
                <Input id="wb-recipe" className="w-48" placeholder="recipe name" value={recipeName} onChange={(e) => setRecipeName(e.target.value)} />
              </div>
              <Button onClick={execute} disabled={pending}>{pending ? "Running…" : "Run analysis"}</Button>
            </div>

            {error && <p role="alert" className="rounded-md border border-danger/30 bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
            {result && <ResultView result={result} />}
          </div>
        )}

        {tab === "derive" && canDerive && (
          <DeriveForm versionId={versionId} variables={variables} />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Saved recipes (reproducible)">
          {recipes.length === 0 ? (
            <p className="text-sm text-muted">Save a run as a recipe to make it reproducible on any version of this dataset.</p>
          ) : (
            <ul className="space-y-1.5">
              {recipes.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
                  <span className="font-medium">{r.name}</span>
                  <Badge>{r.procedure}</Badge>
                  <code className="text-xs text-muted">{r.params}</code>
                  <span className="text-xs text-muted">by {r.author}</span>
                  {canRun && (
                    <Button size="sm" variant="secondary" className="ml-auto" disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          setError(null);
                          const res = await rerunRecipe(r.id, versionId);
                          if (res.error) setError(res.error);
                          else { setResult(res.result); setTab("analyze"); }
                        })
                      }>
                      Rerun on v{versionNumber}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Run history (this dataset)">
          <ul className="space-y-1.5 text-sm">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line px-3 py-1.5">
                <Badge tone={r.status === "succeeded" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Badge>
                <code className="text-xs">{r.procedure}</code>
                <span className="text-xs text-muted">{r.version} · {r.author} · {r.startedAt}{r.seed !== null ? ` · seed ${r.seed}` : ""}</span>
                {r.error && <span className="text-xs text-danger">{r.error}</span>}
                {r.results !== null && (
                  <Button size="sm" variant="ghost" className="ml-auto"
                    onClick={() => { setResult(r.results as AnalysisResultPayload); setTab("analyze"); }}>
                    View
                  </Button>
                )}
              </li>
            ))}
            {runs.length === 0 && <li className="text-muted">No runs yet.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}

function ResultView({ result }: { result: AnalysisResultPayload }) {
  return (
    <div className="space-y-3 rounded-md border border-line bg-background p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge tone="accent">{result.procedure}</Badge>
        <span>{result.method}</span>
        <span>· n used {result.n_used} / {result.n_total} ({result.n_excluded} excluded)</span>
        {result.seed !== null && <span>· seed {result.seed}</span>}
      </div>
      <p className="text-xs text-muted">Missing data: {result.missing_strategy}</p>
      {result.assumptions.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-muted">
          {result.assumptions.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      )}
      {result.warnings.length > 0 && (
        <ul className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
          {result.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
        </ul>
      )}
      {result.tables.map((t, i) => (
        <div key={i}>
          <h3 className="mb-1 text-sm font-semibold">{t.title}</h3>
          <Table>
            <thead>
              <tr>{t.columns.map((c, j) => <Th key={j}>{c}</Th>)}</tr>
            </thead>
            <tbody>
              {t.rows.map((row, j) => (
                <tr key={j}>
                  {row.map((cell, k) => (
                    <Td key={k} className="tabular-nums">{cell === null || cell === undefined ? "—" : String(cell)}</Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ))}
      {result.chart && <PlotlyChart data={result.chart.data} layout={result.chart.layout} />}
      {result.interpretation && (
        <p className="border-t border-line pt-2 text-xs text-muted"><strong>Reading this result:</strong> {result.interpretation}</p>
      )}
      <p className="text-[11px] text-muted">
        Libraries: {Object.entries(result.library_versions).map(([k, v]) => `${k} ${v}`).join(" · ")}
      </p>
    </div>
  );
}

function DeriveForm({ versionId, variables }: { versionId: string; variables: VariableInfo[] }) {
  const [name, setName] = useState("");
  const [filterVariable, setFilterVariable] = useState("");
  const [filterOp, setFilterOp] = useState("eq");
  const [filterValue, setFilterValue] = useState("");
  const [keep, setKeep] = useState<string[]>(variables.map((v) => v.name));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Creates a new derived dataset (filtered rows and/or selected columns). The source version is never modified;
        the transformation is recorded in the new dataset’s lineage.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-56">
          <label htmlFor="dv-name" className="mb-1 block text-xs font-medium text-muted">New dataset name</label>
          <Input id="dv-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="dv-filter" className="mb-1 block text-xs font-medium text-muted">Filter (optional)</label>
          <div className="flex gap-1">
            <Select id="dv-filter" value={filterVariable} onChange={(e) => setFilterVariable(e.target.value)}>
              <option value="">no filter</option>
              {variables.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
            </Select>
            <Select aria-label="Filter operator" value={filterOp} onChange={(e) => setFilterOp(e.target.value)}>
              {["eq", "ne", "lt", "lte", "gt", "gte", "contains"].map((o) => <option key={o}>{o}</option>)}
            </Select>
            <Input aria-label="Filter value" className="w-28" value={filterValue} onChange={(e) => setFilterValue(e.target.value)} />
          </div>
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted">Columns to keep ({keep.length}/{variables.length})</p>
        <div className="flex flex-wrap gap-2">
          {variables.map((v) => (
            <label key={v.name} className="flex items-center gap-1 rounded border border-line px-2 py-1 text-xs">
              <input
                type="checkbox"
                checked={keep.includes(v.name)}
                onChange={(e) => setKeep((k) => (e.target.checked ? [...k, v.name] : k.filter((x) => x !== v.name)))}
              />
              {v.name}
            </label>
          ))}
        </div>
      </div>
      <Button
        disabled={pending || !name.trim() || keep.length === 0}
        onClick={() =>
          startTransition(async () => {
            const res = await deriveDataset({
              datasetVersionId: versionId,
              name,
              filterVariable: filterVariable || null,
              filterOp,
              filterValue,
              keepVariables: keep,
            });
            setMessage(`Created derived dataset with ${res.rowCount} rows.`);
          })
        }
      >
        Create derived dataset
      </Button>
      {message && <p className="text-sm text-success">{message}</p>}
    </div>
  );
}
