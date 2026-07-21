-- OPTIONAL, STAGING-GATED (F5-002). Do NOT apply until the staging check in
-- docs/hosted-role-and-rls.md step 5 confirms that the hosted `postgres` role
-- (owner of these tables and of the SECURITY DEFINER helper current_org_ids())
-- retains the rolbypassrls attribute.
--
-- Rationale: memberships/users/organizations are read by current_org_ids(),
-- which every tenant policy calls. If the helper's owner does NOT bypass RLS,
-- forcing RLS on memberships makes the helper subject to the very policy that
-- calls it -> recursion / total lockout. The main migration therefore leaves
-- these three tables ENABLEd-but-not-FORCEd; the non-owner application role is
-- already fully constrained by enabled RLS. This file adds owner-connection
-- defense-in-depth ONLY when the bypass attribute makes it safe.
--
-- Guard: refuse to run unless postgres bypasses RLS, so an accidental apply on
-- a project where it is unsafe fails loudly instead of locking the tenant out.

do $$
declare
  owner_bypasses boolean;
begin
  select rolbypassrls into owner_bypasses
  from pg_roles
  where rolname = (
    select r.rolname from pg_class c join pg_roles r on r.oid = c.relowner
    where c.oid = 'public.memberships'::regclass
  );

  if not coalesce(owner_bypasses, false) then
    raise exception
      'Refusing to FORCE RLS on identity tables: table owner does not bypass RLS. '
      'Confirm current_org_ids() ownership/bypass on staging first (see docs/hosted-role-and-rls.md step 5).';
  end if;

  alter table public.memberships force row level security;
  alter table public.users force row level security;
  alter table public.organizations force row level security;
end $$;
