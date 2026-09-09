import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(path.resolve(process.cwd(), relative), "utf8");

describe("new integration route security", () => {
  it("binds encrypted Figma access to session, active tenant draft, question and file key", () => {
    for (const route of ["app/api/figma/connect/route.ts", "app/api/figma/callback/route.ts", "app/api/figma/frames/route.ts", "app/api/figma/thumbnail/route.ts"]) {
      const source = read(route);
      expect(source).toContain("getSession");
      expect(source).toContain("assertFigmaDraftAccess");
    }
    expect(read("app/api/figma/callback/route.ts")).toContain("sealFigmaToken");
    expect(read("app/api/figma/callback/route.ts")).not.toContain('jar.set("figma_access", token.access_token');
    expect(read("app/api/figma/frames/route.ts")).toContain("openFigmaToken");
    const framesRoute = read("app/api/figma/frames/route.ts");
    expect(framesRoute).toContain("classifyFigmaApiError");
    expect(framesRoute).not.toContain("Response.json({ error, providerBody");
    const thumbnailRoute = read("app/api/figma/thumbnail/route.ts");
    expect(thumbnailRoute).toContain("classifyFigmaApiError");
    expect(thumbnailRoute).not.toContain("Response.json({ error, providerBody");
    expect(read("app/api/figma/status/route.ts")).toContain("openFigmaToken");
    expect(read("app/api/figma/disconnect/route.ts")).toContain("maxAge: 0");
    expect(read("lib/auth.ts")).toContain("FIGMA_ACCESS_COOKIE_PATH");

    const access = read("lib/figma-access.ts");
    expect(access).toContain("withUser(session.userId, session.orgId");
    expect(access).toContain("deactivated_at is null");
    expect(access).toContain("u.is_active");
    expect(access).toContain('assertCan(membership.role as Role, "studies.edit")');
    expect(access).toContain("question.prototype.fileKey !== expectedFileKey");
  });

  it("wires gated connect, disconnect, resync and task-only goal selection", () => {
    const builder = read("app/(app)/studies/[id]/builder/modern-builder.tsx");
    const picker = read("app/(app)/studies/[id]/builder/figma-frame-picker.tsx");
    expect(builder).toContain("<FigmaFramePicker");
    expect(picker).toContain("connection?.configured");
    expect(picker).toContain('/api/figma/disconnect');
    expect(picker).toContain("parseFigmaPrototypeUrl");
    expect(picker).toContain("PRESENTED_NODE_CHANGED");
    expect(picker).toContain("event.origin !== FIGMA_ORIGIN");
    expect(picker).toContain("event.source !== iframeRef.current?.contentWindow");
    expect(picker).toContain("/api/figma/thumbnail");
    expect(picker).toContain("new URLSearchParams({ fileKey: config.fileKey, frameId, studyId, questionCode })");
    expect(picker).toContain('config.flowType === "task"');
    expect(picker).toContain('currentFrame.id === config.startFrameId');
  });

  it("protects preview assets by capability hash and exact study/version linkage", () => {
    const source = read("app/api/stimuli/[id]/route.ts");
    expect(source).toContain("verifyDraftPreviewToken");
    expect(source).toContain("draftDefinitionHash(row.draft_definition) === preview.draftHash");
    expect(source).toContain("m.study_id = ${preview.studyId} and m.org_id = ${preview.orgId}");
    expect(source).toContain("join study_versions v");
    expect(source).toContain("jsonb_path_exists(v.definition");
  });

  it("guards report download and queue recovery", () => {
    const download = read("app/api/report-jobs/[id]/download/route.ts");
    expect(download).toContain("getSession");
    expect(download).toContain('assertCan(session.role, "reports.create")');
    expect(download).toContain("withUser(session.userId, session.orgId");
    expect(download).toContain("r.org_id = ${session.orgId} and r.status = 'succeeded'");

    const route = read("app/api/internal/report-worker/route.ts");
    const worker = read("lib/report-worker.ts");
    expect(route).toContain("timingSafeEqual");
    expect(route).toContain("manual_worker_disabled");
    expect(route).toContain("processNextReportJob(session.orgId)");
    expect(route).toContain('withAuthorized("reports.create"');
    expect(worker).toContain("for update skip locked");
    expect(worker).toContain("status = 'running' and lease_expires_at < now()");
    expect(worker).toContain("REPORT_JOB_MAX_ATTEMPTS = 3");
    expect(worker).toContain("attempt-${attempt}");
    expect(worker).toContain("and attempt_count = ${attempt}");
    expect(worker).toContain('action: retry ? "report_job.retry" : "report_job.fail"');
  });

  it("persists only verified current-version prototype path labels with audit", () => {
    const actions = read("app/(app)/studies/[id]/results/report-job-actions.ts");
    const view = read("app/(app)/studies/[id]/results/prototype-result-view.tsx");
    expect(actions).toContain('withAuthorized("reports.create"');
    expect(actions).toContain("String(data.version.id) !== input.studyVersionId");
    expect(actions).toContain("buildPrototypePaths(rows, input.questionCode).some");
    expect(actions).toContain('action: "prototype_path.rename"');
    expect(view).toContain('readOnly={mode !== "common" || !canRenamePaths || renamePending}');
    expect(view).toContain("const previous = savedNames[signature] ?? fallback" );
    expect(view).toContain("[signature]: previous" );
    expect(view).toContain("Path-navnet kunne ikke gemmes. Tidligere navn er gendannet." );
    expect(view).toContain('role={renameStatus.error ? "alert" : "status"}');
  });

  it("rejects legacy imageUrl on mutable draft paths without removing immutable playback", () => {
    const actions = read("app/(app)/studies/actions.ts");
    const renderer = read("components/survey/renderer.tsx");
    expect(actions).toContain('problem.includes("uses legacy imageUrl")');
    expect(renderer).toContain('question.imageUrl ?? ""');
  });
  it("fails closed and surfaces invalid or oversized filter state", () => {
    const dashboard = read("app/(app)/studies/[id]/results/results-dashboard.tsx");
    const prototypeView = read("app/(app)/studies/[id]/results/prototype-result-view.tsx");
    const csv = read("app/api/studies/[id]/results/export/route.ts");
    const report = read("app/(app)/studies/[id]/results/report-job-actions.ts");
    expect(dashboard).toContain("parseResultFiltersDetailed");
    expect(dashboard).toContain('role="alert"');
    expect(dashboard).toContain("gyldige aktive filtre er bevaret");
    expect(prototypeView).toContain("trySerializeResultFilters");
    expect(csv).toContain('error: "invalid_filters"');
    expect(report).toContain("if (!parsedFilters.ok) return { ok: false, error: parsedFilters.message }");
  });

  it("keeps dashboard, CSV and report on one bounded filtered population", () => {
    const dashboard = read("app/(app)/studies/[id]/results/results-dashboard.tsx");
    const csv = read("app/api/studies/[id]/results/export/route.ts");
    const report = read("app/(app)/studies/[id]/results/report-job-actions.ts");
    for (const source of [dashboard, csv, report]) {
      expect(source).toContain("loadLatestResultData");
      expect(source).toContain("filterResponses");
    }
    expect(dashboard).toContain('const count = counts.get(option.value) ?? 0');
    expect(dashboard).toContain('count === 0 ? "opacity-45"');
    expect(csv).toContain('"x-result-count": String(filtered.length)');
    expect(report).toContain("filteredResponseBase: filtered.length");
  });
  it("keeps modern logic-off as a saved data invariant", () => {
    const builder = read("app/(app)/studies/[id]/builder/modern-builder.tsx");
    const actions = read("app/(app)/studies/actions.ts");
    expect(builder).toContain("onChange({ visibleIf: undefined, visibleIfMode: undefined })");
    expect(builder).toContain("setLogicOpen(false)");
    expect(builder).toContain('hasLogic ? `on · ${logicRuleCount}` : "off"');
    expect(actions).toContain("INCOMPLETE_LOGIC_CONDITION_MESSAGE");
  });
});
