import { describe, expect, it } from "vitest";
import { validateRows } from "@/lib/import/validate";

const mapping = {
  ID: "external_id",
  Email: "email",
  Navn: "first_name",
  År: "birth_year",
  Sprog: "language",
  Region: "attr:region",
};

describe("import validation", () => {
  it("normalizes valid rows including attributes", () => {
    const res = validateRows(
      [{ ID: "X1", Email: "A@Example.INVALID", Navn: "Karla", "År": "1988", Sprog: "DA", Region: "Nordjylland" }],
      mapping,
      "external_id",
    );
    expect(res.errors).toHaveLength(0);
    expect(res.valid[0].fields.email).toBe("a@example.invalid");
    expect(res.valid[0].fields.birth_year).toBe(1988);
    expect(res.valid[0].fields.language).toBe("da");
    expect(res.valid[0].attributes.region).toBe("Nordjylland");
  });

  it("rejects invalid emails and birth years with row numbers", () => {
    const res = validateRows(
      [
        { ID: "X1", Email: "not-an-email", Navn: "A", "År": "1988", Sprog: "da", Region: "" },
        { ID: "X2", Email: "ok@example.invalid", Navn: "B", "År": "1850", Sprog: "da", Region: "" },
      ],
      mapping,
      "external_id",
    );
    expect(res.valid).toHaveLength(0);
    expect(res.errors.map((e) => e.rowNumber)).toEqual([2, 3]); // header = row 1
  });

  it("skips duplicates within the file by dedup key", () => {
    const res = validateRows(
      [
        { ID: "X1", Email: "a@example.invalid", Navn: "A", "År": "", Sprog: "", Region: "" },
        { ID: "X1", Email: "b@example.invalid", Navn: "B", "År": "", Sprog: "", Region: "" },
      ],
      mapping,
      "external_id",
    );
    expect(res.valid).toHaveLength(1);
    expect(res.duplicatesInFile).toBe(1);
  });

  it("requires the dedup key column to be mapped", () => {
    const res = validateRows([{ Email: "a@example.invalid" }], { Email: "email" }, "external_id");
    expect(res.valid).toHaveLength(0);
    expect(res.errors[0].message).toContain("requires mapping");
  });

  it("rejects rows with neither email nor external id", () => {
    const res = validateRows([{ Navn: "Anon" }], { Navn: "first_name" }, "none");
    expect(res.errors[0].message).toContain("neither an email nor an external ID");
  });
});
