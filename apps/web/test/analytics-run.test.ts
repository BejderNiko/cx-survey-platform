/**
 * F5-006: the analytics call must not sit inside a DB transaction and must be
 * bounded by a timeout, and the durable `analysis_runs` row must survive
 * independently of the finalize step.
 *
 * The full `runAnalysis` server action needs Next's request scope (cookies),
 * so it is not directly invokable here. Instead this covers the two mechanisms
 * the fix relies on:
 *   (a) analytics-client: success, service error, and timeout → typed errors;
 *   (b) the durable-row + org-scoped finalize SQL sequence the action now uses,
 *       exercised directly against the local database.
 *
 * Requires: scripts/dev-db.sh init && pnpm seed.
 */
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { adminDb } from "./helpers/db";

const admin = adminDb();

// ---------------------------------------------------------------------------
// (a) analytics-client behavior against a real local HTTP server
// ---------------------------------------------------------------------------
describe("analytics client (F5-006 timeout + errors)", () => {
  let server: Server;
  let mode: "ok" | "error" | "slow" = "ok";

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (mode === "slow") return; // never respond → force client timeout
      if (mode === "error") {
        res.writeHead(422, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ detail: "Unknown procedure 'bogus'." }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        procedure: "nps", method: "test", library_versions: { pandas: "x" },
        n_total: 3, n_used: 3, n_excluded: 0, missing_strategy: "none",
        assumptions: [], warnings: [], tables: [], chart: null, interpretation: "", seed: null,
      }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    process.env.ANALYTICS_URL = `http://127.0.0.1:${port}`;
    process.env.ANALYTICS_TIMEOUT_MS = "200";
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    delete process.env.ANALYTICS_URL;
    delete process.env.ANALYTICS_TIMEOUT_MS;
  });

  async function client() {
    return import("@/lib/analytics-client");
  }

  it("returns a parsed result on success", async () => {
    mode = "ok";
    const { runAnalysisRemote } = await client();
    const result = await runAnalysisRemote({ procedure: "nps", params: {}, dataset: { variables: [], rows: [] } });
    expect(result.procedure).toBe("nps");
  });

  it("maps a service error to a typed AnalyticsServiceError", async () => {
    mode = "error";
    const { runAnalysisRemote, AnalyticsServiceError } = await client();
    await expect(
      runAnalysisRemote({ procedure: "bogus", params: {}, dataset: { variables: [], rows: [] } }),
    ).rejects.toBeInstanceOf(AnalyticsServiceError);
  });

  it("times out a hung service with a 504 AnalyticsServiceError", async () => {
    mode = "slow";
    const { runAnalysisRemote, AnalyticsServiceError } = await client();
    try {
      await runAnalysisRemote({ procedure: "nps", params: {}, dataset: { variables: [], rows: [] } });
      throw new Error("expected a timeout");
    } catch (e) {
      expect(e).toBeInstanceOf(AnalyticsServiceError);
      expect((e as { status: number }).status).toBe(504);
    }
  });
});

// ---------------------------------------------------------------------------
// (b) durable running-row + org-scoped finalize (the action's SQL sequence)
// ---------------------------------------------------------------------------
describe("durable analysis_runs row (F5-006 sequencing)", () => {
  let orgA: string, orgB: string, userA: string, dvId: string, runId: string;

  beforeAll(async () => {
    const [a] = await admin`select id from organizations where slug = 'ok-cx'`;
    const [b] = await admin`select id from organizations where slug = 'nordvind-demo'`;
    orgA = a.id as string; orgB = b.id as string;
    const [u] = await admin`select id from users where email = 'owner@example.invalid'`;
    userA = u.id as string;
    const [dv] = await admin`
      select dv.id from dataset_versions dv join datasets d on d.id = dv.dataset_id
      where d.org_id = ${orgA} limit 1`;
    dvId = dv.id as string;
  });

  afterEach(async () => {
    if (runId) await admin`delete from analysis_runs where id = ${runId}`;
  });

  it("commits a 'running' row that exists before any finalize", async () => {
    // Step 1 equivalent: durable running row.
    const [run] = await admin`
      insert into analysis_runs (org_id, dataset_version_id, procedure, params, status, created_by)
      values (${orgA}, ${dvId}, 'nps', '{}'::jsonb, 'running', ${userA}) returning id`;
    runId = run.id as string;
    const [check] = await admin`select status from analysis_runs where id = ${runId}`;
    expect(check.status).toBe("running"); // survives independently of finalize
  });

  it("org-scoped finalize updates the owning tenant's run", async () => {
    const [run] = await admin`
      insert into analysis_runs (org_id, dataset_version_id, procedure, params, status, created_by)
      values (${orgA}, ${dvId}, 'nps', '{}'::jsonb, 'running', ${userA}) returning id`;
    runId = run.id as string;
    const updated = await admin`
      update analysis_runs set status = 'succeeded', finished_at = now()
      where id = ${runId} and org_id = ${orgA} returning id`;
    expect(updated).toHaveLength(1);
  });

  it("a finalize scoped to another org cannot touch this run", async () => {
    const [run] = await admin`
      insert into analysis_runs (org_id, dataset_version_id, procedure, params, status, created_by)
      values (${orgA}, ${dvId}, 'nps', '{}'::jsonb, 'running', ${userA}) returning id`;
    runId = run.id as string;
    // Same id, wrong org (as would happen if a cross-tenant finalize were attempted).
    const updated = await admin`
      update analysis_runs set status = 'failed'
      where id = ${runId} and org_id = ${orgB} returning id`;
    expect(updated).toHaveLength(0);
    const [still] = await admin`select status from analysis_runs where id = ${runId}`;
    expect(still.status).toBe("running");
  });

  afterAll(async () => {
    await admin.end();
  });
});
