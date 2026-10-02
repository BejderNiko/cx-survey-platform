-- Hosted schema audit for CX Survey Platform.
-- Run separately in Preview and Production Supabase SQL Editors.
-- Confirm project name/ref in the dashboard before each run; this query set
-- intentionally does not read credentials, respondent rows, or panelist data.
-- Every executable statement below is SELECT-only. No migrations, DDL, DML,
-- resets, seeds, or imports are included.
--
-- Use result label `Preview` or `Production` in the first query. Save both
-- result sets separately. Do not treat project/database name alone as proof
-- of environment; verify the selected project in the Supabase dashboard.

-- A. Record a safe environment label and connection identity.
select
  'SET_ENV_LABEL_HERE'::text as audit_environment,
  current_database() as database_name,
  current_user as connected_role,
  current_setting('server_version_num') as postgres_version_num;

-- B. Check whether Supabase CLI migration ledger exists.
-- If false, skip batch C. A missing ledger does not prove that schema SQL is
-- absent: prior SQL Editor execution may have changed schema without ledger rows.
select
  to_regclass('supabase_migrations.schema_migrations') is not null
    as supabase_migration_ledger_exists;

-- C. Run only when batch B returned true.
-- Compare version timestamps only, matching Supabase CLI's documented behavior.
-- The local migration name is included as context; the hosted table does not
-- need a name or checksum column for this query.
-- Source: https://supabase.com/docs/reference/cli/supabase-migration-list
with expected(version, migration_name) as (
  values
    ('20260716000001', 'tenancy_and_panel'),
    ('20260716000002', 'studies_distribution_responses'),
    ('20260716000003', 'analytics_insights'),
    ('20260716000004', 'rls'),
    ('20260720000005', 'force_rls_data_tables'),
    ('20260721000006', 'revoke_public_execute_current_org_ids'),
    ('20260722000007', 'recruitment_pages'),
    ('20260722000008', 'recruitment_org_integrity'),
    ('20260722000009', 'selected_org_rls'),
    ('20260723000010', 'media_and_threaded_comments'),
    ('20260723000011', 'tenant_integrity_constraints'),
    ('20260729000012', 'import_commit_lifecycle'),
    ('20260812000013', 'feature_requests_and_report_jobs'),
    ('20260909000014', 'pr13_product_features'),
    ('20260911000015', 'pr13_section_comments'),
    ('20260911000016', 'recruitment_filter_questions'),
    ('20260930000017', 'feature_request_submission_roles')
), ledger as (
  select version::text as version
  from supabase_migrations.schema_migrations
)
select
  e.version as expected_version,
  e.migration_name as expected_name,
  l.version is not null as ledger_has_version,
  case when l.version is null then 'MISSING_FROM_LEDGER' else 'VERSION_PRESENT' end as audit_result
from expected e
left join ledger l on l.version = e.version
union all
select
  l.version,
  null,
  true,
  'NOT_IN_CURRENT_CHECKOUT'
from ledger l
where not exists (select 1 from expected e where e.version = l.version)
order by 1;

