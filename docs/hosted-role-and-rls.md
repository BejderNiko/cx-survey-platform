# Hosted database role & RLS hardening (F5-002)

Status: draft for staging. **No hosted change has been applied.** This document
plus the SQL in `supabase/hosted/` and the migration
`supabase/migrations/20260720000005_force_rls_data_tables.sql` are the reviewed
assets for giving the hosted application a least-privileged, RLS-subject
database role and closing the "owner bypasses RLS" gap.

## 1. Problem recap

The tenant boundary is PostgreSQL RLS. Before this change RLS was `ENABLE`d but
not `FORCE`d, and no hosted login role was defined. On hosted Supabase:

- The `postgres` role is **not a superuser** (Supabase demoted it) and is the
  **owner** of every table created by migrations.
- A non-superuser **table owner bypasses `ENABLE`d-but-not-`FORCE`d RLS** on the
  tables it owns (standard PostgreSQL rule).
- `service_role` carries `BYPASSRLS`; `authenticated`/`anon` are NOLOGIN roles
  used by PostgREST.

So if the web app's `DATABASE_URL` were pointed at the project through the
`postgres` role (the obvious default), **every tenant policy would be silently
bypassed** — no error, invisible in functional testing. That is F5-002.

Sources consulted (2026-07):
Supabase "Postgres Roles", "Roles, superuser access and unsupported operations",
"Row Level Security"; PostgreSQL 5.9 "Row Security Policies" (table-owner bypass
and `FORCE ROW LEVEL SECURITY`); Supabase Supavisor connection docs
(transaction-mode pooler on port 6543, `role.<project_ref>` username form).

## 2. The two controls

1. **Dedicated non-owner application login role** (`cx_app_hosted`) — the
   primary control. It owns nothing, has no `BYPASSRLS`, and is a member of
   `authenticated`. RLS therefore always applies to it, exactly as local
   `cx_app` proves in `apps/web/test/tenant-isolation.test.ts`.
   Provisioning: `supabase/hosted/001_application_role.sql` (no secret in SQL).

2. **`FORCE ROW LEVEL SECURITY` on data tables** — defense-in-depth so that even
   an accidental owner-privileged connection is filtered.
   Migration: `20260720000005_force_rls_data_tables.sql` (37 data tables).

The identity tables `memberships`, `users`, `organizations` are **not** forced
by the migration — see step 5.

## 3. Provisioning order (staging first, then production)

Use a **direct / session-mode** connection (port 5432) as `postgres` for DDL.

1. Apply all `supabase/migrations/*.sql` via the Supabase CLI (includes the
   data-table FORCE). Never edit remote schema by hand.
2. Run `supabase/hosted/001_application_role.sql`.
3. Set the role password through an approved interactive or secret-manager
   workflow (≥ 32 random bytes). With interactive `psql`, use
   `\password cx_app_hosted` so the value does not enter shell history, process
   arguments, repository files, or logs. Store it only in the password manager
   and Vercel `DATABASE_URL`.
4. Point the web app's `DATABASE_URL` at `cx_app_hosted` through the
   **transaction-mode pooler** (port 6543), username `cx_app_hosted.<project_ref>`.
   postgres.js sets `prepare: false` for this pool because Supavisor transaction
   mode does not support session-bound prepared statements.
5. Resolve `DATABASE_ADMIN_URL` before staging runtime tests. It must be a
   PostgreSQL connection string for an explicitly approved privileged database
   login. A Supabase secret/service-role API key is not a PostgreSQL URL. Phase A
   does not provision this login; do not substitute the project-owner `postgres`
   credential in Vercel without a separate least-privilege review.

## 4. Verification (the staging gate)

Run against staging, over the **same role and pooler mode the app uses**:

- **Tenant isolation through the app role.** After both database login designs
  are approved, point `DATABASE_URL` / `DATABASE_ADMIN_URL` at staging and run
  `pnpm --filter @ok/web test` — the 8 `tenant-isolation`, 6 `audience`, and 3
  durable-analysis-row assertions must pass unchanged.
- **`current_org_ids()` resolves.** As `cx_app_hosted` with a real member's
  claims, `select count(*) from organizations` returns exactly that member's
  org(s); with no claims it returns 0.
- **FORCE is present.** `select count(*) filter (where relforcerowsecurity)
  from pg_class where relnamespace='public'::regnamespace and relkind='r'`
  returns 37 (or 40 after step 5).

Fable reported local disposable-cluster verification with data-table FORCE
applied: all 40 web tests passed, including 17 database-backed assertions, and
a `cx_app` request saw exactly one tenant's rows (1 org / 250 panelists / 6
memberships). Codex has not rerun the migration locally because migration
execution requires explicit approval.

