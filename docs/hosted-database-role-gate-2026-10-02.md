# Hosted database role and Vercel configuration gate — 2026-10-02

## Decision

**NO-GO for Preview runtime verification and Production promotion.** The latest
Preview runtime log reports:

```text
DATABASE_URL must use the RLS-enforced application role, not an owner or service role.
```

Read-only Supabase inspection found `cx_app_hosted` on Preview with `LOGIN`,
`BYPASSRLS = false`, membership in `authenticated`, and `SELECT` access to
`public.studies` and `public.feature_requests`. Preview password and Vercel URL
configuration remain unknown. Production has no `cx_app_hosted` role. Do not
infer either environment is fixed until each scope passes the gates below.

No hosted SQL, Vercel configuration, credential, deployment, or database data
was changed for this gate.

## Required configuration by environment

| Scope | `DATABASE_URL` | `DATABASE_ADMIN_URL` | Required action |
|---|---|---|---|
| Vercel Preview | Supabase Preview transaction pooler (port `6543`), username `cx_app_hosted.<preview-project-ref>` | Separate server-only PostgreSQL URL for an approved privileged login; must differ from `DATABASE_URL` | Verify or reset Preview role password through approved secret management; set Preview-only values in Vercel; redeploy Preview. |
| Vercel Production | Supabase Production transaction pooler (port `6543`), username `cx_app_hosted.<production-project-ref>` | Separate server-only PostgreSQL URL for an approved privileged login; must differ from `DATABASE_URL` | Production database owner provisions role using reviewed SQL; set its password out-of-band; set Production-only values in Vercel; redeploy only after release approval. |

Use `supabase/hosted/001_application_role.sql` once per Supabase project,
through a direct/session-mode administrative database connection as described
in [hosted role and RLS hardening](hosted-role-and-rls.md). Set the role password
out-of-band with the approved secret manager or interactive `\\password`
workflow. Never put credentials in source, command arguments, shell history,
chat, or logs. The role SQL is manual provisioning, not an app migration.

Do not copy a URL or password from Preview to Production. Do not put a
Supabase API/service-role key in either PostgreSQL URL. `DATABASE_ADMIN_URL`
needs separate least-privilege review; current design docs do not approve using
the project-owner `postgres` credential there by default.

## Read-only role checks

Run these checks separately in each Supabase project using its SQL editor or an
approved read-only database session. They reveal role metadata and grants, not
passwords or connection strings.

```sql
select rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
from pg_roles
where rolname = 'cx_app_hosted';

select granted.rolname as granted_role, member.rolname as member_role
from pg_auth_members am
join pg_roles granted on granted.oid = am.roleid
join pg_roles member on member.oid = am.member
where member.rolname = 'cx_app_hosted';

select count(*) as owned_public_objects
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
  and c.relowner = (select oid from pg_roles where rolname = 'cx_app_hosted');

select has_schema_privilege('cx_app_hosted', 'public', 'USAGE') as public_usage,
       has_table_privilege('cx_app_hosted', 'public.studies', 'SELECT') as studies_select,
       has_table_privilege('cx_app_hosted', 'public.feature_requests', 'SELECT') as feature_requests_select;
```

Expected: one role row; `rolcanlogin = true`; `rolsuper`, `rolbypassrls`,
`rolcreatedb`, and `rolcreaterole` all false; membership includes
`authenticated`; `owned_public_objects = 0`; all three privilege checks true.
No role row in Production is a hard stop. Check all current public tables used
by the application before sign-off; the two table checks above are minimum
spot checks, not proof of full grant coverage.

For tenant scoping, use an approved test account and its active user/org IDs;
keep IDs out of this document. In a transaction as a database administrator,
temporarily assume the application role and set claims for that test member:

```sql
begin;
set local role cx_app_hosted;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '<active-member-user-uuid>',
    'org_id', '<active-member-org-uuid>',
    'role', 'authenticated'
  )::text,
  true
);
select current_user, count(*) as visible_orgs from public.current_org_ids();
rollback;
```

Expected: `current_user = cx_app_hosted` and exactly one visible org for the
selected-org contract. With claims omitted, `current_org_ids()` should return
zero rows. This is a read-only transaction; rollback closes the test without
changing data.

## Vercel and runtime acceptance

1. In the canonical Vercel project, inspect Preview and Production environment
   variable **names and scopes** without revealing values. Confirm each scope
   has its own `DATABASE_URL` and `DATABASE_ADMIN_URL`; keep values masked.
2. Confirm each `DATABASE_URL` uses its matching project's transaction pooler,
   port `6543`, and `cx_app_hosted.<project-ref>` username. Confirm it is not an
   owner, service role, or API key. App code rejects the known `postgres`,
   `service_role`, and `supabase_admin` usernames, but read-only role checks are
   still needed to exclude other owner-equivalent logins.
3. Confirm `DATABASE_ADMIN_URL` is a distinct PostgreSQL URL, server-only, and
   approved for the narrow identity/respondent code paths. Do not use it to
   bypass or repair an application-role failure.
4. After an authorized environment update, redeploy the matching scope and
   inspect deployment logs. The exact runtime rejection above must be absent;
   do not expose URL or password values while checking logs.
5. Request `/api/health/readiness` for each deployed environment. The response
   contains safe booleans only. After migrations 14–17 are approved and applied
   to that environment, require HTTP `200`, `status: "ready"`,
   `configuration.ready: true`, `database.ready: true`,
   `database.complete: true`, and `analytics.ready: true`. Before those
   migrations, `database.complete` may remain false; that is not migration
   approval or permission to proceed.
6. Sign in with a tenant-scoped test account and verify one read-only panel or
   study journey, plus a privileged server path approved for the configured
   admin role. Confirm no cross-tenant rows appear. Preserve deployment SHA,
   readiness booleans, and test result only; redact all connection details.

## Stop conditions and release boundary

- Stop if role attributes, membership, object ownership, grants, or selected-org
  RLS check differ from expected values.
- Stop if role password/configuration cannot be confirmed through approved
  secret management. Do not reset or reveal credentials without the database
  owner/operator's approval.
- Stop if Production role is absent, if Preview and Production target the same
  database, or if `DATABASE_ADMIN_URL` design has no approved login.
- Stop before any hosted SQL, Vercel environment edit, redeploy, migration, or
  Production promotion unless the relevant owner explicitly authorizes that
  operation. Preview authorization does not imply Production authorization.
- A green build, role row, or `ready` status alone does not prove tenant
  isolation or user-flow acceptance. Keep Production NO-GO until the approved
  backup/restore gate, migrations, RLS verification, Preview smoke, and separate
  Production approval are complete.

## Source of requirements

- [`001_application_role.sql`](../supabase/hosted/001_application_role.sql)
  defines the non-owner login role and transaction-pooler username shape.
- [`hosted-role-and-rls.md`](hosted-role-and-rls.md) defines provisioning,
  password handling, direct/session-mode setup, and unresolved admin-role and
  identity-table decisions.
- [`env.ts`](../apps/web/lib/env.ts) rejects missing hosted URLs, loopback URLs,
  known owner/service `DATABASE_URL` usernames, and identical admin/application
  URLs.
- [`readiness route`](../apps/web/app/api/health/readiness/route.ts) returns
  non-secret readiness booleans; `complete` includes comments, recruitment, and
  import schema gates.
- [`hosted-readiness.md`](hosted-readiness.md) defines the hosted environment
  variable boundary and readiness meanings.
