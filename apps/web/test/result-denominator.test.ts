import { describe, expect, it } from "vitest";
import { facetCounts, filterResponses } from "../lib/results-filters";

const row = (id: string, answer: string) => ({
  id, answers: { q1: answer }, tags: [], paths: { proto: "same" },
  facets: { location: "Denmark", ageRange: "35-44", source: "email" },
});

describe("result denominator and respondent isolation", () => {
  it("reports 232 OF 555 against the bounded population", () => {
    const population = Array.from({ length: 555 }, (_, index) => row(`r${index}`, index < 232 ? "yes" : "no"));
    expect(facetCounts(population, [{ kind: "answer", questionCode: "q1", value: "yes" }], "location"))
      .toContainEqual({ value: "Denmark", matching: 232, total: 555, active: false });
  });

  it("respondent filter isolates n=1 when signatures match", () => {
    const population = [row("r1", "yes"), row("r2", "yes")];
    expect(filterResponses(population, [{ kind: "path", questionCode: "proto", signature: "same" }])).toHaveLength(2);
    expect(filterResponses(population, [{ kind: "respondent", responseId: "r2" }]).map((item) => item.id)).toEqual(["r2"]);
  });
});
