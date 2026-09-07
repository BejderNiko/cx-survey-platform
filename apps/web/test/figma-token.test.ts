import { describe, expect, it } from "vitest";
import { openFigmaToken, sealFigmaToken } from "@/lib/figma-token";

const secret = "test-only-figma-token-secret-with-32-bytes";
const identity = { userId: "user-a", orgId: "org-a" };

describe("Figma token envelope", () => {
  it("round-trips only for the bound user and organization before expiry", () => {
    const envelope = sealFigmaToken(identity, "figma-secret-token", 300, secret, 1_000);
    expect(envelope).not.toContain("figma-secret-token");
    expect(openFigmaToken(envelope, identity, secret, 2_000)).toBe("figma-secret-token");
    expect(openFigmaToken(envelope, { userId: "user-b", orgId: "org-a" }, secret, 2_000)).toBeNull();
    expect(openFigmaToken(envelope, { userId: "user-a", orgId: "org-b" }, secret, 2_000)).toBeNull();
    expect(openFigmaToken(envelope, identity, secret, 301_001)).toBeNull();
  });

  it("rejects tampering and a different encryption secret", () => {
    const envelope = sealFigmaToken(identity, "figma-secret-token", 300, secret, 1_000);
    const tampered = `${envelope.slice(0, -1)}${envelope.endsWith("A") ? "B" : "A"}`;
    expect(openFigmaToken(tampered, identity, secret, 2_000)).toBeNull();
    expect(openFigmaToken(envelope, identity, `${secret}-wrong`, 2_000)).toBeNull();
  });
});