## 5. UNRESOLVED — forcing the identity tables (staging decision)

`memberships`, `users`, `organizations` are read by the `SECURITY DEFINER`
helper `current_org_ids()` that every policy calls. Forcing RLS on them is safe
**only if the helper's owner bypasses RLS** — otherwise the helper becomes
subject to the policy that calls it and recurses / locks out all reads.

- Locally the owner is a superuser, so forcing them is safe (demonstrated).
- On hosted, the owner is the non-superuser `postgres`. Whether it retains the
  `rolbypassrls` attribute **must be confirmed on staging** — it cannot be
  verified from here without connecting to a project.

Staging check:
```sql
select rolname, rolbypassrls
from pg_roles
where rolname = (
  select r.rolname from pg_class c join pg_roles r on r.oid = c.relowner
  where c.oid = 'public.memberships'::regclass);
```
- If `rolbypassrls = true`: apply
  `supabase/hosted/002_force_identity_tables_optional.sql` (it re-checks the
  same guard and refuses otherwise) for full owner-connection coverage.
- If `rolbypassrls = false`: **do not force these tables.** Keep them ENABLEd;
  the non-owner `cx_app_hosted` role is already fully constrained. Record the
  residual (an owner connection could read identity tables) as an accepted risk
  mitigated by the dedicated-role control, and raise with Supabase whether the
  helper may instead be owned by a `BYPASSRLS` role.

This is the one item that stays **unresolved until staging** per the Phase A
boundary; no SQL was invented to force the outcome.

## 6. Privileged / service boundary

`DATABASE_ADMIN_URL` is consumed by postgres.js and therefore must contain a
PostgreSQL connection string, not a Supabase API secret/service-role key. The
current code uses this privileged pool only for identity administration and the
token-validated anonymous respondent flow (`apps/web/lib/data/respondent.ts`),
never for authenticated app commands.

Phase A does not yet define the hosted database login behind this URL. Staging
remains blocked until a least-privileged database-role design is approved and
tested, or these paths are migrated to a separately configured Supabase admin
client. `current_org_ids()` remains `SECURITY DEFINER` with
`search_path = public`.

## 7. Failure recovery

- **Lockout after forcing identity tables** (reads return empty for everyone):
  the helper owner does not bypass RLS. Immediately run the identity-table
  section of `supabase/hosted/rollback.sql` (`no force row level security`),
  then fall back to ENABLE-only per step 5. The dedicated role keeps isolation
  intact meanwhile.
- **App cannot connect as `cx_app_hosted`**: verify the password was set, the
  pooler username is `cx_app_hosted.<project_ref>`, and port 6543 is used.
  Until fixed, do NOT revert `DATABASE_URL` to a `postgres`/owner connection —
  that would reintroduce F5-002.

## 8. Rollback

`supabase/hosted/rollback.sql` unforces identity tables, then data tables, then
decommissions the role (it owns nothing, so no reassignment is needed). RLS
policies remain in place throughout, so tenant isolation for the non-owner role
is never dropped during rollback. Run only after `DATABASE_URL` no longer
targets `cx_app_hosted`. This manual rollback creates migration-ledger drift:
migration `20260720000005` remains recorded as applied while FORCE is removed.
Record and repair that drift through a reviewed forward migration before later
deployments.

## 9. What remains OK-owned

Region, plan (PITR/backup tier), and whether Supabase permits owning
`current_org_ids()` by a `BYPASSRLS` role are OK/Supabase decisions and gate the
step-5 outcome.

## Local PGlite note (development only)

Local development uses PGlite via `scripts/dev-db.mjs`. PGlite's socket server
executes **every** connection as the `postgres` superuser regardless of the
username in the connection URL, so the local `cx_app` login role cannot be the
RLS subject there the way it is on native PostgreSQL and hosted Supabase.
Mitigation (local only): `withUser(...)` in `apps/web/lib/db.ts` executes the
static, non-parameterized statement `SET LOCAL ROLE cx_app` inside every
authenticated transaction before `set_config('request.jwt.claims', ...)`. The
role reverts automatically at COMMIT/ROLLBACK; the admin pool stays privileged
and unchanged. The hosted and native paths never run this branch — there the
login role itself (`cx_app` locally, `cx_app_hosted` hosted) is the subject.

`apps/web/test/rls-role.test.ts` and the shared test helper
(`apps/web/test/helpers/db.ts`) assert `current_user = 'cx_app'` inside user
transactions, so RLS checks can never false-pass while unintentionally
executing as `postgres`. Native PostgreSQL in CI remains the authoritative
proof of real login-role behavior; nothing in this section changes any hosted
control described above.
