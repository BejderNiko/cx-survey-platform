-- Local-only shim that recreates the minimal Supabase auth surface our
-- migrations and RLS policies depend on. NEVER apply this to a hosted
-- Supabase project (there the auth schema is managed by Supabase Auth).
create schema if not exists auth;

-- Mirrors Supabase's auth.uid(): reads the `sub` claim from the
-- request.jwt.claims setting, which the application sets per transaction.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

-- Roles that exist on hosted Supabase.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
  -- Local application login role. Subject to RLS (no bypass), so the
  -- tenant-isolation policies genuinely apply to app queries.
  if not exists (select 1 from pg_roles where rolname = 'cx_app') then
    create role cx_app login;
    grant authenticated to cx_app;
  end if;
  -- Local service login role for migration-adjacent tooling and the seed.
  if not exists (select 1 from pg_roles where rolname = 'cx_service') then
    create role cx_service login bypassrls;
    grant service_role to cx_service;
  end if;
end $$;
