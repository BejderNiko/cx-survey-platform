import { can } from "@ok/domain";
import { Badge, Card } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { serializeResultFilters, type ResultFilter } from "@/lib/results-filters";
import { ReportJobButtons } from "./report-jobs-client";

export async function ReportJobs({ studyId, filters }: { studyId: string; filters: ResultFilter[] }) {
  const session = await requireSession();
  if (!can(session.role, "reports.create")) return null;
  const jobs = await withUser(
    session.userId,
    session.orgId,
    (tx) => tx`select id, format, status, input_snapshot, error_code, output_sha256, output_byte_size, artifact_release_status, created_at from report_jobs where study_id = ${studyId} and org_id = ${session.orgId} order by created_at desc limit 20`,
  ).catch((error) => {
    if (!(error && typeof error === "object" && "code" in error && error.code === "42P01")) throw error;
    return null;
  });

  if (!jobs) {
    return <Card title="Rapport-eksport"><p className="text-sm">Migration 20260812000013 er ikke anvendt. Rapportjob-flow er derfor låst.</p></Card>;
  }

  return (
    <Card title="Rapport-eksport">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm">Jobs fastfryser instrumentversion, filtre, kilder, strukturerede indsigter og både total/filtreret base.</p>
          <p className="mt-1 text-xs text-amber-800">
            Templateblokering: CX-template på \\ok.dk er ikke læsbar. Automatisk queue-worker bygger et strukturelt DRAFT_UNBRANDED-artefakt med checksum og lineage; det er ikke releaseklart eller template-verificeret før render og visuel QA.
          </p>
        </div>
        <ReportJobButtons studyId={studyId} filters={serializeResultFilters(filters)} manualWorkerEnabled={process.env.VERCEL_ENV !== "production" && !(process.env.NODE_ENV === "production" && !process.env.VERCEL)} />
      </div>
      <ul className="mt-3 space-y-1 text-xs">
        {jobs.map((job) => (
          <li key={job.id}>
            <Badge>{String(job.status)}</Badge> {String(job.format).toUpperCase()} · {fmtDateTime(job.created_at)} · filtreret base {String((job.input_snapshot as Record<string, unknown>).filteredResponseBase ?? "—")} / {String((job.input_snapshot as Record<string, unknown>).responseBaseBeforeFilters ?? "—")}{job.error_code ? ` · ${job.error_code}` : ""}{job.status === "succeeded" && <span className="ml-2"><a className="text-accent underline" href={`/api/report-jobs/${job.id}/download`}>Download draft</a> · {String(job.output_byte_size)} bytes · SHA-256 {String(job.output_sha256).slice(0, 12)}… · {String(job.artifact_release_status)}</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
