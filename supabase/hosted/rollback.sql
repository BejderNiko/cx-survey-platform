-- Rollback for the F5-002 hosted-role and FORCE-RLS assets. Apply as `postgres`
-- via a direct session-mode connection. See docs/hosted-role-and-rls.md step 8.
--
-- Order matters: unforce RLS BEFORE removing the role, and revoke the role's
-- grants BEFORE dropping it. Rolling back FORCE never removes the ENABLE RLS
-- policies, so tenant isolation for the non-owner app role remains intact
-- throughout — this is a forward-safe, non-destructive rollback.

-- 1. Undo optional identity-table FORCE (no-op if never applied).
do $$
begin
  execute 'alter table public.memberships no force row level security';
  execute 'alter table public.users no force row level security';
  execute 'alter table public.organizations no force row level security';
exception when others then
  raise notice 'identity-table unforce skipped: %', sqlerrm;
end $$;

-- 2. Undo data-table FORCE from migration 20260720000005.
do $$
declare
  t text;
begin
  foreach t in array array[
    'workspaces','audit_events','comments',
    'import_batches','panelists','custom_fields','panelist_attributes',
    'consent_records','tags','panelist_tags','panelist_notes','segments','contact_events',
    'studies','study_versions','study_collaborators','templates','distributions','invitations',
    'outbox_messages','trigger_events','responses','response_answers','interaction_events',
    'followup_rules','followup_cases','followup_activity','notifications',
    'datasets','dataset_versions','variables','transformation_recipes',
    'analysis_recipes','analysis_runs','charts','insights','evidence_links'
  ]
  loop
    execute format('alter table public.%I no force row level security', t);
  end loop;
end $$;

-- 3. Decommission the application role (only after DATABASE_URL no longer uses it).
--    Reassign nothing: cx_app_hosted owns no objects by design.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'cx_app_hosted') then
    revoke authenticated from cx_app_hosted;
    revoke usage on schema public from cx_app_hosted;
    drop role cx_app_hosted;
  end if;
end $$;
