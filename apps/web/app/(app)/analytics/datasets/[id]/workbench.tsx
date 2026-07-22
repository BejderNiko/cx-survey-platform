"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge, Button, Card, Input, Select, Table, Td, Th, cn } from "@/components/ui";
import { PlotlyChart } from "@/components/plotly-chart";
import type { AnalysisResultPayload } from "@/lib/analytics-client";
import { MEASURE, RUN_STATUS, VAR_TYPE, label } from "@/lib/labels";
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
 * Procedurekatalog: hurtigt lag til researchere/CX, avanceret lag til
 * analytikere. Feltspecifikationerne styrer parameterformularen.
 */
const PROCEDURES: {
  key: string; label: string; layer: "quick" | "advanced";
  fields: { param: string; label: string; kind: "variable" | "variables" | "choice" | "number" | "text"; options?: string[]; numericOnly?: boolean; optional?: boolean }[];
}[] = [
  { key: "nps", label: "NPS (med trend)", layer: "quick", fields: [
    { param: "variable", label: "NPS-variabel", kind: "variable", numericOnly: true },
    { param: "date_variable", label: "Datovariabel (til trend)", kind: "variable", optional: true },
    { param: "period", label: "Periode", kind: "choice", options: ["week", "month", "quarter"], optional: true },
  ]},
  { key: "csat", label: "CSAT", layer: "quick", fields: [{ param: "variable", label: "CSAT-variabel (1-5)", kind: "variable", numericOnly: true }] },
  { key: "ces", label: "CES", layer: "quick", fields: [{ param: "variable", label: "CES-variabel (1-7)", kind: "variable", numericOnly: true }] },
  { key: "frequencies", label: "Frekvenser", layer: "quick", fields: [{ param: "variable", label: "Variabel", kind: "variable" }] },
  { key: "descriptives", label: "Deskriptiv statistik", layer: "quick", fields: [
    { param: "variables", label: "Variabler", kind: "variables", numericOnly: true },
    { param: "weight", label: "Vægtvariabel", kind: "variable", numericOnly: true, optional: true },
  ]},
  { key: "missingness", label: "Oversigt over manglende data", layer: "quick", fields: [] },
  { key: "trend", label: "Trend og prognose", layer: "quick", fields: [
    { param: "date_variable", label: "Datovariabel", kind: "variable" },
    { param: "variable", label: "Mål (tom = antal rækker)", kind: "variable", numericOnly: true, optional: true },
    { param: "period", label: "Periode", kind: "choice", options: ["day", "week", "month"], optional: true },
  ]},
  { key: "crosstab", label: "Krydstabel + chi²-test", layer: "advanced", fields: [
    { param: "row", label: "Rækkevariabel", kind: "variable" },
    { param: "column", label: "Kolonnevariabel", kind: "variable" },
    { param: "percent", label: "Procenter", kind: "choice", options: ["row", "column", "total", "none"], optional: true },
  ]},
  { key: "correlation", label: "Korrelation (Pearson/Spearman)", layer: "advanced", fields: [
    { param: "variables", label: "Variabler", kind: "variables", numericOnly: true },
    { param: "method", label: "Metode", kind: "choice", options: ["pearson", "spearman"], optional: true },
  ]},
  { key: "ttest_ind", label: "Uafhængig t-test", layer: "advanced", fields: [
    { param: "variable", label: "Testvariabel", kind: "variable", numericOnly: true },
    { param: "group", label: "Gruppevariabel (2 niveauer)", kind: "variable" },
  ]},
  { key: "ttest_rel", label: "Parret t-test", layer: "advanced", fields: [
    { param: "variable1", label: "Variabel 1", kind: "variable", numericOnly: true },
    { param: "variable2", label: "Variabel 2", kind: "variable", numericOnly: true },
  ]},
  { key: "anova", label: "Envejs-ANOVA + Tukey", layer: "advanced", fields: [
    { param: "variable", label: "Testvariabel", kind: "variable", numericOnly: true },
    { param: "group", label: "Gruppevariabel", kind: "variable" },
  ]},
  { key: "mannwhitney", label: "Mann-Whitney U", layer: "advanced", fields: [
    { param: "variable", label: "Testvariabel", kind: "variable", numericOnly: true },
    { param: "group", label: "Gruppevariabel (2 niveauer)", kind: "variable" },
  ]},
  { key: "kruskal", label: "Kruskal-Wallis", layer: "advanced", fields: [
    { param: "variable", label: "Testvariabel", kind: "variable", numericOnly: true },
    { param: "group", label: "Gruppevariabel", kind: "variable" },
  ]},
  { key: "wilcoxon", label: "Wilcoxon signed-rank", layer: "advanced", fields: [
    { param: "variable1", label: "Variabel 1", kind: "variable", numericOnly: true },
    { param: "variable2", label: "Variabel 2", kind: "variable", numericOnly: true },
  ]},
  { key: "linear_regression", label: "Lineær regression (OLS)", layer: "advanced", fields: [
    { param: "dependent", label: "Afhængig variabel", kind: "variable", numericOnly: true },
    { param: "predictors", label: "Prædiktorer", kind: "variables" },
  ]},
  { key: "logistic_regression", label: "Binær logistisk regression", layer: "advanced", fields: [
    { param: "dependent", label: "Binært udfald (0/1)", kind: "variable", numericOnly: true },
    { param: "predictors", label: "Prædiktorer", kind: "variables" },
  ]},
  { key: "cronbach_alpha", label: "Reliabilitet (Cronbachs alfa)", layer: "advanced", fields: [
    { param: "variables", label: "Skalaelementer", kind: "variables", numericOnly: true },
  ]},
  { key: "bootstrap", label: "Bootstrap-konfidensinterval", layer: "advanced", fields: [
    { param: "variable", label: "Variabel", kind: "variable", numericOnly: true },
    { param: "statistic", label: "Statistik", kind: "choice", options: ["mean", "median", "std"], optional: true },
    { param: "n_boot", label: "Genudtræk", kind: "number", optional: true },
  ]},
  { key: "kmeans", label: "K-means-segmentering", layer: "advanced", fields: [
    { param: "variables", label: "Variabler", kind: "variables", numericOnly: true },
    { param: "k", label: "Klynger (k)", kind: "number" },
  ]},
  { key: "factor", label: "Faktoranalyse (EFA)", layer: "advanced", fields: [
    { param: "variables", label: "Elementer", kind: "variables", numericOnly: true },
    { param: "n_factors", label: "Faktorer", kind: "number" },
  ]},
];

