import { describe, expect, it } from "vitest";
import { resolveImportConfig } from "@/lib/import/column-map";

const rosterHeaders = [
  "E-mail", "Name", "Joined Date", "Last Test Date", "Tests Completed", "Gender", "Zip Code", "Country", "Age", "Tags",
  "Uddannelse", "Arbejdsstatus", "Bopæl", "Bil", "Opvarmningskilde", "Undersøgelsesformer", "[B2B] CVR-nummer",
  "Produkter og kunde hos OK", "[B2B] Branche", "[B2B] Produkter hos OK", "[B2B] Rolle", "[B2B] Antal medarbejdere",
  "[B2B] Digitale Kanaler", "[B2B] Udvidet brancetyper", "Type af mobiltelefon", "Boligtype", "Bæredygtigere strøm",
];

describe("panel import column mapping", () => {
  it("maps all 27 roster headers after database reset without reading row values", () => {
    const config = resolveImportConfig(rosterHeaders, []);
    expect(rosterHeaders).toHaveLength(27);
    expect(config.unmappedColumns).toEqual([]);
    expect(Object.values(config.mapping).filter(Boolean)).toHaveLength(27);
    expect(config.dedupRule).toBe("email");
    expect(config.mapping.Name).toBe("attr:full_name");
    expect(config.mapping["Zip Code"]).toBe("postal_code");
    expect(config.mapping.Boligtype).toBe("attr:boligtype");
    expect(config.mapping["[B2B] CVR-nummer"]).toBe("attr:b2b_cvr_nummer");
    expect(config.mapping["[B2B] Antal medarbejdere"]).toBe("attr:b2b_antal_medarbejdere");
  });

  it("maps consent evidence columns independently and surfaces unknown headers", () => {
    const config = resolveImportConfig([
      "Email",
      "survey_contact_status",
      "survey_contact_granted_at",
      "survey_contact_evidence_ref",
      "panel_membership_status",
      "panel_membership_withdrawn_at",
      "panel_membership_evidence_ref",
      "unreviewed_column",
    ], []);
    expect(config.mapping.survey_contact_status).toBe("consent:survey_contact.status");
    expect(config.mapping.panel_membership_status).toBe("consent:panel_membership.status");
    expect(config.unmappedColumns).toEqual(["unreviewed_column"]);
  });
});
