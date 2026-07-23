import { describe, expect, it } from "vitest";
import {
  QUESTION_TYPES,
  QUESTION_TYPE_GROUP_ORDER,
  QUESTION_TYPE_METADATA,
  groupedQuestionTypes,
  instrumentDefinition,
  toDanishDraft,
  validateInstrument,
  validateSubmission,
} from "../src";

const assetA = { id: "a", assetId: "11111111-1111-4111-8111-111111111111", altText: "Forside A" };
const assetB = { id: "b", assetId: "22222222-2222-4222-8222-222222222222", altText: "Forside B" };

const preferenceDefinition = instrumentDefinition.parse({
  languages: ["da"],
  defaultLanguage: "da",
  blocks: [{
    id: "main",
    questions: [{
      code: "design",
      type: "preference_test",
      label: { da: "Hvilket design foretrækker du?" },
      required: true,
      stimuli: [assetA, assetB],
      randomizeStimuli: true,
    }],
  }],
  messages: {},
});

describe("question metadata", () => {
  it("covers every question type once in the ordered groups", () => {
    expect(Object.keys(QUESTION_TYPE_METADATA).sort()).toEqual([...QUESTION_TYPES].sort());
    expect(groupedQuestionTypes().map((group) => group.group)).toEqual(QUESTION_TYPE_GROUP_ORDER);
    expect(groupedQuestionTypes().flatMap((group) => group.items.map((item) => item.type)).sort())
      .toEqual([...QUESTION_TYPES].sort());
  });
});

describe("Danish draft normalization", () => {
  it("removes mutable English authoring fields without mutating source", () => {
    const source = instrumentDefinition.parse({
      languages: ["da", "en"],
      defaultLanguage: "en",
      blocks: [{
        id: "main",
        title: { da: "Titel", en: "Title" },
        questions: [{
          code: "choice",
          type: "single_choice",
          label: { da: "Vælg", en: "Choose" },
          helpText: { da: "Hjælp", en: "Help" },
          options: [
            { id: "yes", label: { da: "Ja", en: "Yes" } },
            { id: "no", label: { da: "Nej", en: "No" } },
          ],
        }],
      }],
      messages: { thankYou: { da: "Tak", en: "Thanks" } },
    });
    const normalized = toDanishDraft(source);
    expect(normalized.languages).toEqual(["da"]);
    expect(normalized.defaultLanguage).toBe("da");
    expect(normalized.blocks[0].questions[0].label.en).toBeUndefined();
    expect(normalized.blocks[0].questions[0].options?.[0].label.en).toBeUndefined();
    expect(source.blocks[0].questions[0].label.en).toBe("Choose");
  });
});

describe("preference test", () => {
  it("accepts one selected asset and exact display order", () => {
    const result = validateSubmission(preferenceDefinition, {
      status: "completed",
      answers: [{
        code: "design",
        type: "preference_test",
        value: { selectedId: "b", selectedAssetId: assetB.assetId, displayOrder: ["b", "a"] },
      }],
      interactions: [],
    });
    expect(result).toMatchObject({ ok: true });
  });

  it("rejects forged assets and incomplete display order", () => {
    const result = validateSubmission(preferenceDefinition, {
      status: "completed",
      answers: [{
        code: "design",
        type: "preference_test",
        value: { selectedId: "b", selectedAssetId: assetA.assetId, displayOrder: ["b"] },
      }],
      interactions: [],
    });
    expect(result).toMatchObject({ ok: false });
  });

  it("supports the complete 2 to 8 stimulus range and rejects outside it", () => {
    for (const count of [2, 8]) {
      const definition = instrumentDefinition.parse({
        ...preferenceDefinition,
        blocks: [{
          ...preferenceDefinition.blocks[0],
          questions: [{
            ...preferenceDefinition.blocks[0].questions[0],
            stimuli: Array.from({ length: count }, (_, index) => ({
              id: "asset-" + index,
              assetId: "00000000-0000-4000-8000-" + String(index + 1).padStart(12, "0"),
              altText: "Billede " + (index + 1),
            })),
          }],
        }],
      });
      expect(validateInstrument(definition)).toEqual([]);
    }

    for (const count of [1, 9]) {
      const result = instrumentDefinition.safeParse({
        ...preferenceDefinition,
        blocks: [{
          ...preferenceDefinition.blocks[0],
          questions: [{
            ...preferenceDefinition.blocks[0].questions[0],
            stimuli: Array.from({ length: count }, (_, index) => ({
              id: "asset-" + index,
              assetId: "00000000-0000-4000-8000-" + String(index + 1).padStart(12, "0"),
              altText: "Billede " + (index + 1),
            })),
          }],
        }],
      });
      expect(result.success).toBe(false);
    }
  });
});
