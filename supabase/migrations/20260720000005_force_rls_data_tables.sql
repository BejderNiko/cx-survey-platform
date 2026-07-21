-- F5-002 hardening: FORCE ROW LEVEL SECURITY on tenant DATA tables.
--
-- Why: RLS was ENABLEd but not FORCEd. A non-superuser table OWNER (which is
-- exactly what the hosted Supabase `postgres` role is — see
-- docs/hosted-role-and-rls.md) BYPASSES enabled-but-not-forced RLS on the
-- tables it owns. If a hosted deployment ever connected the application through
-- an owner-privileged role, tenant isolation would silently disappear with no
-- error. FORCE closes that: the owner is then also subject to the policies.
--
-- Scope: DATA tables only. The identity tables read by the SECURITY DEFINER
-- helper `current_org_ids()` — memberships, users, organizations — are
-- deliberately NOT forced here, because whether the helper's owner bypasses RLS
-- on hosted depends on the hosted `postgres` role's rolbypassrls attribute,
-- which must be confirmed on staging first. Forcing them prematurely could
-- recurse or lock out all reads. See docs/hosted-role-and-rls.md, step 5, for
-- the staging check that decides whether the optional identity-table forcing in
-- supabase/hosted/002_force_identity_tables_optional.sql may be applied.
--
-- Local development note: the local `postgres` superuser and (on hosted) the
-- service_role connection both carry BYPASSRLS, so the seed, the identity-admin
-- flow, and the anonymous respondent flow are unaffected by FORCE. The
-- authenticated application role (cx_app locally / cx_app_hosted on Supabase) is
-- a non-owner and was already fully subject to RLS; FORCE does not change its
-- behavior. This migration therefore adds hosted defense-in-depth without
-- altering any verified local behavior.

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
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;
