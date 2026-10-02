import { describe, expect, it } from "vitest";
import { validateInstrument } from "@ok/domain";
import { generateLocalSurveyDraft } from "@/lib/survey-draft";

describe("local survey draft generation", () => {
  it("returns a valid reviewable draft with selection limits", () => {
    const result = generateLocalSurveyDraft("Test onboarding clarity for new customers.");
    expect(result.source).toBe("local-template");
    expect(validateInstrument(result.definition)).toEqual([]);
    expect(result.definition.blocks[0].questions.map((question) => question.type)).toEqual([
      "single_choice",
      "multiple_choice",
      "long_text",
    ]);
    expect(result.definition.blocks[0].questions[1].multipleSelectMinLimit).toBe(1);
    expect(result.definition.blocks[0].questions[1].multipleSelectLimit).toBe(2);
  });

  it("rejects an empty brief", () => {
    expect(() => generateLocalSurveyDraft("  ")).toThrow("Describe survey goal before generating a draft.");
  });
});