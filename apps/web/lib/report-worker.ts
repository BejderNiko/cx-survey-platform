import "server-only";

import { createHash } from "node:crypto";
import { audit } from "@/lib/audit";
import { adminSql } from "@/lib/db";
import { createReportArtifact, type ReportSnapshot } from "@/lib/office-report";
import { deleteStimulusObject, putStimulusObject } from "@/lib/stimulus-storage";

export const REPORT_JOB_MAX_ATTEMPTS = 3;
export const REPORT_JOB_LEASE_MS = 120_000;

type WorkerStatus = "succeeded" | "failed" | "retrying" | "lease_lost";

export async function processNextReportJob(scopeOrgId?: string): Promise<{ processed: boolean; jobId?: string; status?: WorkerStatus }> {
  const scopedOrgId = scopeOrgId ?? null;
  const exhausted = await adminSql.begin(async (tx) => {
    const [job] = await tx`
      with stale as (
        select id from report_jobs
        where status = 'running' and lease_expires_at < now() and attempt_count >= ${REPORT_JOB_MAX_ATTEMPTS}
          and (${scopedOrgId}::uuid is null or org_id = ${scopedOrgId}::uuid)
        order by lease_expires_at, id
        for update skip locked
        limit 1
      )
      update report_jobs as job
      set status = 'failed', lease_expires_at = null, completed_at = now(),
          error_code = 'LEASE_EXHAUSTED', error_message = 'Worker lease expired after maximum attempts.',
          last_error = 'Worker lease expired after maximum attempts.'
      from stale where job.id = stale.id
      returning job.id, job.org_id, job.requested_by, job.attempt_count`;
    if (!job) return null;
    await audit(tx, { orgId: String(job.org_id), actorUserId: String(job.requested_by), action: "report_job.fail", entityType: "report_job", entityId: String(job.id), details: { attempt: Number(job.attempt_count), maxAttempts: REPORT_JOB_MAX_ATTEMPTS, errorCode: "LEASE_EXHAUSTED" } });
    return job;
  });
  if (exhausted) return { processed: true, jobId: String(exhausted.id), status: "failed" };
  const claimed = await adminSql.begin(async (tx) => {
    const [job] = await tx`
      with candidate as (
        select id from report_jobs
        where attempt_count < ${REPORT_JOB_MAX_ATTEMPTS}
          and (${scopedOrgId}::uuid is null or org_id = ${scopedOrgId}::uuid)
          and (status = 'queued' or (status = 'running' and lease_expires_at < now()))
        order by case when status = 'running' then 0 else 1 end, created_at, id
        for update skip locked
        limit 1
      )
      update report_jobs as job
      set status = 'running', started_at = coalesce(job.started_at, now()), completed_at = null,
          lease_expires_at = now() + ${REPORT_JOB_LEASE_MS} * interval '1 millisecond',
          attempt_count = job.attempt_count + 1, error_code = null, error_message = null
      from candidate
      where job.id = candidate.id
      returning job.id, job.org_id, job.study_id, job.requested_by, job.format,
                job.input_snapshot, job.attempt_count`;
    return job ?? null;
  });
  if (!claimed) return { processed: false };

  const jobId = String(claimed.id);
  const orgId = String(claimed.org_id);
  const attempt = Number(claimed.attempt_count);
  let storageKey: string | null = null;
  try {
    const format = String(claimed.format) as "docx" | "pptx";
    const artifact = createReportArtifact(format, claimed.input_snapshot as ReportSnapshot);
    if (!(await renewLease(jobId, orgId, attempt))) throw new Error("Report job lost its running lease.");
    const sha256 = createHash("sha256").update(artifact).digest("hex");
    const contentType = format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    storageKey = `${orgId}/${claimed.study_id}/reports/${jobId}/attempt-${attempt}.${format}`;
    await putStimulusObject(storageKey, artifact, contentType);
    if (!(await renewLease(jobId, orgId, attempt))) throw new Error("Report job lost its running lease.");

    const succeeded = await adminSql.begin(async (tx) => {
      const [updated] = await tx`
        update report_jobs set status = 'succeeded', output_storage_key = ${storageKey}, output_sha256 = ${sha256},
          output_byte_size = ${artifact.byteLength}, output_content_type = ${contentType}, completed_at = now(), lease_expires_at = null
        where id = ${jobId} and org_id = ${orgId} and status = 'running'
          and attempt_count = ${attempt} and lease_expires_at > now()
        returning id`;
      if (!updated) return false;
      await audit(tx, { orgId, actorUserId: String(claimed.requested_by), action: "report_job.succeed", entityType: "report_job", entityId: jobId, details: { sha256, byteSize: artifact.byteLength, releaseStatus: "draft_unbranded", templateVerified: false, worker: "queue", attempt } });
      return true;
    });
    if (!succeeded) throw new Error("Report job lost its running lease.");
    return { processed: true, jobId, status: "succeeded" };
  } catch (error) {
    if (storageKey) await deleteStimulusObject(storageKey).catch(() => undefined);
    const message = error instanceof Error ? error.message.slice(0, 500) : "Rapportjob fejlede.";
    const retry = attempt < REPORT_JOB_MAX_ATTEMPTS;
    const updated = await adminSql.begin(async (tx) => {
      const [job] = await tx`
        update report_jobs
        set status = ${retry ? "queued" : "failed"}::report_job_status,
            error_code = 'GENERATION_FAILED', error_message = ${message}, last_error = ${message},
            lease_expires_at = null, completed_at = ${retry ? null : new Date()}
        where id = ${jobId} and org_id = ${orgId} and status = 'running' and attempt_count = ${attempt}
        returning id`;
      if (!job) return false;
      await audit(tx, { orgId, actorUserId: String(claimed.requested_by), action: retry ? "report_job.retry" : "report_job.fail", entityType: "report_job", entityId: jobId, details: { attempt, maxAttempts: REPORT_JOB_MAX_ATTEMPTS, errorCode: "GENERATION_FAILED" } });
      return true;
    });
    return { processed: true, jobId, status: updated ? (retry ? "retrying" : "failed") : "lease_lost" };
  }
}

async function renewLease(jobId: string, orgId: string, attempt: number): Promise<boolean> {
  const [updated] = await adminSql`
    update report_jobs
    set lease_expires_at = now() + ${REPORT_JOB_LEASE_MS} * interval '1 millisecond'
    where id = ${jobId} and org_id = ${orgId} and status = 'running'
      and attempt_count = ${attempt} and lease_expires_at > now()
    returning id`;
  return Boolean(updated);
}