-- D. Readiness schema inventory. All names and required columns below come
-- from apps/web/app/api/health/readiness/route.ts and migrations 1-17.
with required_tables(table_name) as (
  values
    ('organizations'), ('workspaces'), ('users'), ('memberships'), ('audit_events'),
    ('comments'), ('import_batches'), ('panelists'), ('custom_fields'),
    ('panelist_attributes'), ('consent_records'), ('tags'), ('panelist_tags'),
    ('panelist_notes'), ('segments'), ('contact_events'),
    ('studies'), ('study_versions'), ('study_collaborators'), ('templates'),
    ('distributions'), ('invitations'), ('outbox_messages'), ('trigger_events'),
    ('responses'), ('response_answers'), ('interaction_events'), ('followup_rules'),
    ('followup_cases'), ('followup_activity'), ('notifications'),
    ('datasets'), ('dataset_versions'), ('variables'), ('transformation_recipes'),
    ('analysis_recipes'), ('analysis_runs'), ('charts'), ('insights'), ('evidence_links'),
    ('recruitment_submissions'),
    ('media_assets'),
    ('recruitment_pages'),
    ('recruitment_page_questions'),
    ('feature_requests'),
    ('feature_request_events'), ('report_jobs'), ('prototype_path_labels')
), required_columns(table_name, column_name) as (
  values
    ('recruitment_page_questions', 'org_id'),
    ('recruitment_page_questions', 'recruitment_page_id'),
    ('recruitment_page_questions', 'custom_field_id'),
    ('recruitment_page_questions', 'source_key'),
    ('recruitment_page_questions', 'position'),
    ('recruitment_page_questions', 'required'),
    ('comments', 'study_id'),
    ('comments', 'question_code'),
    ('comments', 'section_id'),
    ('comments', 'parent_id'),
    ('comments', 'status'),
    ('comments', 'resolved_by'),
    ('comments', 'resolved_at'),
    ('import_batches', 'commit_started_at'),
    ('import_batches', 'failed_at'),
    ('import_batches', 'failure_message'),
    ('panelists', 'org_id'),
    ('panelists', 'external_id'),
    ('panelists', 'email'),
    ('panelists', 'lifecycle'),
    ('panelists', 'anonymized_at'),
    ('consent_records', 'org_id'),
    ('consent_records', 'panelist_id'),
    ('consent_records', 'purpose'),
    ('consent_records', 'status'),
    ('panelist_attributes', 'panelist_id'),
    ('panelist_attributes', 'field_id'),
    ('panelist_attributes', 'value'),
    ('feature_requests', 'org_id'),
    ('feature_requests', 'created_by'),
    ('feature_requests', 'source_path'),
    ('feature_requests', 'target_snapshot'),
    ('feature_requests', 'section'),
    ('feature_request_events', 'org_id'),
    ('feature_request_events', 'actor_user_id')
)
select
  t.table_name,
  to_regclass(format('public.%I', t.table_name)) is not null as table_exists,
  count(c.column_name) filter (where c.column_name is not null) as required_column_count,
  count(rc.column_name) as expected_required_column_count,
  coalesce(
    string_agg(c.column_name::text, ', ' order by c.column_name)
      filter (where c.column_name is not null),
    ''
  ) as present_required_columns,
  coalesce(
    string_agg(rc.column_name, ', ' order by rc.column_name)
      filter (where rc.column_name is not null and c.column_name is null),
    ''
  ) as missing_required_columns
from required_tables t
left join required_columns rc on rc.table_name = t.table_name
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = rc.table_name
 and c.column_name = rc.column_name
group by t.table_name
order by t.table_name;

-- D2. Verify column types and nullability changed by migrations 14–16.
-- Compare actual values with each local migration before accepting Preview.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'feature_requests' and column_name in ('source_path', 'target_snapshot', 'section'))
    or (table_name = 'comments' and column_name = 'section_id')
    or (table_name = 'recruitment_page_questions' and column_name in ('custom_field_id', 'source_key'))
  )
order by table_name, column_name;

-- E. Exact additive objects required by readiness and migrations 15–16.
select
  exists (
    select 1 from pg_constraint
    where conrelid = to_regclass('public.recruitment_page_questions')
      and conname = 'recruitment_page_questions_source_shape'
  ) as recruitment_source_shape_constraint_exists,
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'recruitment_page_questions'
      and indexname = 'recruitment_page_questions_source_uidx'
  ) as recruitment_source_unique_index_exists,
  (
    select indexdef from pg_indexes
    where schemaname = 'public'
      and tablename = 'recruitment_page_questions'
      and indexname = 'recruitment_page_questions_source_uidx'
  ) as recruitment_source_unique_index_definition,
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'comments'
      and indexname = 'comments_study_section_idx'
  ) as comments_section_index_exists,
  (
    select indexdef from pg_indexes
    where schemaname = 'public'
      and tablename = 'comments'
      and indexname = 'comments_study_section_idx'
  ) as comments_section_index_definition,
  exists (
    select 1 from pg_constraint
    where conrelid = to_regclass('public.comments')
      and conname = 'comments_study_shape'
  ) as comments_study_shape_constraint_exists,
  exists (
    select 1 from pg_constraint
    where conrelid = to_regclass('public.comments')
      and conname = 'comments_resolution_shape'
  ) as comments_resolution_shape_constraint_exists,
  exists (
    select 1 from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'import_status' and e.enumlabel = 'committing'
  ) as import_status_committing_exists;

