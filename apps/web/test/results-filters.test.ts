import { describe, expect, it } from "vitest";
import { buildPrototypePaths, groupCommonPaths } from "../lib/prototype-results";
import { filterResponses, parseResultFilters } from "../lib/results-filters";

describe("global result filters", () => {
  const responses = [
    { id: "r1", answers: { q1: "yes", q2: ["a", "b"] }, tags: ["Elbil"], paths: { proto: "1:1→1:2" } },
    { id: "r2", answers: { q1: "no", q2: ["b"] }, tags: ["Andet"], paths: { proto: "1:1→1:3" } },
  ];

  it("combines answer, tag and path filters with AND", () => {
    expect(filterResponses(responses, [
      { kind: "answer", questionCode: "q2", value: "a" },
      { kind: "tag", value: "Elbil" },
      { kind: "path", questionCode: "proto", signature: "1:1→1:2" },
    ])).toHaveLength(1);
  });

  it("rejects oversized or malformed serialized filters", () => {
    expect(parseResultFilters("x")).toEqual([]);
    expect(parseResultFilters("[" + " ".repeat(9000) + "]")).toEqual([]);
  });
});

describe("prototype path grouping", () => {
  it("groups identical stable frame sequences and aggregates clicks", () => {
    const paths = buildPrototypePaths([
      { responseId: "r1", questionCode: "p", eventType: "prototype_frame", payload: { frameId: "1:1", elapsedMs: 0 } },
      { responseId: "r1", questionCode: "p", eventType: "prototype_frame", payload: { frameId: "1:2", elapsedMs: 100 } },
      { responseId: "r1", questionCode: "p", eventType: "prototype_click", payload: { frameId: "1:1", x: 1, y: 2, isMisclick: true, elapsedMs: 20 } },
      { responseId: "r2", questionCode: "p", eventType: "prototype_frame", payload: { frameId: "1:1", elapsedMs: 0 } },
      { responseId: "r2", questionCode: "p", eventType: "prototype_frame", payload: { frameId: "1:2", elapsedMs: 120 } },
    ], "p");
    const groups = groupCommonPaths(paths);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ participantCount: 2, clickCount: 1, misclickCount: 1, averageElapsedMs: 110 });
  });
});
