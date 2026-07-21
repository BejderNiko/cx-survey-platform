# ADR-007: Anonymization propagation to derived datasets (F5-005) — decision required

**Status:** proposed · 2026-07-20 · blocks Production
**Owner decision required:** DPO + Product owner

## Context

`anonymizePanelist` (`apps/web/app/(app)/panel/actions.ts`) irreversibly scrubs
identity fields and unlinks operational rows: it nulls `responses.panelist_id`,
revokes consent, deletes notes/attributes/tags, revokes invitation tokens, and
redacts outbox messages. It does **not** touch dataset versions.

`buildStudyDataset` (`apps/web/lib/data/datasets.ts`) builds wide analysis rows
with `includePanelist: true` unconditionally, so any `dataset_versions` built
**before** anonymization permanently retain, keyed by the per-response
`respondent_key`:

- `panelist_gender`, `panelist_birth_year`, `panelist_customer_status`
- all free-text answers.

The direct `panelist_id` link is broken (good), but gender + birth year +
customer status + free text are **quasi-identifiers** in a small panel and carry
real re-identification risk. This contradicts `docs/architecture.md` ("PII lives
only [in the panel boundary]") and the product prompt's "break link irreversibly
when required."

`docs/architecture.md` now records this limitation regardless of the option
chosen; retained-data behavior remains unchanged. No dataset data is rewritten or deleted by
this ADR — destructive changes to retained versions are gated on the decision
below.

## Decisions required

1. **Derived-data retention policy**: are dataset versions immutable research
   artifacts, or subject to anonymization propagation?
2. Treatment of **demographic quasi-identifiers** in datasets (retain / drop /
   coarsen, e.g. birth year → age band).
3. Treatment of **free-text** answers on anonymization (retain / scrub / review).
4. Reconciling **research reproducibility** (immutable versions) with the
   erasure obligation.
5. **Audit and rollback** consequences of scrubbing retained versions.

## Options

- **A — Scrub on anonymize (recommended default).** On anonymize, null the
  panelist-demographic columns (and optionally free text) in retained
  `dataset_versions` for rows whose `respondent_key` maps to the panelist's
  responses; write an audit event. Pro: honors erasure; keeps row counts and
  numeric answers for reproducibility. Con: mutates "immutable" versions —
  record the scrub in lineage so reproducibility is auditable.
- **B — Make `includePanelist` an explicit per-dataset choice**, default off,
  with a documented retention window; combine with A for already-built versions.
- **C — Rebuild affected versions** excluding the panelist. Cleaner lineage,
  higher cost, changes historical row counts.
- **D — Restricted retention**: move demographics to a separately
  access-controlled column set purged on anonymize.

## Recommendation

Adopt **A + B**: stop defaulting `includePanelist` to on for new datasets (B),
and scrub demographic quasi-identifiers (and free text per DPO decision) from
retained versions on anonymize (A), recorded in lineage and audit. Correct
`docs/architecture.md` to state that datasets may carry pseudonymous
quasi-identifiers until anonymization propagation runs.

## Consequences

- Closes the anonymization gap for both future and already-built datasets.
- Requires a DPO ruling on free-text handling and on mutating immutable versions
  before any code change; until then the gap is a documented Production blocker
  and `architecture.md` must not claim complete PII isolation.
