import { describe, expect, it } from "vitest";
import { validateFeatureRequestInput } from "@/app/(app)/feature-requests/input";

describe("feature request server input validation", () => {
  it("trims bounded text and normalizes captured source type", () => {
    expect(validateFeatureRequestInput({
      title: "  Button feedback  ",
      description: "  Make this action clearer.  ",
      sourceType: "feedback",
      targetSnapshot: { tagName: "button" },
    })).toMatchObject({
      ok: true,
      value: {
        title: "Button feedback",
        description: "Make this action clearer.",
        sourceType: "feedback",
        targetSnapshot: { tagName: "button", sourceType: "feedback" },
      },
    });
  });

  it("rejects forged field types and source types without throwing", () => {
    expect(validateFeatureRequestInput({ title: {}, description: "x" }).ok).toBe(false);
    expect(validateFeatureRequestInput({ title: "Good title", description: "x", sourceType: "admin" }).ok).toBe(false);
    expect(validateFeatureRequestInput({ title: "Good title", description: "x", targetSnapshot: [] }).ok).toBe(false);
  });

  it("rejects captures that exceed storage limit", () => {
    const result = validateFeatureRequestInput({
      title: "Good title",
      description: "A useful note",
      targetSnapshot: { text: "x".repeat(30_001) },
    });
    expect(result).toMatchObject({ ok: false, error: "Feedback capture is too large. Remove some details and try again." });
  });
});
