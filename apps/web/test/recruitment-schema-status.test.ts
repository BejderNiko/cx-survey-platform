import { describe, expect, it } from "vitest";
import { recruitmentSchemaMessage } from "@/app/(app)/panel/recruitment/schema-status";

describe("recruitment schema status", () => {
  it("maps missing schema to safe Danish guidance", () => {
    expect(recruitmentSchemaMessage({ code: "42703", message: "column source_key does not exist" }))
      .toBe("Rekruttering er ikke klar i dette miljø endnu. Kontakt en administrator for schema-status.");
  });

  it("does not expose an unexpected database error", () => {
    expect(recruitmentSchemaMessage(new Error("relation recruitment_pages does not exist"))).toBeNull();
  });
});
