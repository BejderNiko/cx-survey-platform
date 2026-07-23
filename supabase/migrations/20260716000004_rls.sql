-- Row-level security: tenant isolation for every exposed tenant table.
--
-- Model: the `authenticated` role may only touch rows whose org_id belongs to
-- an organization the current user (auth.uid()) is an active member of.
-- Role-capability enforcement (who may write what) additionally happens in the
-- application permission policy; RLS is the hard tenant boundary.
-- The anonymous respondent flow does not use the authenticated role at all:
-- it goes through narrowly-scoped server-side handlers (service role) that
-- validate distribution/invitation tokens.

-- Active org memberships of the current user. SECURITY DEFINER so policies can
-- consult memberships without recursive RLS evaluation.
create or replace function public.current_org_ids() returns setof uuid
language sql stable security definer set search_path = public
as $$
  select m.org_id from memberships m
  where m.user_id = auth.uid()
    and m.deactivated_at is null
$$;

-- users: self plus co-members of shared orgs.
alter table users enable row level security;
create policy users_select on users for select to authenticated
  using (
    id = auth.uid()
    or id in (select m.user_id from memberships m where m.org_id in (select current_org_ids()))
  );
create policy users_update_self on users for update to authenticated
  using (id = auth.uid());

-- organizations: visible to members only.
alter table organizations enable row level security;
create policy org_select on organizations for select to authenticated
  using (id in (select current_org_ids()));
create policy org_update on organizations for update to authenticated
  using (id in (select current_org_ids()));

-- Generic org_id-based policies for all remaining tenant tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'workspaces','memberships','audit_events','comments',
    'import_batches','panelists','custom_fields','panelist_attributes',
    'consent_records','tags','panelist_tags','panelist_notes','segments','contact_events',
    'studies','study_versions','study_collaborators','distributions','invitations',
    'outbox_messages','trigger_events','responses','response_answers','interaction_events',
    'followup_rules','followup_cases','followup_activity','notifications',
    'datasets','dataset_versions','variables','transformation_recipes',
    'analysis_recipes','analysis_runs','charts','insights','evidence_links'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (org_id in (select current_org_ids()))
         with check (org_id in (select current_org_ids()))',
      t || '_tenant', t);
  end loop;
end $$;

-- templates: built-ins (org_id is null) are readable by any authenticated user;
-- org templates follow the tenant rule.
alter table templates enable row level security;
create policy templates_select on templates for select to authenticated
  using (org_id is null or org_id in (select current_org_ids()));
create policy templates_write on templates for insert to authenticated
  with check (org_id in (select current_org_ids()));
create policy templates_update on templates for update to authenticated
  using (org_id in (select current_org_ids()));
create policy templates_delete on templates for delete to authenticated
  using (org_id in (select current_org_ids()));

-- Grants: authenticated gets table access (RLS narrows rows); anon gets nothing.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
