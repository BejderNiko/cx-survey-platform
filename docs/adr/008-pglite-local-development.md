# ADR-008: PGlite as the permanent local development database

Status: accepted (2026-07)

## Context

The primary development machine is a Windows PC under restrictive group
policy: native/local PostgreSQL, Docker, WSL, psql, the Supabase CLI, and
downloaded native executables are unavailable, and native esbuild / child
process spawning can fail with `EPERM`. Only Node, pure JavaScript/WASM, and
an installed signed Chrome are reliably usable. ADR-002's project-local native
PostgreSQL 16 cluster (`scripts/dev-db.sh`) therefore cannot run there.

The architecture is locked: hosted staging/production on Supabase managed
PostgreSQL, Next.js on Vercel, FastAPI analytics, PostgreSQL RLS as the tenant
boundary. Replacing PostgreSQL (SQLite, MongoDB, …) is out of scope.

## Decision

- Local development and local database tests run on **PGlite**
  (`@electric-sql/pglite` 0.4.5 — PostgreSQL compiled to WebAssembly) with
  **`@electric-sql/pglite-socket`** 0.1.5 exposing the PostgreSQL wire
  protocol on `127.0.0.1:54329`, so the existing `postgres.js` clients (app,
  seed, tests) connect unchanged. Manager: `scripts/dev-db.mjs`
  (init/start/stop/migrate/reset/status), data under `.dev/pglite/` only.
- `pgcrypto` and `citext` are loaded as PGlite extensions; the local auth shim
  plus the `supabase/migrations/*.sql` files apply unmodified, tracked in a
  `_migrations` ledger with SHA-256 checksums (idempotent reruns; edited
  applied migrations fail loudly).
- **Native PostgreSQL 16 in Linux CI remains the authoritative database
  gate** (`scripts/dev-db.sh`, database `cx_platform`, `db:native:*` scripts):
  it proves real login-role and PostgreSQL behavior that WASM cannot.
- Hosted staging/production stay on Supabase managed PostgreSQL. The engine
  switch `LOCAL_DATABASE_ENGINE` (`pglite` default locally, `native` in CI)
  is rejected as `pglite` on Vercel Preview/Production and under
  `NODE_ENV=production`.
- The deterministic seed runs through `scripts/run-ts.mjs`, a pure-JS
  TypeScript runner built on the installed `typescript` package
  (`transpileModule` + Node module-customization hooks), replacing `tsx`,
  whose native esbuild binary is blocked on the target machine.

## The RLS caveat and its mitigation

PGlite's socket server executes every connection as the `postgres` superuser
regardless of the username in the connection URL, so
`postgres://cx_app@…` does **not** by itself subject queries to RLS in PGlite.
Mitigation (local PGlite mode only): `withUser(...)` executes the static
statement `SET LOCAL ROLE cx_app` inside each authenticated transaction before
setting `request.jwt.claims`. Tests assert `current_user = 'cx_app'` in user
transactions and fail if a transaction unintentionally remains `postgres`
(`apps/web/test/rls-role.test.ts`, `apps/web/test/helpers/db.ts`). Hosted and
native paths never execute the role switch.

## Consequences

- Zero-install local database on locked-down Windows; `.dev/` stays fully
  disposable synthetic data.
- One PGlite instance serves all connections: queries are serialized and an
  open transaction on one connection briefly blocks others (accepted for
  single-developer use; vitest runs database test files serially in PGlite
  mode).
- PGlite (PostgreSQL 17.x WASM) is not byte-identical to hosted PostgreSQL;
  anything role-, performance-, or concurrency-sensitive must be trusted only
  from the native CI gate and hosted staging.
- Local database name differs by engine (`postgres` for PGlite,
  `cx_platform` for native); `lib/env.ts` supplies engine-aware defaults and
  CI pins `LOCAL_DATABASE_ENGINE=native` plus explicit URLs.
