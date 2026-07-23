-- Scope authenticated tenant policies to organization selected by application claims.
-- This is a new migration so the earlier RLS migration remains checksum-stable.
create or replace function public.current_org_ids() returns setof uuid
language sql stable security definer set search_path = public
as $$
  select m.org_id from memberships m
  where m.user_id = auth.uid()
    and m.deactivated_at is null
    and m.org_id = nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'org_id', '')::uuid
$$;