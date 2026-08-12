"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { allQuestions, computeNps, instrumentDefinition, lt } from "@ok/domain";
import { audit } from "@/lib/audit";
import { withAuthorized } from "@/lib/auth";
import type { ReportSnapshot } from "@/lib/office-report";
import { buildPrototypePaths, type PrototypeInteractionRow } from "@/lib/prototype-results";
import { loadLatestResultData } from "@/lib/results-data";
import { filterResponses, parseResultFilters, RESULT_RESPONSE_LIMIT, type FilterableResponse } from "@/lib/results-filters";
import { deleteStimulusObject, putStimulusObject } from "@/lib/stimulus-storage";

const TEMPLATE_REFERENCE = String.raw`\\ok.dk\data\CX_og_Market_Insights\Brugerundersøgelser\Skabelon til afrapporteringer CX & Market Insights.pdf`;

export async function requestReportJob(input: { studyId: string; format: "docx" | "pptx"; filters?: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!new Set(["docx", "pptx"]).has(input.format)) return { ok: false, error: "Ugyldigt rapportformat." };
  const filters = parseResultFilters(input.filters);
  try {
    const id = await withAuthorized("reports.create", async (tx, session) => {
      const data = await loadLatestResultData(tx, session.orgId, input.studyId);
      if (!data) throw new Error("Studiet blev ikke fundet.");
      if (!data.version) throw new Error("Publicér studiet før rapportbestilling.");
      const parsed = instrumentDefinition.safeParse(data.version.definition);
      if (!parsed.success) throw new Error("Publiceret instrument er ugyldigt.");
      const rows = buildRows(data, parsed.data);
      const filtered = filterResponses(rows, filters);
      const snapshot: ReportSnapshot & Record<string, unknown> = {
        studyTitle: String(data.study.title),
        studyVersion: Number(data.version.version_number),
        responseBaseBeforeFilters: rows.length,
        filteredResponseBase: filtered.length,
        filters,
        sources: ["study_versions.definition", "responses", "response_answers", "interaction_events", "panelists", "panelist_tags"],
        requestedAt: new Date().toISOString(),
        populationRule: { versionId: String(data.version.id), order: "started_at desc, id desc", limit: RESULT_RESPONSE_LIMIT },
        insights: allQuestions(parsed.data).map((question) => {
          const values = filtered.flatMap((row) => row.answers[question.code] === undefined ? [] : [row.answers[question.code]]);
          return { code: question.code, label: lt(question.label, parsed.data.defaultLanguage) || question.code, type: question.type, validBase: values.length, summary: summarize(question.type, values) };
        }),
        releaseStatus: "draft_unbranded",
        templateVerified: false,
      };
      const [job] = await tx`
        insert into report_jobs (org_id, study_id, study_version_id, requested_by, format, status, input_snapshot, template_reference, artifact_release_status)
        values (${session.orgId}, ${input.studyId}, ${data.version.id}, ${session.userId}, ${input.format}::report_format, 'queued', ${tx.json(snapshot as never)}, ${TEMPLATE_REFERENCE}, 'draft_unbranded') returning id`;
      await audit(tx, { orgId: session.orgId, actorUserId: session.userId, action: "report_job.create", entityType: "report_job", entityId: String(job.id), details: { studyId: input.studyId, format: input.format, filterCount: filters.length, filteredBase: filtered.length, templateReadable: false } });
      return String(job.id);
    });
    revalidatePath(`/studies/${input.studyId}/results`);
    return { ok: true, id };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return { ok: false, error: "Migration 20260812000013 er ikke anvendt." };
    return { ok: false, error: error instanceof Error ? error.message : "Rapportjob kunne ikke oprettes." };
  }
}

function buildRows(data: NonNullable<Awaited<ReturnType<typeof loadLatestResultData>>>, definition: ReturnType<typeof instrumentDefinition.parse>): FilterableResponse[] {
  const answers = new Map<string, Record<string, unknown>>();
  for (const answer of data.answers) { const id = String(answer.response_id); answers.set(id, { ...(answers.get(id) ?? {}), [String(answer.question_code)]: answer.value }); }
  const interactions: PrototypeInteractionRow[] = data.interactions.map((row) => ({ responseId: String(row.response_id), questionCode: String(row.question_code), eventType: String(row.event_type), payload: row.payload as Record<string, unknown> }));
  const paths = new Map(allQuestions(definition).filter((question) => question.type === "prototype_test").map((question) => [question.code, buildPrototypePaths(interactions, question.code)]));
  return data.responses.map((response) => {
    const id = String(response.id); const signatures: Record<string, string> = {};
    for (const [code, values] of paths) signatures[code] = values.find((path) => path.responseId === id)?.signature ?? "";
    return { id, answers: answers.get(id) ?? {}, tags: (response.tags as unknown[]).map(String), paths: signatures, facets: { location: String(response.location), ageRange: String(response.age_range), source: String(response.source) } };
  });
}

function summarize(type: string, values: unknown[]): string {
  if (type === "nps") { const nps = computeNps(values); return nps.score === null ? "Ingen gyldige NPS-svar." : `NPS ${nps.score}; (${nps.promoters} ambassadører − ${nps.detractors} kritikere) ÷ ${nps.valid} × 100.`; }
  if (!values.length) return "Ingen gyldige svar.";
  const counts = new Map<string, number>(); for (const raw of values) for (const value of Array.isArray(raw) ? raw : [raw]) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
  const top = [...counts].sort((left, right) => right[1] - left[1])[0];
  return top ? `Hyppigste værdi: ${top[0]} (${top[1]} af ${values.length}; ${(top[1] / values.length * 100).toFixed(1)} %).` : `${values.length} svar.`;
}
