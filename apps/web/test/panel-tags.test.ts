import { describe, expect, it } from "vitest";
import { parseTags, validateRows } from "@/lib/import/validate";

describe("panel import tags", () => {
  it("splits, trims, lowercases, and deduplicates tag cells", () => {
    expect(parseTags("VIP; New, vip | Test\nnew")).toEqual(["vip", "new", "test"]);
  });

  it("keeps Tags distinct from panel fields and preserves empty mapped Tags", () => {
    const result = validateRows(
      [
        { external_id: "P-1", email: "p1@example.invalid", Tags: "VIP;test" },
        { external_id: "P-2", email: "p2@example.invalid", Tags: "" },
      ],
      { external_id: "external_id", email: "email", Tags: "tags" },
      "external_id",
    );

    expect(result.errors).toEqual([]);
    expect(result.valid[0].tags).toEqual(["vip", "test"]);
    expect(result.valid[1].tags).toEqual([]);
    expect(result.valid[0].fields).not.toHaveProperty("tags");
  });
});