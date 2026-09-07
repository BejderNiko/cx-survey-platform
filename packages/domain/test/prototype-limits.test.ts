import { describe, expect, it } from "vitest";
import { instrumentDefinition, prototypeGoalReached, prototypeTestConfig, validateInstrument } from "../src/instrument";
import { MAX_PROTOTYPE_INTERACTIONS_PER_QUESTION, MAX_SUBMISSION_INTERACTIONS, recordSubmissionInteraction, validateSubmission } from "../src/submission";

const definition = instrumentDefinition.parse({
  languages: ["da"], defaultLanguage: "da", messages: {}, blocks: [{ id: "b", questions: [{
    code: "prototype", type: "prototype_test", label: { da: "Prototype" }, required: true,
    prototype: { provider: "figma", flowType: "task", fileKey: "f", startFrameId: "1:1", goalFrameId: "1:2" },
  }] }],
});

describe("prototype telemetry invariants", () => {
  it("keeps success after participant leaves goal frame", () => {
    const reached = prototypeGoalReached(false, "1:2", "1:2");
    expect(prototypeGoalReached(reached, "1:3", "1:2")).toBe(true);
  });

  it("allows incomplete prototype drafts but keeps publication validation strict", () => {
    const draft = instrumentDefinition.parse({
      languages: ["da"], defaultLanguage: "da", messages: {}, blocks: [{ id: "b", questions: [{
        code: "draft_prototype", type: "prototype_test", label: { da: "Prototype" },
        prototype: { provider: "figma", flowType: "task", fileKey: "", startFrameId: "" },
      }] }],
    });
    expect(validateInstrument(draft)).toEqual(expect.arrayContaining([
      expect.stringContaining("missing a Figma prototype link"),
      expect.stringContaining("missing a starting frame"),
      expect.stringContaining("missing a goal frame"),
    ]));
    draft.blocks[0].questions[0].prototype = prototypeTestConfig.parse({ provider: "figma", flowType: "task", fileKey: "file", startFrameId: "1:1", goalFrameId: "1:1" });
    expect(validateInstrument(draft).join(" ")).toContain("different starting and goal frames");
  });

  it("uses explicit aligned interaction limits", () => {
    expect(MAX_SUBMISSION_INTERACTIONS).toBeGreaterThanOrEqual(MAX_PROTOTYPE_INTERACTIONS_PER_QUESTION);
  });

  it("allocates three prototypes without silent truncation", () => {
    const questions = [0, 1, 2].map((index) => ({ code: `p${index}`, type: "prototype_test" as const, label: { da: `P${index}` }, required: true, prototype: { provider: "figma" as const, flowType: "task" as const, fileKey: "f", startFrameId: "1:1", goalFrameId: "1:2" } }));
    const multiple = instrumentDefinition.parse({ languages: ["da"], defaultLanguage: "da", messages: {}, blocks: [{ id: "b", questions }] });
    expect(validateInstrument(multiple).join(" ")).not.toContain("interaction budget");
    let interactions: Array<{ code: string; eventType: string; payload: Record<string, unknown> }> = [];
    for (const question of questions) for (let index = 0; index < MAX_PROTOTYPE_INTERACTIONS_PER_QUESTION; index += 1) {
      const result = recordSubmissionInteraction(multiple, interactions, { code: question.code, eventType: "prototype_frame", payload: { frameId: index % 2 ? "1:2" : "1:1", elapsedMs: index } });
      expect(result.ok).toBe(true); interactions = result.interactions;
    }
    expect(interactions).toHaveLength(3 * MAX_PROTOTYPE_INTERACTIONS_PER_QUESTION);
    expect(interactions.length).toBeLessThanOrEqual(MAX_SUBMISSION_INTERACTIONS);
  });
  it("allocates two prototypes plus one first-click", () => {
    const questions = [0, 1].map((index) => ({ code: `p${index}`, type: "prototype_test" as const, label: { da: `P${index}` }, prototype: { provider: "figma" as const, flowType: "task" as const, fileKey: "f", startFrameId: "1:1", goalFrameId: "1:2" } }));
    const mixed = instrumentDefinition.parse({ languages: ["da"], defaultLanguage: "da", messages: {}, blocks: [{ id: "b", questions: [...questions, { code: "click", type: "first_click", label: { da: "Klik" }, imageUrl: "/legacy.png" }] }] });
    let interactions: Array<{ code: string; eventType: string; payload: Record<string, unknown> }> = [];
    for (const question of questions) for (let index = 0; index < MAX_PROTOTYPE_INTERACTIONS_PER_QUESTION; index += 1) {
      const result = recordSubmissionInteraction(mixed, interactions, { code: question.code, eventType: "prototype_frame", payload: { frameId: "1:1", elapsedMs: index } });
      expect(result.ok).toBe(true); interactions = result.interactions;
    }
    const click = recordSubmissionInteraction(mixed, interactions, { code: "click", eventType: "first_click", payload: { x: 1, y: 1, naturalWidth: 2, naturalHeight: 2, elapsedMs: 1 } });
    expect(click.ok).toBe(true); expect(click.interactions).toHaveLength(181);
  });
  it("rejects a prototype exceeding per-question limit", () => {
    const interactions = Array.from({ length: MAX_PROTOTYPE_INTERACTIONS_PER_QUESTION + 1 }, (_, index) => ({ code: "prototype", eventType: "prototype_frame", payload: { frameId: index % 2 ? "1:1" : "1:2", elapsedMs: index } }));
    const result = validateSubmission(definition, { status: "completed", answers: [{ code: "prototype", type: "prototype_test", value: { reachedGoal: true, lastFrameId: "1:2" } }], interactions });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("exceeds per-prototype limit");
  });
});
