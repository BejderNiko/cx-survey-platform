import { analyticsHealth } from "@/lib/analytics-client";
import { appSql } from "@/lib/db";
import { assertHostedRuntimeConfiguration } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function databaseReady(): Promise<boolean> {
  try {
    const [schema] = await appSql`
      select
        to_regclass('public.media_assets') is not null as media_assets,
        to_regclass('public.recruitment_pages') is not null as recruitment_pages,
        (
          select count(*) = 6
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'comments'
            and column_name in ('study_id', 'question_code', 'parent_id', 'status', 'resolved_by', 'resolved_at')
        ) as comments_threading,
        (
          select count(*) = 3
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'import_batches'
            and column_name in ('commit_started_at', 'failed_at', 'failure_message')
        ) as import_lifecycle,
        exists (
          select 1
          from pg_type t
          join pg_enum e on e.enumtypid = t.oid
          where t.typname = 'import_status' and e.enumlabel = 'committing'
        ) as import_committing_status
    `;
    return Boolean(
      schema?.media_assets &&
      schema?.recruitment_pages &&
      schema?.comments_threading &&
      schema?.import_lifecycle &&
      schema?.import_committing_status,
    );
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
