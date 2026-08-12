import { describe, expect, it } from "vitest";
import { buildPrototypePaths, groupCommonPaths } from "../lib/prototype-results";
import { facetCounts, filterResponses, mergeResultFilters, parseResultFilters } from "../lib/results-filters";

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

  it("rejects oversized or malformed serialized filters", () => {
    expect(parseResultFilters("x")).toEqual([]);
    expect(parseResultFilters("[" + " ".repeat(9000) + "]")).toEqual([]);
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
