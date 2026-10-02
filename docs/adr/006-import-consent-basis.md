# ADR-006: Import consent basis (F5-004)

**Status:** explicit import mapping implemented · 2026-09-30 · evidence review remains external

## Context

The previous import implementation created `survey_contact` and
`panel_membership` grants for every created panelist, with import time and
filename as fabricated consent evidence. The import now accepts separate
per-purpose status, source timestamp, and opaque evidence-reference fields.
Missing fields create no consent record. Partial or invalid values reject the
row. The operator checkbox does not create consent records.

Timestamps must be ISO-8601 with an explicit offset. `granted` requires the
original grant time and evidence reference. `withdrawn` requires withdrawal
time and evidence reference; original grant time is preserved when supplied.
Import time is never substituted for the source timestamp. Reimport updates the
existing records for that purpose so a withdrawal cannot leave an older grant
active for distribution eligibility.

Evidence references are opaque text. The application does not open or verify
referenced documents, determine that a document covers both purposes, or decide
the legal basis for holding/contacting panelists. Owners must review those
matters outside the import flow.

## Decisions still requiring an owner

1. **Legal basis** for holding and contacting imported panelists, per purpose.
2. Whether one evidence reference may support both purposes or each purpose
   needs a separate reference.
3. Where evidence is retained and how long its reference must remain resolvable
   for audit.

## Implemented fail-closed behavior

- Unmapped consent never becomes `granted`; `applyGovernance` excludes panelists
  without a granted `survey_contact` row.
- `survey_contact` and `panel_membership` statuses import independently.
- Invalid or partial consent fields fail row validation without echoing
  evidence-reference values in errors.
- Reimport updates current purpose rows; an explicit withdrawal removes the
  granted state used by distribution eligibility.
- Import results expose aggregate counts only, never evidence references.

## Consequences

- Database schema is unchanged.
- A valid evidence reference does not itself prove legal consent. Preview and
  Production imports still require owner review that references resolve to
  documentation covering each granted purpose.
- Rows without consent fields can be imported, but remain ineligible for
  survey contact unless valid consent is separately recorded.
