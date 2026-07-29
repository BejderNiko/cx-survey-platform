import { analyticsHealth } from "@/lib/analytics-client";
import { appSql } from "@/lib/db";
import { assertHostedRuntimeConfiguration } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function databaseReady(): Promise<boolean> {
  try {
    await appSql`select 1 as ready`;
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    assertHostedRuntimeConfiguration();
  } catch {
    return Response.json(
      {
        status: "not_ready",
        database: { ready: false },
        analytics: { ready: false },
        configuration: { ready: false },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const [database, analytics] = await Promise.all([
    databaseReady(),
    analyticsHealth(),
  ]);
  const ready = database && analytics.ok;
  return Response.json(
    {
      status: ready ? "ready" : "not_ready",
      database: { ready: database },
      analytics: { ready: analytics.ok },
      configuration: { ready: true },
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
