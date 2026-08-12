import "server-only";

import { createHash } from "node:crypto";
import { audit } from "@/lib/audit";
import { adminSql } from "@/lib/db";
import { createReportArtifact, type ReportSnapshot } from "@/lib/office-report";
import { deleteStimulusObject, putStimulusObject } from "@/lib/stimulus-storage";

export async function processNextReportJob(): Promise<{ processed: boolean; jobId?: string; status?: "succeeded" | "failed" }> {
  const claimed = await adminSql.begin(async (tx) => {
    const [job] = await tx`
      update report_jobs set status = 'running', started_at = now(), error_code = null, error_message = null
      where id = (select id from report_jobs where status = 'queued' order by created_at, id for update skip locked limit 1)
        and status = 'queued'
      returning id, org_id, study_id, requested_by, format, input_snapshot`;
    return job ?? null;
  });
  if (!claimed) return { processed: false };
  const jobId = String(claimed.id);
  let storageKey: string | null = null;
  try {
    const format = String(claimed.format) as "docx" | "pptx";
    const artifact = createReportArtifact(format, claimed.input_snapshot as ReportSnapshot);
    const sha256 = createHash("sha256").update(artifact).digest("hex");
    const contentType = format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    storageKey = `${claimed.org_id}/${claimed.study_id}/reports/${jobId}.${format}`;
    await putStimulusObject(storageKey, artifact, contentType);
    await adminSql.begin(async (tx) => {
      const [updated] = await tx`
        update report_jobs set status = 'succeeded', output_storage_key = ${storageKey}, output_sha256 = ${sha256},
          output_byte_size = ${artifact.byteLength}, output_content_type = ${contentType}, completed_at = now()
        where id = ${jobId} and org_id = ${claimed.org_id} and status = 'running' returning id`;
      if (!updated) throw new Error("Report job lost its running lease.");
      await audit(tx, { orgId: String(claimed.org_id), actorUserId: String(claimed.requested_by), action: "report_job.succeed", entityType: "report_job", entityId: jobId, details: { sha256, byteSize: artifact.byteLength, releaseStatus: "draft_unbranded", templateVerified: false, worker: "queue" } });
    });
    return { processed: true, jobId, status: "succeeded" };
  } catch (error) {
    if (storageKey) await deleteStimulusObject(storageKey).catch(() => undefined);
    const message = error instanceof Error ? error.message.slice(0, 500) : "Rapportjob fejlede.";
    await adminSql`update report_jobs set status = 'failed', error_code = 'GENERATION_FAILED', error_message = ${message}, completed_at = now() where id = ${jobId} and status = 'running'`;
    return { processed: true, jobId, status: "failed" };
  }
}