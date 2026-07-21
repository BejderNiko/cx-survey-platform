# ADR-002: Project-local PostgreSQL 16 instead of the Supabase Docker stack for local development

**Status:** accepted · 2026-07-16

## Context

The required stack names Supabase (Postgres, Auth, Storage, Queues) as the
system of record. The Supabase local stack requires a Docker daemon, which the
development environment used to build this milestone does not provide (no
`/var/run/docker.sock`). PostgreSQL 16 server binaries are available.

## Decision

- `scripts/dev-db.sh` runs a project-local PostgreSQL 16 cluster in
  `.dev/postgres` (port 54329), initialized and migrated from
  `supabase/migrations/*.sql` — plain SQL kept compatible with
  `supabase db push`.
- `supabase/local/auth_shim.sql` recreates exactly the Supabase surface our
  schema depends on: `auth.uid()` reading `request.jwt.claims`, and the
  `anon`/`authenticated`/`service_role` roles. It is applied only locally,
  never to a hosted project.
- Data access uses `postgres` (postgres.js) directly instead of `supabase-js`:
  the app role `cx_app` is RLS-subject, and every authenticated query runs in a
  transaction that sets the JWT claims — the same enforcement model PostgREST
  gives on hosted Supabase, testable locally.

## Consequences

- RLS tenant isolation is genuinely enforced and automatically tested locally.
- Cutover to hosted Supabase: run the same migrations via the CLI, replace the
  local credential auth with Supabase Auth (ADR-003), and either keep
  postgres.js against the Supabase connection pooler or move reads to
  supabase-js. The shim is discarded; `auth.uid()` exists natively.
- Supabase Storage/Realtime/Queues are not exercised locally; features that
  need them are labeled as later milestones rather than mocked invisibly.
