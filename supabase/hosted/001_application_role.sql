-- Hosted application login role (F5-002). MANUAL, one-time provisioning per
-- Supabase project. NOT auto-applied by scripts/dev-db.sh or the migration
-- ledger — run it explicitly against staging first, then production, using a
-- direct (session-mode / port 5432) connection as the project's `postgres`
-- role. See docs/hosted-role-and-rls.md.
--
-- Design:
--   * `cx_app_hosted` is a dedicated LOGIN role that is NOT the owner of any
--     table, so RLS applies to it. It is a member of the NOLOGIN `authenticated`
--     role, inheriting the PostgREST-compatible table grants the migrations set.
--   * It has no BYPASSRLS and no ownership — it is the least-privileged subject
--     of the tenant policies, exactly like local `cx_app`.
--   * The privileged/service path (identity administration + anonymous
--     respondent flow) uses `service_role` (BYPASSRLS) via the service-role
--     connection, NOT this role.
--
-- No secret is committed here. Set the password through an approved interactive
-- or secret-manager workflow (see docs/hosted-role-and-rls.md, step 3). Never
-- put a real password in this file, shell history, command arguments, or logs.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cx_app_hosted') then
    -- LOGIN, but NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB by default.
    create role cx_app_hosted login;
  end if;
end $$;

-- Inherit the authenticated grants (SELECT/INSERT/UPDATE/DELETE on public
-- tables; RLS narrows the rows). Membership, not ownership.
grant authenticated to cx_app_hosted;

-- Explicitly ensure the role can reach the schema and sequences it needs.
grant usage on schema public to cx_app_hosted;

-- Belt-and-braces: guarantee this role never owns objects or bypasses RLS.
alter role cx_app_hosted nosuperuser nocreatedb nocreaterole nobypassrls;

-- After setting the password out-of-band, the web app's DATABASE_URL uses this
-- role through the TRANSACTION-mode pooler (port 6543), username form
-- `cx_app_hosted.<project_ref>`. withUser() sets request.jwt.claims with
-- is_local => true, which is transaction-scoped and therefore pooler-safe.
