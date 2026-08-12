"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { withAuthorized } from "@/lib/auth";
import { parseResultFilters } from "@/lib/results-filters";

const TEMPLATE_REFERENCE = String.raw`\\ok.dk\data\CX_og_Market_Insights\Brugerundersøgelser\Skabelon til afrapporteringer CX & Market Insights.pdf`;

export async function requestReportJob(input: { studyId: string; format: "docx" | "pptx"; filters?: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!new Set(["docx", "pptx"]).has(input.format)) return { ok: false, error: "Ugyldigt rapportformat." };
  const filters = parseResultFilters(input.filters);
  try {
    const id = await withAuthorized("reports.create", async (tx, session) => {
      const [study] = await tx`select id, title from studies where id = ${input.studyId} and org_id = ${session.orgId}`;
      if (!study) throw new Error("Studiet blev ikke fundet.");
      const [version] = await tx`select id, version_number from study_versions where study_id = ${input.studyId} and org_id = ${session.orgId} order by version_number desc limit 1`;
      if (!version) throw new Error("Publicér studiet før rapportbestilling.");
      const [base] = await tx`select count(*)::int as count from responses where study_id = ${input.studyId} and org_id = ${session.orgId} and status = 'completed'`;
      const snapshot = { studyTitle: study.title, studyVersion: Number(version.version_number), responseBaseBeforeFilters: Number(base.count), filters, sources: ["responses", "response_answers", "interaction_events"], requestedAt: new Date().toISOString() };
      const [job] = await tx`
        insert into report_jobs (org_id, study_id, study_version_id, requested_by, format, status, input_snapshot, template_reference)
        values (${session.orgId}, ${input.studyId}, ${version.id}, ${session.userId}, ${input.format}::report_format, 'queued', ${tx.json(snapshot as never)}, ${TEMPLATE_REFERENCE}) returning id`;
      await audit(tx, { orgId: session.orgId, actorUserId: session.userId, action: "report_job.create", entityType: "report_job", entityId: String(job.id), details: { studyId: input.studyId, format: input.format, filterCount: filters.length, templateReadable: false } });
      return String(job.id);
    });
    revalidatePath(`/studies/${input.studyId}/results`);
    return { ok: true, id };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return { ok: false, error: "Migration 20260812000013 er ikke anvendt." };
    return { ok: false, error: error instanceof Error ? error.message : "Rapportjob kunne ikke oprettes." };
  }
}