-- F. RLS flags for tenant-bearing tables touched by migrations 1-17.
-- Expected forced=false only for identity helper tables users, organizations,
-- memberships. The hosted-role runbook documents why those are not forced.
with expected_rls(table_name, force_expected) as (
  values
    ('organizations', false), ('users', false), ('memberships', false),
    ('workspaces', true), ('audit_events', true), ('comments', true),
    ('import_batches', true), ('panelists', true), ('custom_fields', true),
    ('panelist_attributes', true), ('consent_records', true), ('tags', true),
    ('panelist_tags', true), ('panelist_notes', true), ('segments', true),
    ('contact_events', true), ('studies', true), ('study_versions', true),
    ('study_collaborators', true), ('templates', true), ('distributions', true),
    ('invitations', true), ('outbox_messages', true), ('trigger_events', true),
    ('responses', true), ('response_answers', true), ('interaction_events', true),
    ('followup_rules', true), ('followup_cases', true), ('followup_activity', true),
    ('notifications', true), ('datasets', true), ('dataset_versions', true),
    ('variables', true), ('transformation_recipes', true), ('analysis_recipes', true),
    ('analysis_runs', true), ('charts', true), ('insights', true), ('evidence_links', true),
    ('recruitment_pages', true), ('recruitment_page_questions', true),
    ('recruitment_submissions', true), ('media_assets', true),
    ('feature_requests', true), ('feature_request_events', true),
    ('report_jobs', true), ('prototype_path_labels', true)
)
select
  e.table_name,
  c.oid is not null as table_exists,
  coalesce(c.relrowsecurity, false) as rls_enabled,
  coalesce(c.relforcerowsecurity, false) as rls_forced,
  e.force_expected,
  case
    when c.oid is null then 'MISSING_TABLE'
    when not c.relrowsecurity then 'RLS_DISABLED'
    when c.relforcerowsecurity is distinct from e.force_expected then 'FORCE_RLS_MISMATCH'
    else 'MATCH'
  end as audit_result
from expected_rls e
left join pg_class c
  on c.relnamespace = 'public'::regnamespace
 and c.relname = e.table_name
 and c.relkind in ('r', 'p')
order by e.table_name;

-- G. Migration-17 feature-request INSERT policy definitions.
-- Compare these returned predicates with migration
-- supabase/migrations/20260930000017_feature_request_submission_roles.sql.
-- Expected: permissive=PERMISSIVE, roles={authenticated}, cmd=INSERT, qual is NULL;
-- with_check must bind actor id to auth.uid() and require an active membership
-- in the row's org plus an active users row. Catalog text is definition evidence,
-- not a behavioral cross-tenant test.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check as check_expression
from pg_policies
where schemaname = 'public'
  and (
    (tablename = 'feature_requests' and policyname = 'feature_requests_insert')
    or
    (tablename = 'feature_request_events' and policyname = 'feature_request_events_insert')
  )
order by tablename, policyname;

-- H. No writes are made by this audit. Compare Preview and Production outputs:
-- 1. Project refs/deployment environments must be independently confirmed in
--    Vercel/Supabase UI; this SQL output cannot identify a Supabase project ref.
-- 2. Batch C should show VERSION_PRESENT for all 17 versions, with no
--    MISSING_FROM_LEDGER or NOT_IN_CURRENT_CHECKOUT rows. Supabase CLI compares
--    version timestamps; this does not verify file contents/checksums.
-- 3. Batch D must show no missing tables and empty missing_required_columns.
--    Batch E booleans must all be true.
--    The two returned index definitions must match their migration column
--    order and predicate: recruitment (recruitment_page_id, source_key) WHERE
--    source_key IS NOT NULL; comments (org_id, study_id, section_id, created_at).
--    Batch D2 must show source_path/section/section_id/source_key as nullable
--    text; target_snapshot as NOT NULL jsonb with '{}' default; and
--    custom_field_id as nullable uuid. Compare defaults/types, not just names.
-- 4. Batch F must show MATCH for every table. Expected forced=false for the
--    three identity tables only; all others must have RLS enabled and forced.
-- 5. Batch G must return exactly two policies with predicates matching migration
--    17. No result means missing policy. A permissive catalog definition does
--    not prove runtime insert/tenant behavior; that needs a separately approved,
--    isolated Preview behavior test with disposable identities and cleanup.
-- 6. Query GET /api/health/readiness separately for each deployment. Record HTTP
--    status, `status`, `database.ready`, `database.complete`, and each component.
--    Endpoint does not currently verify migration ledger or migration-17 policy.
-- 7. Never run migrations or alter data from this file. Promotion requires a
--    separate reviewed migration list and explicit migration authorization.
