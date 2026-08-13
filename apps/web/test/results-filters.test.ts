import { describe, expect, it } from "vitest";
import { buildPrototypePaths, groupCommonPaths } from "../lib/prototype-results";
import { facetCounts, filterResponses, mergeResultFilters, parseResultFilters, parseResultFiltersDetailed, serializeResultFilters, trySerializeResultFilters } from "../lib/results-filters";

describe("global result filters", () => {
  const responses = [
    { id: "r1", answers: { q1: "yes", q2: ["a", "b"] }, tags: ["Elbil"], paths: { proto: "1:1→1:2" }, facets: { location: "DK", ageRange: "35-44", source: "email" } },
    { id: "r2", answers: { q1: "no", q2: ["b"] }, tags: ["Andet"], paths: { proto: "1:1→1:3" }, facets: { location: "SE", ageRange: "45-54", source: "link" } },
  ];

  it("combines answer, tag, path and facet filters with AND", () => {
    expect(filterResponses(responses, [
      { kind: "answer", questionCode: "q2", value: "a" },
      { kind: "tag", value: "Elbil" },
      { kind: "path", questionCode: "proto", signature: "1:1→1:2" },
      { kind: "facet", facet: "location", value: "DK" },
    ])).toHaveLength(1);
  });

  it("computes dynamic X of Y against other filters", () => {
    const counts = facetCounts(responses, [{ kind: "answer", questionCode: "q1", value: "yes" }], "location");
    expect(counts).toEqual([
      { value: "DK", matching: 1, total: 2, active: false },
      { value: "SE", matching: 0, total: 2, active: false },
    ]);
  });

  it("replaces an existing value within a single-value facet", () => {
    expect(mergeResultFilters([{ kind: "facet", facet: "location", value: "DK" }], [{ kind: "facet", facet: "location", value: "SE" }]))
      .toEqual([{ kind: "facet", facet: "location", value: "SE" }]);
  });

  it("roundtrips exactly 64 compact filters with long path signatures", () => {
    const filters = Array.from({ length: 64 }, (_, index) => ({
      kind: "path" as const,
      questionCode: `prototype_${index}`,
      signature: `${index}:${"frame".repeat(36)}`,
    }));
    const serialized = serializeResultFilters(filters);
    expect(serialized.length).toBeLessThanOrEqual(16_000);
    expect(parseResultFilters(serialized)).toEqual(filters);
    expect(parseResultFiltersDetailed(serialized)).toEqual({ ok: true, filters });
  });

  it("roundtrips one maximum-length path signature", () => {
    const filters = [{ kind: "path" as const, questionCode: "prototype", signature: "x".repeat(4_000) }];
    const serialized = serializeResultFilters(filters);
    expect(parseResultFilters(serialized)).toEqual(filters);
  });

  it("fails explicitly instead of emitting payloads the parser would reset", () => {
    const oversized = Array.from({ length: 5 }, (_, index) => ({ kind: "path" as const, questionCode: `p${index}`, signature: `${index}${"x".repeat(3_999)}` }));
    expect(trySerializeResultFilters(oversized)).toMatchObject({ ok: false, error: "too_large" });
    expect(() => serializeResultFilters(oversized)).toThrow(/16\.000/);

    const tooMany = Array.from({ length: 65 }, (_, index) => ({ kind: "answer" as const, questionCode: `q${index}`, value: `v${index}` }));
    expect(mergeResultFilters([], tooMany)).toHaveLength(65);
    expect(trySerializeResultFilters(tooMany)).toMatchObject({ ok: false, error: "too_many" });
  });

  it("reports malformed and oversized input instead of silently parsing as no filters", () => {
    expect(parseResultFiltersDetailed("x")).toMatchObject({ ok: false, error: "invalid" });
    expect(parseResultFiltersDetailed("[" + " ".repeat(17_000) + "]")).toMatchObject({ ok: false, error: "too_large" });
    expect(() => parseResultFilters("x")).toThrow(/ugyldigt|beskadiget/);
  });

  it("keeps backward compatibility for valid legacy JSON filter links", () => {
    const legacy = [{ kind: "answer" as const, questionCode: "q1", value: "yes" }];
    expect(parseResultFilters(JSON.stringify(legacy))).toEqual(legacy);
  });
});

describe("prototype path grouping", () => {
  it("groups identical sequences and calculates per-frame duration", () => {
    const paths = buildPrototypePaths([
      { responseId: "r1", questionCode: "p", eventType: "prototype_frame", payload: { frameId: "1:1", elapsedMs: 0 } },
      { responseId: "r1", questionCode: "p", eventType: "prototype_click", payload: { frameId: "1:1", x: 1, y: 2, isMisclick: true, elapsedMs: 20 } },
      { responseId: "r1", questionCode: "p", eventType: "prototype_frame", payload: { frameId: "1:2", elapsedMs: 100 } },
      { responseId: "r2", questionCode: "p", eventType: "prototype_frame", payload: { frameId: "1:1", elapsedMs: 0 } },
      { responseId: "r2", questionCode: "p", eventType: "prototype_frame", payload: { frameId: "1:2", elapsedMs: 120 } },
    ], "p");
    const groups = groupCommonPaths(paths);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ participantCount: 2, clickCount: 1, misclickCount: 1, averageElapsedMs: 110 });
    expect(groups[0].averageVisits[0].durationMs).toBe(110);
  });
});
