# ADR-005: Dataset versions stored as inline JSONB; Parquet as the scale path

**Status:** accepted · 2026-07-16

## Decision

`dataset_versions.rows` stores the wide, analysis-ready rows as a JSONB array
next to the `variables` metadata table (labels, types, measurement levels,
value labels, missing rules). The analytics service is stateless and receives
the full payload per request.

## Rationale

Survey datasets here are small (the seeded flagship is 94×12; realistic OK
studies are thousands of rows). Inline storage keeps versioning, lineage, and
tenant isolation in one transactional system, and avoids standing up object
storage in an environment without the Supabase stack.

## Consequences

- Simple, atomic dataset versioning with RLS applying to data and metadata.
- Documented limits: JSONB payloads beyond ~50 MB will hurt; the upgrade path
  is materializing versions as Parquet in private Supabase Storage with
  signed URLs (the `storage_kind` concept is already in the design) and
  letting the analytics service read Parquet directly (PyArrow/DuckDB are in
  the dependency set).
