# Changelog

All notable changes to this project are documented here. This project has not
yet cut a versioned release; entries accumulate under **Unreleased**.

## [Unreleased]

### Local development

- **PGlite local database (permanent):** local development now runs on PGlite
  (PostgreSQL WASM) via `scripts/dev-db.mjs` — pure Node/WASM, binds only to
  `127.0.0.1:54329`, data under the gitignored `.dev/pglite/` — because native
  PostgreSQL, Docker, WSL, psql, and the Supabase CLI are unavailable on the
  target Windows machine. Pinned dev dependencies `@electric-sql/pglite@0.4.5`
  (PostgreSQL WASM runtime) and `@electric-sql/pglite-socket@0.1.5`
  (PostgreSQL wire protocol for the existing `postgres.js` clients). Commands:
  `pnpm db:init|db:start|db:stop|db:migrate|db:reset|db:status`; the native
  PostgreSQL manager remains available as `pnpm db:native:*` and stays the
  authoritative CI gate (`scripts/dev-db.sh`, unchanged).
- **Migration ledger:** local migrations are tracked in `_migrations` with
  SHA-256 checksums — reruns apply nothing, and a changed already-applied
  migration fails loudly instead of silently continuing. The local auth shim
  is applied first and never to hosted Supabase.
- **RLS in PGlite mode:** PGlite executes every socket connection as
  `postgres` regardless of the URL username, so `withUser(...)` now issues a
  static `SET LOCAL ROLE cx_app` inside authenticated transactions in local
  PGlite mode only (hosted/native paths unchanged). New tests assert
  `current_user = 'cx_app'` in user transactions and that the admin pool stays
  privileged (`apps/web/test/rls-role.test.ts`, shared helper in
  `apps/web/test/helpers/db.ts`).
- **Engine switch:** `LOCAL_DATABASE_ENGINE` (`pglite` local default,
  `native` for the dev-db.sh cluster). `pglite` is rejected on Vercel
  Preview/Production and under `NODE_ENV=production`; hosted fail-fast
  behavior (F5-001) is unchanged and covered by extended `env.test.ts`.
- **Seed without esbuild:** `pnpm seed` now runs through
  `scripts/run-ts.mjs` + `scripts/ts-loader-hooks.mjs` (pure-JS transpilation
  with the installed `typescript` package) instead of `tsx`, whose native
  esbuild binary can be blocked by Windows group policy. The seed refuses
  non-loopback database targets and hosted Vercel runtimes before its
  destructive cleanup. Deterministic output unchanged (seed 20260716).
- Docs: README quickstart, `.env.example`, `docs/architecture.md`,
  `docs/hosted-role-and-rls.md`, and new
  `docs/adr/008-pglite-local-development.md`.


Phase A remediation of verified findings from the Fable 5 architecture review
(`docs/fable5-review/`). Five review commits arrived through a verified local
handoff; no deploy, migration execution, or hosted change was performed.

### Security

- **F5-002 (hardening, drafted for staging):** Added
  `supabase/migrations/20260720000005_force_rls_data_tables.sql` applying
  `FORCE ROW LEVEL SECURITY` to 37 tenant data tables so a non-owner-role
  misconfiguration on hosted Supabase cannot silently bypass tenant isolation.
  Added a manual, secret-free hosted application-role provisioning script
  (`supabase/hosted/001_application_role.sql`), a staging-gated optional
  identity-table FORCE with a self-guard
  (`supabase/hosted/002_force_identity_tables_optional.sql`), a rollback script
  (`supabase/hosted/rollback.sql`), and the runbook `docs/hosted-role-and-rls.md`.
  postgres.js prepared statements are disabled for both pools so the documented
  Supavisor transaction-mode path is compatible. Not applied to any hosted project.

### Correctness

- **F5-001:** `apps/web/lib/env.ts` now fails fast on Vercel Preview/Production
  when `DATABASE_URL`, `DATABASE_ADMIN_URL`, `ANALYTICS_URL`, `APP_BASE_URL`,
  `SESSION_SECRET`, or `ANALYTICS_API_SECRET` is missing, and rejects loopback
  database/analytics targets on deployed Vercel. Errors name the variable and
  never leak its value. Local development defaults are unchanged. Pools
  (`lib/db.ts`) and the session secret (`lib/auth.ts`) are resolved lazily so
  `next build` never reads runtime-only variables.
- **F5-003:** Panel audience building no longer truncates candidates to 500 rows.
  `listPanelistIds` returns the full matching population (with an explicit
  hard-limit error, not silent truncation) and a new `resolveAudience` enforces
  the governance cap after full eligibility. "All" invitations no longer omit
  eligible panelists; "random" sampling draws uniformly from the full
  population; the recorded seed still reproduces the selection. Candidate count
  and IDs now come from one SQL snapshot, and random sample size/seed are
  validated server-side.

### Reliability

- **F5-006:** `runAnalysis` no longer holds a database transaction across the
  analytics HTTP call. The durable `analysis_runs` row is committed
  (`running`), the analytics service is called outside any transaction with a
  30s timeout, and the run is finalized in a separate org-scoped transaction so
  one tenant can never update another's run. A timeout is recorded as `failed`;
  a crash after the durable insert leaves a `running` row for reconciliation.
  The analytics client (`lib/analytics-client.ts`) now enforces the timeout
  (env-overridable) and maps it to a typed `504` error. Finalization now requires
  exactly one org-scoped row update, and database finalization errors are not
  mislabeled as analytics-service failures.

### Tests

- Added `apps/web/test/env.test.ts` (14): local defaults, hosted fail-fast,
  loopback rejection, import-time safety, lazy pools.
- Added `apps/web/test/audience.test.ts` (6): full-population count, unbiased
  seeded sampling, "all" coverage, governance-cap error, hard-limit error —
  exercised with 520 panelists (> the old 500 truncation).
- Added `apps/web/test/analytics-run.test.ts` (6): analytics client success /
  service-error / timeout, and durable-row + org-scoped-finalize sequencing.
- Added `apps/web/test/stubs/server-only.ts` and a vitest alias so server-only
  modules load under test.

### Documentation

- Added ADR-006 (import consent basis, F5-004) and ADR-007 (anonymization
  propagation to datasets, F5-005) — both decision-gated; no behavior changed.
- Corrected the stale test inventory in `docs/implementation-plan.md`
  (25/13/32 → 31/14/36) and the Python-version statement in
  `docs/architecture.md` (3.11 → 3.12) to match CI and README.

### Known limitations

- **F5-004 / F5-005** are decision-gated (ADR-006 / ADR-007): consent semantics
  and dataset anonymization propagation are NOT changed pending owner/DPO
  decisions.
- **F5-002** identity-table FORCE and hosted-role provisioning are drafted and
  locally verified only; the hosted `postgres` `rolbypassrls` question and the
  privileged PostgreSQL login behind `DATABASE_ADMIN_URL` are unresolved until
  staging (see `docs/hosted-role-and-rls.md` steps 4–6).
- Findings F5-007..F5-021 (Minor/Nit) are out of Phase A scope except the two
  documentation corrections above.
