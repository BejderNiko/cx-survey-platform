import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createReportArtifact, type ReportSnapshot } from "../lib/office-report";

const snapshot: ReportSnapshot = {
  studyTitle: "QA study",
  studyVersion: 3,
  requestedAt: "2026-08-12T12:00:00.000Z",
  filteredResponseBase: 4,
  responseBaseBeforeFilters: 10,
  filters: [{ kind: "facet", facet: "location", value: "DK" }],
  sources: ["responses", "response_answers"],
  insights: [{ code: "nps", label: "NPS", type: "nps", validBase: 4, summary: "NPS 25." }],
};

describe("report artifact generator", () => {
  it.each([
    ["docx", "word/document.xml"],
    ["pptx", "ppt/slides/slide1.xml"],
  ] as const)("creates deterministic %s OOXML with lineage", (format, requiredEntry) => {
    const first = createReportArtifact(format, snapshot);
    const second = createReportArtifact(format, snapshot);
    expect([...first.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(new TextDecoder().decode(first)).toContain(requiredEntry);
    expect(new TextDecoder().decode(first)).toContain("DRAFT_UNBRANDED");
    expect(createHash("sha256").update(first).digest("hex")).toBe(createHash("sha256").update(second).digest("hex"));
  });
});
