"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button, Card, Select, cn } from "@/components/ui";
import type { DatasetPayload } from "@/lib/analytics-client";
import { loadRDataset } from "./actions";

type AvailableDataset = {
  id: string;
  name: string;
  versionId: string | null;
  versionNumber: number | null;
  rowCount: number | null;
};
type RDataset = { datasetId: string; versionNumber: number; rowCount: number; payload: DatasetPayload };
type ROutput = { type: string; data: unknown };
type RCapture = { output: ROutput[]; images: ImageBitmap[] };
type RShelter = {
  captureR: (code: string, options?: Record<string, unknown>) => Promise<RCapture>;
  purge: () => Promise<void>;
};
type RSession = {
  init: () => Promise<void>;
  evalRVoid: (code: string) => Promise<void>;
  FS: { writeFile: (path: string, data: Uint8Array) => Promise<void> };
  Shelter: new () => Promise<RShelter>;
};
type RModule = { WebR: new (options?: Record<string, unknown>) => RSession };

// Pin runtime. Upgrade only after browser smoke of calculation and plot.
const WEBR_URL = "https://webr.r-wasm.org/v0.4.2/webr.mjs";
const WEBR_TIMEOUT_MS = 20_000;
const INITIAL_CODE = `# survey_data contains selected dataset
summary(survey_data)

numeric_columns <- vapply(survey_data, is.numeric, logical(1))
if (any(numeric_columns)) {
  first_numeric <- names(numeric_columns)[which(numeric_columns)[1]]
  hist(survey_data[[first_numeric]], main = paste("Distribution:", first_numeric), xlab = first_numeric)
}`;

function loadWebR(): Promise<RModule> {
  // Runtime stays outside Next bundle and loads only when user opens R.

  const dynamicImport = new Function("url", "return import(url)") as (url: string) => Promise<RModule>;
  return dynamicImport(WEBR_URL);
}

async function withWebRTimeout<T>(work: Promise<T>, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => { timeout = setTimeout(() => reject(new Error(message)), WEBR_TIMEOUT_MS); }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${raw.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

function datasetCsv(payload: DatasetPayload): string {
  const names = payload.variables.map((variable) => variable.name);
  const rows = payload.rows.map((row) => names.map((name) => csvValue(row[name])).join(","));
  return [names.map(csvValue).join(","), ...rows].join("\n");
}

function previewCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function outputText(output: ROutput): string {
  if (typeof output.data === "string") return output.data;
  if (output.type === "error") return "R error";
  if (output.type === "warning") return "R warning";
  return String(output.data ?? "");
}
function webRErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.includes("timed out")) return error.message;
  return fallback;
}


function RPlot({ image }: { image: ImageBitmap }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context?.drawImage(image, 0, 0, image.width, image.height);
  }, [image]);
  return <canvas ref={canvasRef} className="h-auto max-w-full rounded-lg border border-line" aria-label="R plot output" />;
}

