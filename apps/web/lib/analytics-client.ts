import "server-only";
import { env } from "./env";

/** Typed client for the Python analytics service (apps/analytics). */

export interface VariablePayload {
  name: string;
  label: string;
  var_type: string;
  measure: string;
  value_labels: Record<string, string>;
  missing_values: unknown[];
}

export interface DatasetPayload {
  variables: VariablePayload[];
  rows: Record<string, unknown>[];
}

export interface AnalysisTable {
  title: string;
  columns: string[];
  rows: unknown[][];
}

export interface AnalysisResultPayload {
  procedure: string;
  method: string;
  library_versions: Record<string, string>;
  n_total: number;
  n_used: number;
  n_excluded: number;
  missing_strategy: string;
  assumptions: string[];
  warnings: string[];
  tables: AnalysisTable[];
  chart: { data: unknown[]; layout: Record<string, unknown> } | null;
  interpretation: string;
  seed: number | null;
}

export class AnalyticsServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "AnalyticsServiceError";
  }
}

async function call(path: string, init: RequestInit): Promise<Response> {
  let res: Response;
  const headers = new Headers(init.headers);
  if (env.analyticsApiSecret) headers.set("Authorization", `Bearer ${env.analyticsApiSecret}`);
  try {
    res = await fetch(`${env.analyticsUrl}${path}`, { ...init, headers });
  } catch {
    throw new AnalyticsServiceError(
      "The analytics service is not reachable. Start it with: cd apps/analytics && uv run uvicorn ok_analytics.main:app --port 8000",
      503,
    );
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch { /* keep statusText */ }
    throw new AnalyticsServiceError(String(detail), res.status);
  }
  return res;
}

export async function runAnalysisRemote(input: {
  procedure: string;
  params: Record<string, unknown>;
  seed?: number | null;
  dataset: DatasetPayload;
}): Promise<AnalysisResultPayload> {
  const res = await call("/analyses/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
}

export async function exportDatasetRemote(
  format: string,
  dataset: DatasetPayload,
  filename: string,
): Promise<{ bytes: ArrayBuffer; contentType: string; disposition: string }> {
  const res = await call("/exports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format, dataset, filename }),
  });
  return {
    bytes: await res.arrayBuffer(),
    contentType: res.headers.get("Content-Type") ?? "application/octet-stream",
    disposition: res.headers.get("Content-Disposition") ?? `attachment; filename="${filename}.${format}"`,
  };
}

export async function analyticsHealth(): Promise<{ ok: boolean; procedures: string[]; versions: Record<string, string> }> {
  try {
    const res = await call("/health/details", { method: "GET" });
    const body = await res.json();
    return { ok: true, procedures: body.procedures ?? [], versions: body.library_versions ?? {} };
  } catch {
    return { ok: false, procedures: [], versions: {} };
  }
}
