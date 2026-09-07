import { describe, expect, it } from "vitest";
import { classifyFigmaApiError } from "@/lib/figma-api-error";

describe("Figma API error classification", () => {
  it.each([
    [403, { err: "Invalid scope" }, "figma_scope_missing"],
    [403, { message: "Insufficient file permissions" }, "figma_file_permission_denied"],
    [403, { error: "OAuth token invalid" }, "figma_token_rejected"],
    [403, { message: "Access token invalid" }, "figma_token_rejected"],
    [403, null, "figma_rest_forbidden"],
    [404, { err: "Not found" }, "figma_file_not_found"],
    [429, {}, "figma_rate_limited"],
    [500, { message: "Provider detail must not escape" }, "figma_file_unavailable"],
  ])("maps HTTP %i without exposing provider text", (status, body, expected) => {
    expect(classifyFigmaApiError(status, body)).toBe(expected);
  });
});
