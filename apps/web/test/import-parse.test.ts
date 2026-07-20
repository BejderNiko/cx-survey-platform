import { describe, expect, it } from "vitest";
import { IMPORT_LIMITS, parseImportFile } from "../lib/import/parse";

describe("import parser limits", () => {
  it("rejects CSV files above the row limit instead of truncating", async () => {
    const rows = Array.from(
      { length: IMPORT_LIMITS.maxRows + 1 },
      (_, index) => `${index + 1},person${index + 1}@example.invalid`,
    );
    const csv = Buffer.from(["external_id,email", ...rows].join("\n"), "utf8");

    await expect(parseImportFile(csv, "panel.csv")).rejects.toThrow(
      `maximum is ${IMPORT_LIMITS.maxRows}`,
    );
  });
});