export function RWorkbench({ datasets, canRun }: { datasets: AvailableDataset[]; canRun: boolean }) {
  const [selectedVersionId, setSelectedVersionId] = useState(datasets.find((dataset) => dataset.versionId)?.versionId ?? "");
  const [dataset, setDataset] = useState<RDataset | null>(null);
  const [code, setCode] = useState(INITIAL_CODE);
  const [output, setOutput] = useState<string[]>([]);
  const [images, setImages] = useState<ImageBitmap[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "running" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const runtimeRef = useRef<RSession | null>(null);

  const selectedDataset = datasets.find((item) => item.versionId === selectedVersionId);

  async function ensureRuntime(): Promise<RSession> {
    if (runtimeRef.current) return runtimeRef.current;
    setStatus("loading");
    setMessage("Loading R runtime…");
    const webRModule = await withWebRTimeout(loadWebR(), "R runtime timed out while loading.");
    const runtime = new webRModule.WebR({ interactive: false });
    await withWebRTimeout(runtime.init(), "R runtime timed out while starting.");
    await withWebRTimeout(runtime.evalRVoid("webr::canvas_install(width=720, height=420, bg='white')"), "R graphics setup timed out.");
    runtimeRef.current = runtime;
    return runtime;
  }

  async function loadDataset() {
    if (!selectedVersionId) {
      setDataset(null);
      setMessage("Select a dataset version first.");
      return;
    }
    setStatus("loading");
    setMessage("Loading dataset into R workspace…");
    try {
      const nextDataset = await loadRDataset(selectedVersionId);
      if (nextDataset.rowCount === 0) {
        setDataset(null);
        setStatus("ready");
        setMessage("Selected dataset has no rows. Choose a dataset with responses before running R.");
        return;
      }
      const runtime = await ensureRuntime();
      await runtime.FS.writeFile("/home/web_user/survey_data.csv", new TextEncoder().encode(datasetCsv(nextDataset.payload)));
      await runtime.evalRVoid('survey_data <- read.csv("/home/web_user/survey_data.csv", stringsAsFactors = FALSE, check.names = FALSE)');
      setDataset(nextDataset);
      setStatus("ready");
      setMessage(`Loaded ${nextDataset.rowCount.toLocaleString("da-DK")} rows into survey_data.`);
    } catch (error) {
      setStatus("error");
      setMessage(webRErrorMessage(error, "Dataset could not be loaded into R."));
    }
  }

  async function execute() {
    if (!code.trim()) {
      setMessage("Enter R code first.");
      return;
    }
    setStatus("running");
    setMessage(null);
    setOutput([]);
    setImages([]);
    let shelter: RShelter | null = null;
    try {
      const runtime = await ensureRuntime();
      if (dataset) {
        await runtime.FS.writeFile("/home/web_user/survey_data.csv", new TextEncoder().encode(datasetCsv(dataset.payload)));
        await runtime.evalRVoid('survey_data <- read.csv("/home/web_user/survey_data.csv", stringsAsFactors = FALSE, check.names = FALSE)');
      } else {
        await runtime.evalRVoid("survey_data <- data.frame()");
      }
      shelter = await new runtime.Shelter();
      const capture = await withWebRTimeout(shelter.captureR(code, { captureGraphics: { width: 720, height: 420, bg: "white" } }), "R calculation timed out after 20 seconds.");
      setOutput(capture.output.map(outputText).filter(Boolean));
      setImages(capture.images);
      setStatus("ready");
      setMessage(`R completed${dataset ? ` on ${dataset.rowCount.toLocaleString("da-DK")} rows` : ""}.`);
    } catch (error) {
      setStatus("error");
      setMessage(webRErrorMessage(error, "R calculation failed. Check the R code and try again."));
    } finally {
      try {
        await shelter?.purge();
      } catch {}
    }
  }

  function handleCodeKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void execute();
    }
  }

  if (!canRun) {
    return <Card title="R workspace"><p className="text-sm text-muted">You need analytics run access to use the R workspace.</p></Card>;
  }

  return (
    <Card title="R workspace" actions={<span className="text-xs text-muted">WebR · browser runtime</span>}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
        <div>
          <p className="text-sm font-medium text-heading">Interactive R analysis</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">Write R on left. Run calculations and plots on right. Dataset remains versioned and read-only.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-muted">Dataset version
            <Select className="mt-1 min-w-56" value={selectedVersionId} onChange={(event) => { setSelectedVersionId(event.target.value); setDataset(null); setMessage(null); }}>
              <option value="">No dataset selected</option>
              {datasets.filter((item) => item.versionId).map((item) => <option key={item.versionId} value={item.versionId!}>{item.name} · v{item.versionNumber} · {item.rowCount?.toLocaleString("da-DK")} rows</option>)}
            </Select>
          </label>
          <Button variant="secondary" onClick={loadDataset} disabled={status === "loading" || status === "running" || !selectedVersionId}>{status === "loading" ? "Loading…" : "Load into R"}</Button>
        </div>
      </div>

      {selectedDataset && !dataset && <p className="mt-3 text-xs text-muted">Selected: {selectedDataset.name}. Load version before using survey_data.</p>}
      {dataset && <p className="mt-3 text-xs text-muted">Loaded: {dataset.rowCount.toLocaleString("da-DK")} rows · {dataset.payload.variables.length} variables · survey_data</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface-raised p-4" aria-label="GAI prompt guidelines">
          <h3 className="text-sm font-semibold text-heading">Prompt guidelines for GAI</h3>
          <p className="mt-1 text-xs leading-5 text-muted">Give GAI dataset name, column types, goal, filters, expected output and limits. Keep raw personal data out of prompts.</p>
          <div className="mt-3 space-y-2 text-xs">
            <p><code className="rounded bg-background px-1.5 py-0.5">summary(survey_data)</code> · inspect structure, missing values and ranges.</p>
            <p><code className="rounded bg-background px-1.5 py-0.5">table(survey_data$column)</code> · count categorical answers.</p>
            <p><code className="rounded bg-background px-1.5 py-0.5">hist(survey_data$column)</code> · show numeric distribution.</p>
            <p><code className="rounded bg-background px-1.5 py-0.5">plot(x, y)</code> · inspect relationship between two numeric variables.</p>
            <p><code className="rounded bg-background px-1.5 py-0.5">aggregate(...)</code> · compare groups with transparent denominators.</p>
          </div>
          <p className="mt-3 text-[11px] leading-4 text-muted">Useful prompt: Use survey_data. First inspect missing values and valid denominators. Then calculate [goal] and create [chart]. State assumptions and show code.</p>
        </section>
        {dataset ? (
          <section className="min-w-0 rounded-xl border border-line bg-surface-raised p-4" aria-label="Dataset preview">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><div><h3 className="text-sm font-semibold text-heading">Dataset preview</h3><p className="mt-1 text-xs text-muted">First 8 rows · first 8 variables · version {dataset.versionNumber}</p></div><span className="text-xs text-muted">{dataset.rowCount.toLocaleString("da-DK")} rows total</span></div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-max border-collapse text-xs">
                <thead><tr>{dataset.payload.variables.slice(0, 8).map((variable) => <th key={variable.name} className="border-b border-line bg-background px-2 py-2 text-left font-semibold text-muted">{variable.name}</th>)}</tr></thead>
                <tbody>{dataset.payload.rows.slice(0, 8).map((row, index) => <tr key={index}>{dataset.payload.variables.slice(0, 8).map((variable) => <td key={variable.name} className="max-w-48 border-b border-line/60 px-2 py-2 align-top">{previewCell(row[variable.name])}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-dashed border-line p-4" aria-label="Dataset preview empty"><h3 className="text-sm font-semibold text-heading">Dataset preview</h3><p className="mt-1 text-xs text-muted">Choose a dataset version and select Load into R to preview its rows here.</p></section>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="min-w-0" aria-label="R input">
          <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-heading">R input</h3><span className="text-xs text-muted">Ctrl/⌘ + Enter</span></div>
          <textarea value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={handleCodeKey} spellCheck={false} className="min-h-[360px] w-full resize-y rounded-xl border border-[#460019]/30 bg-[#2B1721] p-4 font-mono text-sm leading-6 text-[#FFF8F5] outline-none focus:border-accent" aria-label="R input" />
          <div className="mt-3 flex flex-wrap items-center gap-2"><Button onClick={() => void execute()} disabled={status === "loading" || status === "running"}>{status === "running" ? "Running…" : "Run R"}</Button><button type="button" className="text-xs text-muted underline" onClick={() => setCode(INITIAL_CODE)}>Reset code</button></div>
        </section>

        <section className="min-w-0" aria-label="R output">
          <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-heading">R output</h3>{status === "ready" && <span className="text-xs text-success">Ready</span>}</div>
          <div className={cn("min-h-[360px] rounded-xl border border-line bg-background p-4", output.length === 0 && images.length === 0 && "flex items-center justify-center")}>
            {output.length > 0 || images.length > 0 ? <div className="space-y-4">{output.length > 0 && <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5 text-foreground">{output.join("\n")}</pre>}{images.map((image, index) => <RPlot key={index} image={image} />)}</div> : <p className="text-center text-sm text-muted">Run R code to see calculations or plots here.</p>}
          </div>
          {message && <p role={status === "error" ? "alert" : "status"} className={cn("mt-2 text-xs", status === "error" ? "text-danger" : "text-muted")}>{message}</p>}
        </section>
      </div>
    </Card>
  );
}