export function Workbench({
  versionId, versionNumber, rowCount, variables, previewRows, recipes, runs,
  canRun, canDerive, canExport,
}: {
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
        title={`Arbejdsområde — v${versionNumber} (${rowCount} rækker)`}
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
                {t === "analyze" ? "Analysér" : t === "data" ? "Data" : t === "variables" ? "Variabler" : "Afled datasæt"}
              </button>
            )
          ))}
        </div>

        {tab === "data" && (
          <div className="max-h-96 overflow-auto rounded-lg border border-line">
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
              <p className="px-3 py-2 text-xs text-muted">Viser de første {previewRows.length} af {rowCount} rækker (alle data findes i eksporterne).</p>
            )}
          </div>
        )}

        {tab === "variables" && (
          <Table>
            <thead>
              <tr><Th>Navn</Th><Th>Label</Th><Th>Type</Th><Th>Måleniveau</Th><Th>Værdilabels</Th><Th>Regler for manglende</Th></tr>
            </thead>
            <tbody>
              {variables.map((v) => (
                <tr key={v.name}>
                  <Td className="font-mono text-xs">{v.name}</Td>
                  <Td>{v.label}</Td>
                  <Td><Badge>{label(VAR_TYPE, v.varType)}</Badge></Td>
                  <Td><Badge tone="blue">{label(MEASURE, v.measure)}</Badge></Td>
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
                <label className="mb-1 block text-xs font-medium text-muted">Niveau</label>
                <div className="flex rounded-full border border-line overflow-hidden">
                  {(["quick", "advanced"] as const).map((l) => (
                    <button key={l}
                      className={cn("px-3 py-1.5 text-sm cursor-pointer", layer === l ? "bg-accent text-white" : "bg-surface text-muted")}
                      onClick={() => { setLayer(l); if (l === "quick" && proc.layer === "advanced") setProcKey("nps"); }}>
                      {l === "quick" ? "Hurtig analyse" : "Avanceret"}
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
                    {f.label}{f.optional ? " (valgfri)" : ""}
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
                      className="min-w-44 rounded-lg border border-line bg-surface px-2 py-1 text-sm"
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
                  <label htmlFor="wb-seed" className="mb-1 block text-xs font-medium text-muted">Seed (valgfri)</label>
                  <Input id="wb-seed" type="number" className="w-28" value={seed} onChange={(e) => setSeed(e.target.value)} />
                </div>
              )}
              <div>
                <label htmlFor="wb-recipe" className="mb-1 block text-xs font-medium text-muted">Gem som opskrift (valgfri)</label>
                <Input id="wb-recipe" className="w-48" placeholder="opskriftens navn" value={recipeName} onChange={(e) => setRecipeName(e.target.value)} />
              </div>
              <Button onClick={execute} disabled={pending}>{pending ? "Kører…" : "Kør analyse"}</Button>
            </div>

            {error && <p role="alert" className="rounded-lg border border-danger/30 bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
            {result && <ResultView result={result} />}
          </div>
        )}

        {tab === "derive" && canDerive && (
          <DeriveForm versionId={versionId} variables={variables} />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Gemte opskrifter (reproducerbare)">
          {recipes.length === 0 ? (
            <p className="text-sm text-muted">Gem en kørsel som opskrift for at kunne gentage den på enhver version af datasættet.</p>
          ) : (
            <ul className="space-y-1.5">
              {recipes.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <span className="font-medium">{r.name}</span>
                  <Badge>{r.procedure}</Badge>
                  <code className="text-xs text-muted">{r.params}</code>
                  <span className="text-xs text-muted">af {r.author}</span>
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
                      Kør igen på v{versionNumber}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Kørselshistorik (dette datasæt)">
          <ul className="space-y-1.5 text-sm">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-1.5">
                <Badge tone={r.status === "succeeded" ? "green" : r.status === "failed" ? "red" : "amber"}>{label(RUN_STATUS, r.status)}</Badge>
                <code className="text-xs">{r.procedure}</code>
                <span className="text-xs text-muted">{r.version} · {r.author} · {r.startedAt}{r.seed !== null ? ` · seed ${r.seed}` : ""}</span>
                {r.error && <span className="text-xs text-danger">{r.error}</span>}
                {r.results !== null && (
                  <Button size="sm" variant="ghost" className="ml-auto"
                    onClick={() => { setResult(r.results as AnalysisResultPayload); setTab("analyze"); }}>
                    Vis
                  </Button>
                )}
              </li>
            ))}
            {runs.length === 0 && <li className="text-muted">Ingen kørsler endnu.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}

function ResultView({ result }: { result: AnalysisResultPayload }) {
  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface-raised p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge tone="accent">{result.procedure}</Badge>
        <span>{result.method}</span>
        <span>· n anvendt {result.n_used} / {result.n_total} ({result.n_excluded} udeladt)</span>
        {result.seed !== null && <span>· seed {result.seed}</span>}
      </div>
      <p className="text-xs text-muted">Manglende data: {result.missing_strategy}</p>
      {result.assumptions.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-muted">
          {result.assumptions.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      )}
      {result.warnings.length > 0 && (
        <ul className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
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
        <p className="border-t border-line pt-2 text-xs text-muted"><strong>Sådan læses resultatet:</strong> {result.interpretation}</p>
      )}
      <p className="text-[11px] text-muted">
        Biblioteker: {Object.entries(result.library_versions).map(([k, v]) => `${k} ${v}`).join(" · ")}
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
        Opretter et nyt afledt datasæt (filtrerede rækker og/eller udvalgte kolonner). Kildeversionen
        ændres aldrig; transformationen registreres i det nye datasæts afstamning.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-56">
          <label htmlFor="dv-name" className="mb-1 block text-xs font-medium text-muted">Navn på nyt datasæt</label>
          <Input id="dv-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="dv-filter" className="mb-1 block text-xs font-medium text-muted">Filter (valgfrit)</label>
          <div className="flex gap-1">
            <Select id="dv-filter" value={filterVariable} onChange={(e) => setFilterVariable(e.target.value)}>
              <option value="">intet filter</option>
              {variables.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
            </Select>
            <Select aria-label="Filteroperator" value={filterOp} onChange={(e) => setFilterOp(e.target.value)}>
              {["eq", "ne", "lt", "lte", "gt", "gte", "contains"].map((o) => <option key={o}>{o}</option>)}
            </Select>
            <Input aria-label="Filterværdi" className="w-28" value={filterValue} onChange={(e) => setFilterValue(e.target.value)} />
          </div>
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted">Kolonner, der beholdes ({keep.length}/{variables.length})</p>
        <div className="flex flex-wrap gap-2">
          {variables.map((v) => (
            <label key={v.name} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs">
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
            setMessage(`Afledt datasæt oprettet med ${res.rowCount} rækker.`);
          })
        }
      >
        Opret afledt datasæt
      </Button>
      {message && <p className="text-sm text-success">{message}</p>}
    </div>
  );
}
