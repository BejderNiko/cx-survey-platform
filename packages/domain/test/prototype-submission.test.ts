import { describe, expect, it } from "vitest";
import { instrumentDefinition } from "../src/instrument";
import { validateSubmission } from "../src/submission";

const definition = instrumentDefinition.parse({
  languages: ["da"], defaultLanguage: "da", blocks: [{ id: "b1", questions: [{
    code: "prototype", type: "prototype_test", label: { da: "Find betaling" }, required: true,
    prototype: { provider: "figma", flowType: "task", fileKey: "file", startFrameId: "1:1", goalFrameId: "1:9" },
  }] }], messages: {},
});

describe("prototype submission", () => {
  it("accepts bounded frame and click telemetry with verified goal event", () => {
    const result = validateSubmission(definition, {
      status: "completed",
      answers: [{ code: "prototype", type: "prototype_test", value: { reachedGoal: true, lastFrameId: "1:9" } }],
      interactions: [
        { code: "prototype", eventType: "prototype_frame", payload: { frameId: "1:1", previousFrameId: null, elapsedMs: 0, initial: true } },
        { code: "prototype", eventType: "prototype_click", payload: { frameId: "1:1", x: 12, y: 24, isMisclick: false, targetNodeId: "2:2", scrollingFrameId: "1:1", elapsedMs: 200 } },
        { code: "prototype", eventType: "prototype_frame", payload: { frameId: "1:9", previousFrameId: "1:1", elapsedMs: 500 } },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a success claim without a goal-frame event", () => {
    const result = validateSubmission(definition, {
      status: "completed",
      answers: [{ code: "prototype", type: "prototype_test", value: { reachedGoal: true, lastFrameId: "1:9" } }],
      interactions: [{ code: "prototype", eventType: "prototype_frame", payload: { frameId: "1:1", previousFrameId: null, elapsedMs: 0, initial: true } }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("claims success");
  });

  it("rejects unsupported telemetry fields", () => {
    const result = validateSubmission(definition, {
      status: "completed",
      answers: [{ code: "prototype", type: "prototype_test", value: { reachedGoal: false, lastFrameId: "1:1" } }],
      interactions: [{ code: "prototype", eventType: "prototype_frame", payload: { frameId: "1:1", elapsedMs: 0, rawDocument: "not allowed" } }],
    });
    expect(result.ok).toBe(false);
  });
});
