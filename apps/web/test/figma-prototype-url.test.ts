import { describe, expect, it } from "vitest";
import { parseFigmaPrototypeUrl } from "@/lib/figma-prototype-url";

describe("Figma prototype URL parser", () => {
  it("extracts file key, readable name and normalizes node ID", () => {
    expect(parseFigmaPrototypeUrl("https://www.figma.com/proto/AbC_123/My-Test?node-id=5019-210&page-id=0%3A1")).toEqual({
      fileKey: "AbC_123",
      prototypeName: "My Test",
      nodeId: "5019:210",
    });
  });

  it("accepts official embed links and rejects non-prototype or lookalike origins", () => {
    expect(parseFigmaPrototypeUrl("https://embed.figma.com/proto/file-key/Prototype?node-id=1%3A2")?.nodeId).toBe("1:2");
    expect(parseFigmaPrototypeUrl("https://www.figma.com/design/file-key/Design")).toBeNull();
    expect(parseFigmaPrototypeUrl("https://figma.com.evil.example/proto/file-key/Design")).toBeNull();
    expect(parseFigmaPrototypeUrl("http://www.figma.com/proto/file-key/Design")).toBeNull();
  });
});
