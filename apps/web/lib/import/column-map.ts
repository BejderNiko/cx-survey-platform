import type { DedupRule, ImportMapping } from "./validate";

/** Fixed import policy: first known column wins; custom fields use exact normalized keys. */
const DEFAULT_COLUMN_MAP: Record<string, string> = {
  external_id: "external_id", externalid: "external_id", ekstern_id: "external_id", kunde_id: "external_id", kundenummer: "external_id", customer_id: "external_id", id: "external_id",
  first_name: "first_name", firstname: "first_name", fornavn: "first_name",
  last_name: "last_name", lastname: "last_name", efternavn: "last_name",
  email: "email", mail: "email", e_mail: "email", emailadresse: "email",
  phone: "phone", telefon: "phone", mobile: "phone",
  language: "language", sprog: "language", locale: "language",
  birth_year: "birth_year", birthyear: "birth_year", foedselsaar: "birth_year",
  gender: "gender", koen: "gender",
  city: "city", by: "city",
  postal_code: "postal_code", zip: "postal_code", zip_code: "postal_code", postnummer: "postal_code",
  country: "country", land: "country",
  customer_status: "customer_status", status: "customer_status",
  recruitment_source: "recruitment_source", source: "recruitment_source",
  tags: "tags", tag: "tags", labels: "tags",
  survey_contact_status: "consent:survey_contact.status", survey_contact_consent_status: "consent:survey_contact.status",
  survey_contact_granted_at: "consent:survey_contact.granted_at",
  survey_contact_withdrawn_at: "consent:survey_contact.withdrawn_at",
  survey_contact_evidence_ref: "consent:survey_contact.evidence_ref", survey_contact_consent_evidence_ref: "consent:survey_contact.evidence_ref",
  panel_membership_status: "consent:panel_membership.status", panel_membership_consent_status: "consent:panel_membership.status",
  panel_membership_granted_at: "consent:panel_membership.granted_at",
  panel_membership_withdrawn_at: "consent:panel_membership.withdrawn_at",
  panel_membership_evidence_ref: "consent:panel_membership.evidence_ref", panel_membership_consent_evidence_ref: "consent:panel_membership.evidence_ref",
  "[b2b]_cvr_nummer": "attr:b2b_cvr_nummer",
  "[b2b]_branche": "attr:b2b_branche",
  "[b2b]_produkter_hos_ok": "attr:b2b_produkter_hos_ok",
  "[b2b]_rolle": "attr:b2b_rolle",
  "[b2b]_antal_medarbejdere": "attr:b2b_antal_medarbejdere",
  "[b2b]_digitale_kanaler": "attr:b2b_digitale_kanaler",
  "[b2b]_udvidet_brancetyper": "attr:b2b_udvidet_brancetyper",
};

const DEFAULT_ATTRIBUTE_MAP: Record<string, string> = {
  name: "attr:full_name",
  age: "attr:age", alder: "attr:age",
  joined_date: "attr:joined_date", joineddate: "attr:joined_date",
  last_test_date: "attr:last_test_date", lasttestdate: "attr:last_test_date",
  tests_completed: "attr:tests_completed", testscompleted: "attr:tests_completed",
  uddannelse: "attr:uddannelse", education: "attr:uddannelse",
  arbejdsstatus: "attr:arbejdsstatus", employment_status: "attr:arbejdsstatus",
  bopael: "attr:bopael", residence: "attr:bopael",
  bil: "attr:bil", car: "attr:bil",
  opvarmningskilde: "attr:opvarmningskilde", heating_source: "attr:opvarmningskilde",
  undersoegelsesformer: "attr:undersoegelsesformer", survey_formats: "attr:undersoegelsesformer",
  produkter_og_kunde_hos_ok: "attr:produkter_og_kunde_hos_ok", products_and_customer_at_ok: "attr:produkter_og_kunde_hos_ok",
  type_af_mobiltelefon: "attr:type_af_mobiltelefon", mobile_phone_type: "attr:type_af_mobiltelefon",
  boligtype: "attr:boligtype", housing_type: "attr:boligtype",
  baeredygtigere_stroem: "attr:baeredygtigere_stroem", sustainable_power: "attr:baeredygtigere_stroem",
};

export function normalizeImportColumn(column: string): string {
  return column.trim().toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

export function resolveImportConfig(columns: string[], customKeys: Iterable<string>): {
  mapping: ImportMapping;
  dedupRule: DedupRule;
  unmappedColumns: string[];
} {
  const existingKeys = new Set(customKeys);
  const usedTargets = new Set<string>();
  const mapping: ImportMapping = {};
  const unmappedColumns: string[] = [];
  for (const column of columns) {
    const normalized = normalizeImportColumn(column);
    const target = DEFAULT_COLUMN_MAP[normalized]
      ?? DEFAULT_ATTRIBUTE_MAP[normalized]
      ?? (existingKeys.has(normalized) ? `attr:${normalized}` : "");
    mapping[column] = target && !usedTargets.has(target) ? target : "";
    if (mapping[column]) usedTargets.add(target);
    else unmappedColumns.push(column);
  }
  const dedupRule: DedupRule = usedTargets.has("external_id") ? "external_id" : "email";
  return { mapping, dedupRule, unmappedColumns };
}
