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
const consentMapping = {
  ID: "external_id",
  Email: "email",
  ContactStatus: "consent:survey_contact.status",
  ContactGrantedAt: "consent:survey_contact.granted_at",
  ContactWithdrawnAt: "consent:survey_contact.withdrawn_at",
  ContactEvidence: "consent:survey_contact.evidence_ref",
  MembershipStatus: "consent:panel_membership.status",
  MembershipGrantedAt: "consent:panel_membership.granted_at",
  MembershipWithdrawnAt: "consent:panel_membership.withdrawn_at",
  MembershipEvidence: "consent:panel_membership.evidence_ref",
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

  it("does not infer consent when per-purpose consent fields are absent", () => {
    const res = validateRows(
      [{ ID: "X1", Email: "a@example.invalid" }],
      { ID: "external_id", Email: "email" },
      "external_id",
    );
    expect(res.errors).toHaveLength(0);
    expect(res.valid[0].consents).toBeUndefined();
  });

  it("validates and normalizes each purpose independently with offset timestamps", () => {
    const res = validateRows([{
      ID: "X1",
      Email: "a@example.invalid",
      ContactStatus: " GRANTED ",
      ContactGrantedAt: "2026-07-22T10:30:00+02:00",
      ContactWithdrawnAt: "",
      ContactEvidence: "consent-register:row-001",
      MembershipStatus: "withdrawn",
      MembershipGrantedAt: "2026-06-01T09:00:00Z",
      MembershipWithdrawnAt: "2026-07-23T13:00:00-04:00",
      MembershipEvidence: "membership-archive:record-001",
    }], consentMapping, "external_id");
    expect(res.errors).toHaveLength(0);
    expect(res.valid[0].consents).toEqual({
      survey_contact: {
        status: "granted",
        grantedAt: "2026-07-22T10:30:00+02:00",
        withdrawnAt: null,
        evidenceRef: "consent-register:row-001",
      },
      panel_membership: {
        status: "withdrawn",
        grantedAt: "2026-06-01T09:00:00Z",
        withdrawnAt: "2026-07-23T13:00:00-04:00",
        evidenceRef: "membership-archive:record-001",
      },
    });
  });

  it("rejects incomplete, unsupported, and malformed consent evidence without echoing values", () => {
    const res = validateRows([
      { ID: "X1", Email: "a@example.invalid", ContactStatus: "granted", ContactGrantedAt: "2026-07-22T10:30:00", ContactEvidence: "ref" },
      { ID: "X2", Email: "b@example.invalid", ContactStatus: "granted", ContactGrantedAt: "2026-02-30T10:30:00Z", ContactEvidence: "ref" },
      { ID: "X3", Email: "c@example.invalid", ContactStatus: "expired", ContactGrantedAt: "2026-07-22T10:30:00Z", ContactEvidence: "ref" },
      { ID: "X4", Email: "d@example.invalid", ContactEvidence: "ref-without-status" },
      { ID: "X5", Email: "e@example.invalid", ContactStatus: "withdrawn", ContactWithdrawnAt: "2026-07-22T10:30:00Z", ContactEvidence: "" },
    ], consentMapping, "external_id");
    expect(res.valid).toHaveLength(0);
    expect(res.errors).toHaveLength(5);
    expect(res.errors.every((error) => !error.message.includes("ref"))).toBe(true);
  });
});
