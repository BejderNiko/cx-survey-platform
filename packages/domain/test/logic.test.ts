import { describe, expect, it } from "vitest";
import { instrumentDefinition, validateInstrument, type InstrumentDefinition } from "../src/instrument";
import { nextStep, visiblePath } from "../src/logic";

const def: InstrumentDefinition = instrumentDefinition.parse({
  languages: ["da", "en"],
  defaultLanguage: "en",
  blocks: [
    {
      id: "b1",
      questions: [
        {
          code: "screener",
          type: "single_choice",
          label: { en: "Are you an OK customer?" },
          required: true,
          isScreener: true,
          options: [
            { id: "yes", label: { en: "Yes" } },
            { id: "no", label: { en: "No" } },
          ],
          branches: [
            { id: "br0", when: [{ questionCode: "screener", op: "eq", value: "no" }], goTo: "DISQUALIFY" },
          ],
        },
        {
          code: "nps_score",
          type: "nps",
          label: { en: "How likely are you to recommend OK?" },
          required: true,
          branches: [
            { id: "br1", when: [{ questionCode: "nps_score", op: "gte", value: 9 }], goTo: "promoter_why" },
          ],
        },
        {
          code: "detractor_why",
          type: "long_text",
          label: { en: "What went wrong?" },
          visibleIf: [{ questionCode: "nps_score", op: "lte", value: 6 }],
        },
        { code: "promoter_why", type: "long_text", label: { en: "What do you value most?" } },
        { code: "email_optin", type: "consent", label: { en: "May we contact you?" } },
      ],
    },
  ],
  messages: {},
});

describe("survey logic engine", () => {
  it("validates a correct instrument with no problems", () => {
    expect(validateInstrument(def)).toEqual([]);
  });

  it("starts at the first question", () => {
    const step = nextStep(def, null, {});
    expect(step.kind).toBe("question");
    if (step.kind === "question") expect(step.question.code).toBe("screener");
  });

  it("disqualifies via screener branch", () => {
    const step = nextStep(def, "screener", { screener: "no" });
    expect(step.kind).toBe("disqualified");
  });

  it("promoter path skips the detractor question via branch", () => {
    expect(visiblePath(def, { screener: "yes", nps_score: 10 })).toEqual([
      "screener",
      "nps_score",
      "promoter_why",
      "email_optin",
    ]);
  });

  it("detractor path shows the detractor question via visibleIf", () => {
    expect(visiblePath(def, { screener: "yes", nps_score: 2 })).toEqual([
      "screener",
      "nps_score",
      "detractor_why",
      "promoter_why",
      "email_optin",
    ]);
  });

  it("passive path (7-8) hides detractor question and takes no branch", () => {
    expect(visiblePath(def, { screener: "yes", nps_score: 8 })).toEqual([
      "screener",
      "nps_score",
      "promoter_why",
      "email_optin",
    ]);
  });

  it("flags backward branches and unknown targets", () => {
    const bad = structuredClone(def);
    bad.blocks[0].questions[3].branches = [
      { id: "x", when: [{ questionCode: "promoter_why", op: "answered" }], goTo: "screener" },
    ];
    const problems = validateInstrument(bad);
    expect(problems.some((p) => p.includes("jump forward"))).toBe(true);
  });
});
