import { analyticsHealth } from "@/lib/analytics-client";
import { appSql } from "@/lib/db";
import { assertHostedRuntimeConfiguration } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DatabaseReadiness = {
  ready: boolean;
  studiesReady: boolean;
  complete: boolean;
  commentsThreading: boolean;
  sectionComments: boolean;
  mediaAssets: boolean;
  recruitmentPages: boolean;
  importLifecycle: boolean;
  importCommitting: boolean;
};

async function databaseReadiness(): Promise<DatabaseReadiness> {
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
          select count(*) = 7
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'comments'
            and column_name in ('study_id', 'question_code', 'section_id', 'parent_id', 'status', 'resolved_by', 'resolved_at')
        ) as section_comments,
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
    const mediaAssets = Boolean(schema?.media_assets);
    const recruitmentPages = Boolean(schema?.recruitment_pages);
    const commentsThreading = Boolean(schema?.comments_threading);
    const sectionComments = Boolean(schema?.section_comments);
    const importLifecycle = Boolean(schema?.import_lifecycle);
    const importCommitting = Boolean(schema?.import_committing_status);
    const studiesReady = Boolean(mediaAssets && commentsThreading);
    const ready = Boolean(studiesReady && importLifecycle && importCommitting);
    const complete = Boolean(ready && sectionComments && recruitmentPages);
    return {
      ready,
      studiesReady,
      complete,
      commentsThreading,
      sectionComments,
      mediaAssets,
      recruitmentPages,
      importLifecycle,
      importCommitting,
    };
  } catch {
    return {
      ready: false,
      studiesReady: false,
      complete: false,
      commentsThreading: false,
      sectionComments: false,
      mediaAssets: false,
      recruitmentPages: false,
      importLifecycle: false,
      importCommitting: false,
    };
  }
}

export async function GET() {
  try {
    assertHostedRuntimeConfiguration();
  } catch {
    return Response.json(
      {
        status: "not_ready",
        database: {
          ready: false,
          studiesReady: false,
          complete: false,
          commentsThreading: false,
          sectionComments: false,
          mediaAssets: false,
          recruitmentPages: false,
          importLifecycle: false,
          importCommitting: false,
        },
        analytics: { ready: false },
        configuration: { ready: false },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const [database, analytics] = await Promise.all([
    databaseReadiness(),
    analyticsHealth(),
  ]);
  const ready = database.ready && analytics.ok;
  const status = ready ? (database.complete ? "ready" : "degraded") : "not_ready";
  return Response.json(
    {
      status,
      database,
      analytics: { ready: analytics.ok },
      configuration: { ready: true },
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
