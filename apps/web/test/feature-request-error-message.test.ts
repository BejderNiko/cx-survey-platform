import { describe, expect, it } from "vitest";
import { featureRequestErrorMessage } from "@/app/(app)/feature-requests/error-message";

describe("feature request error messages", () => {
  it("maps missing schema without exposing a database error", () => {
    expect(featureRequestErrorMessage({ code: "42P01", message: "relation feature_requests does not exist" }))
      .toBe("Feature request storage is not available in this environment.");
  });

  it("maps authorization failure to an actionable message", () => {
    expect(featureRequestErrorMessage({ code: "42501" }))
      .toBe("You do not have permission to change feature requests.");
  });

  it("never returns an unexpected server error", () => {
    expect(featureRequestErrorMessage(new Error("password=should-not-reach-client")))
      .toBe("Feature request could not be saved. Try again or contact an administrator.");
  });
});
