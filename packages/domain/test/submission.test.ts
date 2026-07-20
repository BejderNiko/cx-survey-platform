import { describe, expect, it } from "vitest";
import { instrumentDefinition, validateSubmission } from "../src";

const definition = instrumentDefinition.parse({
  languages: ["en"],
  defaultLanguage: "en",
  blocks: [{
    id: "main",
    questions: [
      {
        code: "nps_score",
        type: "nps",
        label: { en: "NPS" },
        required: true,
        branches: [{
          id: "detractor",
          when: [{ questionCode: "nps_score", op: "lte", value: 6 }],
          goTo: "reason",
        }],
      },
      {
        code: "reason",
        type: "long_text",
        label: { en: "Why?" },
        required: true,
        visibleIf: [{ questionCode: "nps_score", op: "lte", value: 6 }],
      },
      {
        code: "contact",
        type: "consent",
        label: { en: "Contact?" },
      },
    ],
  }],
  messages: {},
});

describe("respondent submission validation", () => {
  it("accepts and sanitizes the traversed path", () => {
    const result = validateSubmission(definition, {
      status: "completed",
      answers: [
        { code: "nps_score", type: "nps", value: 10 },
        { code: "reason", type: "long_text", value: "stale hidden answer" },
        { code: "contact", type: "consent", value: true },
      ],
      interactions: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.answers.map((a) => a.code)).toEqual(["nps_score", "contact"]);
  });

  it("rejects missing required answers", () => {
    const result = validateSubmission(definition, {
      status: "completed",
      answers: [{ code: "nps_score", type: "nps", value: 3 }],
      interactions: [],
    });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.errors).toContain("Required question 'reason' is missing.");
  });

  it("rejects empty required values", () => {
    const result = validateSubmission(definition, {
      status: "completed",
      answers: [
        { code: "nps_score", type: "nps", value: 3 },
        { code: "reason", type: "long_text", value: "" },
      ],
      interactions: [],
    });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.errors).toContain("Required question 'reason' is empty.");
  });

  it("rejects out-of-range metric values", () => {
    const result = validateSubmission(definition, {
      status: "completed",
      answers: [{ code: "nps_score", type: "nps", value: 11 }],
      interactions: [],
    });
    expect(result).toMatchObject({ ok: false });
  });

  it("rejects a client-forged final status", () => {
    const result = validateSubmission(definition, {
      status: "disqualified",
      answers: [
        { code: "nps_score", type: "nps", value: 10 },
        { code: "contact", type: "consent", value: false },
      ],
      interactions: [],
    });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.errors[0]).toContain("does not match survey path");
  });
  it("rejects forged or incomplete first-click metadata", () => {
    const firstClickDefinition = instrumentDefinition.parse({
      languages: ["en"],
      defaultLanguage: "en",
      blocks: [{
        id: "task",
        questions: [{
          code: "click",
          type: "first_click",
          label: { en: "Click target" },
          required: true,
          imageUrl: "/stimulus.png",
        }],
      }],
      messages: {},
    });
    const result = validateSubmission(firstClickDefinition, {
      status: "completed",
      answers: [{ code: "click", type: "first_click", value: { x: 30, y: 20 } }],
      interactions: [{
        code: "click",
        eventType: "first_click",
        payload: { x: 300, y: 20, naturalWidth: 100, naturalHeight: 100, elapsedMs: 50 },
      }],
    });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.errors.join(" ")).toContain("inside the image dimensions");
  });
});
