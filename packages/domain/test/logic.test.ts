import { describe, expect, it } from "vitest";
import {
  INCOMPLETE_LOGIC_CONDITION_MESSAGE,
  instrumentDefinition,
  validateInstrument,
  type InstrumentDefinition,
} from "../src/instrument";
import { evaluateCondition, nextStep, visiblePath } from "../src/logic";

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

  it("skips questions hidden from participants", () => {
    const hidden = structuredClone(def);
    hidden.blocks[0].questions[3].hidden = true;
    expect(visiblePath(hidden, { screener: "yes", nps_score: 10 })).toEqual([
      "screener",
      "nps_score",
      "email_optin",
    ]);
  });

  it("skips a hidden first question", () => {
    const hidden = structuredClone(def);
    hidden.blocks[0].questions[0].hidden = true;
    const step = nextStep(hidden, null, {});
    expect(step.kind).toBe("question");
    if (step.kind === "question") expect(step.question.code).toBe("nps_score");
  });

  it("flags backward branches and unknown targets", () => {
    const bad = structuredClone(def);
    bad.blocks[0].questions[3].branches = [
      { id: "x", when: [{ questionCode: "promoter_why", op: "answered" }], goTo: "screener" },
    ];
    const problems = validateInstrument(bad);
    expect(problems.some((p) => p.includes("jump forward"))).toBe(true);
  });

  it("rejects logic that depends on or targets hidden questions", () => {
    const bad = structuredClone(def);
    bad.blocks[0].questions[1].hidden = true;
    bad.blocks[0].questions[2].visibleIf = [{ questionCode: "nps_score", op: "answered" }];
    bad.blocks[0].questions[0].branches = [
      { id: "hidden-target", when: [{ questionCode: "screener", op: "answered" }], goTo: "nps_score" },
    ];
    const problems = validateInstrument(bad);
    expect(problems).toEqual(expect.arrayContaining([
      "Hidden question 'nps_score' cannot have routing rules.",
      "Display condition on 'detractor_why' cannot reference hidden question 'nps_score'.",
    ]));
  });

  it("rejects logic configured on a hidden question", () => {
    const bad = structuredClone(def);
    bad.blocks[0].questions[2].hidden = true;
    const problems = validateInstrument(bad);
    expect(problems).toContain("Hidden question 'detractor_why' cannot have display conditions.");
  });

  it("treats legacy display conditions as show rules and lets matching hide rules win", () => {
    const conditional = structuredClone(def);
    conditional.blocks[0].questions[3].visibleIf = [
      { questionCode: "nps_score", op: "eq", value: 2, effect: "hide" },
    ];
    expect(visiblePath(conditional, { screener: "yes", nps_score: 2 })).not.toContain("promoter_why");
    expect(visiblePath(conditional, { screener: "yes", nps_score: 8 })).toContain("promoter_why");
    expect(visiblePath(def, { screener: "yes", nps_score: 2 })).toContain("detractor_why");
  });

  it("matches every selected value in a multiple-choice contains condition", () => {
    expect(evaluateCondition(
      { questionCode: "channels", op: "contains", value: ["email", "sms"] },
      { channels: ["email", "sms", "phone"] },
    )).toBe(true);
    expect(evaluateCondition(
      { questionCode: "channels", op: "contains", value: ["email", "push"] },
      { channels: ["email", "sms"] },
    )).toBe(false);
  });

  it("applies display conditions and hidden state to whole sections", () => {
    const conditional = structuredClone(def);
    conditional.blocks.push({
      id: "b2",
      visibleIf: [{ questionCode: "nps_score", op: "eq", value: 10 }],
      questions: [{ code: "section_followup", type: "long_text", label: { en: "Section follow-up" }, required: false }],
    });
    expect(visiblePath(conditional, { screener: "yes", nps_score: 10 })).toContain("section_followup");
    expect(visiblePath(conditional, { screener: "yes", nps_score: 2 })).not.toContain("section_followup");

    conditional.blocks[1].hidden = true;
    expect(visiblePath(conditional, { screener: "yes", nps_score: 10 })).not.toContain("section_followup");
  });

  it("flags incomplete display conditions before save or publish", () => {
    const bad = structuredClone(def);
    bad.blocks[0].questions[2].visibleIf = [
      { questionCode: "", op: "eq", value: "", effect: "show" },
    ];
    expect(validateInstrument(bad)).toContain(INCOMPLETE_LOGIC_CONDITION_MESSAGE);
  });

  it("requires section display conditions to reference an earlier section", () => {
    const bad = structuredClone(def);
    bad.blocks.push({
      id: "b2",
      visibleIf: [{ questionCode: "section_followup", op: "answered" }],
      questions: [{ code: "section_followup", type: "long_text", label: { en: "Section follow-up" }, required: false }],
    });
    expect(validateInstrument(bad)).toContain("Display condition on 'b2' must reference an earlier question.");
  });
});
