# ADR-006: Import consent basis (F5-004) — decision required, fail-closed recommended

**Status:** proposed · 2026-07-20 · blocks real-data import
**Owner decision required:** Product owner + DPO

## Context

The panel import commit (`apps/web/app/(app)/panel/import/actions.ts`) currently
writes, for every **created** panelist, two `consent_records` rows —
`survey_contact` and `panel_membership` — both `status = 'granted'` with
`granted_at = now()` and `source = 'import:<filename>'`, regardless of any
consent information in the source file. There is no consent target field in the
import mapping (`apps/web/lib/import/validate.ts` `TARGET_FIELDS`), and the
wizard's `consentConfirmed` checkbox is a single operator attestation, stored
nowhere per row.

This is acceptable **only** under the current synthetic-data-only rule (all
seed/import data is `example.invalid`). It is not acceptable for the real import
workflow the platform is meant to provide: it fabricates consent evidence,
back-dates it to import time, and would let `applyGovernance` authorize contact
based on consent the data subject may never have given. Downstream (distribution
eligibility) trusts these rows.

No code behavior is changed by this ADR. Real-consent semantics must not be
invented before the decisions below are made.

## Decisions required

1. **Legal basis** for holding and contacting imported panelists (consent vs.
   legitimate interest vs. contract) — per purpose.
2. **Per-row consent status** source: which column(s) map to `survey_contact`
   and `panel_membership`, and their allowed values.
3. **Original consent timestamp**: must the source provide the real
   `granted_at`/`withdrawn_at`, or is import time acceptable and on what basis.
4. **Provenance**: required `source` granularity (system, campaign, document ref).
5. **Unmapped consent treatment** (the key safety choice).
6. Whether `survey_contact` and `panel_membership` can ever be co-granted from a
   single signal or must be independent.

## Recommendation (fail-closed)

- Add explicit consent mapping targets (status + timestamp + source per purpose)
  to `TARGET_FIELDS` and the wizard.
- **Unmapped or unrecognized consent must NOT become `granted`.** Default to no
  `survey_contact` consent row (or an explicit `status = 'unknown'`), so
  `applyGovernance` excludes the panelist from contact until consent is
  positively recorded.
- Preserve the source `granted_at` when provided; never back-date silently.
- Keep the operator attestation as an audit annotation, not as a substitute for
  per-row consent.
- Block distribution eligibility for panelists whose consent is unmapped.

## Consequences

- Real imports become safe by default (no contact without recorded consent).
- Requires a schema-compatible mapping addition and a validation change; both
  are additive and testable with the existing dry-run/commit machinery.
- Until implemented, Preview/Production must stay blocked from real-data import.
  The current UI does not enforce a synthetic-only guard; deployment controls
  and product documentation must carry this gate.
