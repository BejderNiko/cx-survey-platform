import { describe, expect, it } from "vitest";
import { instrumentDefinition, participantDeviceAllows } from "../src/instrument";

describe("participant device", () => {
  it("defaults legacy definitions to any device", () => {
    const definition = instrumentDefinition.parse({
      languages: ["da"],
      defaultLanguage: "da",
      blocks: [],
    });

    expect(definition.participantDevice).toBe("any");
  });

  it.each([
    ["any", "desktop", true],
    ["any", "mobile", true],
    ["desktop", "desktop", true],
    ["desktop", "mobile", false],
    ["mobile", "mobile", true],
    ["mobile", "desktop", false],
  ] as const)("allows %s requirement on %s viewport: %s", (required, viewport, allowed) => {
    expect(participantDeviceAllows(required, viewport)).toBe(allowed);
  });
});