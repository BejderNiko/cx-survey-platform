-- Tenancy, identity, audit, and panel management.
-- Conventions: uuid PKs, timestamptz, org_id on every tenant table (RLS anchor).
create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Tenancy & identity
-- ---------------------------------------------------------------------------
create type member_role as enum ('owner','administrator','researcher','panel_manager','analyst','viewer');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  -- Governance defaults: contact frequency caps, cooldown, max invite size.
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);

-- Local-dev identity. On hosted Supabase, identity lives in auth.users and
-- this table keeps profile data linked via auth_user_id (OIDC boundary).
create table users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email citext not null unique,
  full_name text not null,
  locale text not null default 'en',
  password_hash text, -- local development credential auth only
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role member_role not null,
  invited_by uuid references users(id),
  created_at timestamptz not null default now(),
  deactivated_at timestamptz,
  unique (org_id, user_id)
);
create index on memberships (user_id);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  actor_user_id uuid references users(id),
  action text not null,           -- e.g. panel.import.commit, study.publish
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on audit_events (org_id, created_at desc);

create table comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  entity_type text not null,      -- study | followup_case | analysis_run | insight | report
  entity_id uuid not null,
  author_id uuid not null references users(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index on comments (org_id, entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Panel
-- ---------------------------------------------------------------------------
create type panelist_lifecycle as enum
  ('invited','active','paused','unsubscribed','bounced','blocked','anonymized','archived');
create type consent_status as enum ('granted','withdrawn','expired');
create type contact_event_type as enum
  ('invited','sent','delivered','opened','clicked','bounced','spam','blocked','unsubscribed','responded');
create type import_status as enum ('uploaded','mapped','validated','dry_run','committed','failed','rolled_back');

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  filename text not null,
  file_kind text not null,        -- csv | xlsx
  status import_status not null default 'uploaded',
  mapping jsonb not null default '{}'::jsonb,       -- column -> field mapping
  dedup_rule text not null default 'external_id',   -- external_id | email | none
  counts jsonb not null default '{}'::jsonb,        -- {total, valid, invalid, created, updated, skipped}
  error_report jsonb not null default '[]'::jsonb,  -- row-level errors
  dry_run boolean not null default true,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  committed_at timestamptz
);
create index on import_batches (org_id, created_at desc);

-- Identity/contact data. Research answers reference panelists only by id;
-- anonymization irreversibly scrubs this row and unlinks responses.
create table panelists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  external_id text,                -- stable id from source system
  first_name text,
  last_name text,
  email citext,
  phone text,
  language text not null default 'da',
  birth_year int check (birth_year between 1900 and 2100),
  gender text,                     -- collected only when provided
  city text,
  postal_code text,
  country text not null default 'DK',
  customer_status text,            -- e.g. customer | former | prospect | member
  recruitment_source text,
  lifecycle panelist_lifecycle not null default 'active',
  import_batch_id uuid references import_batches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  anonymized_at timestamptz,
  unique (org_id, external_id)
);
create index on panelists (org_id, lifecycle);
create index on panelists (org_id, email);

create table custom_fields (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  label text not null,
  field_type text not null,        -- text | number | boolean | select | multi_select | date
  options jsonb not null default '[]'::jsonb,  -- value labels for select types
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

create table panelist_attributes (
  panelist_id uuid not null references panelists(id) on delete cascade,
  field_id uuid not null references custom_fields(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (panelist_id, field_id)
);
create index on panelist_attributes (org_id, field_id);

create table consent_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  panelist_id uuid not null references panelists(id) on delete cascade,
  purpose text not null,           -- panel_membership | survey_contact | profiling
  status consent_status not null,
  source text not null default 'import',
  granted_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now()
);
create index on consent_records (org_id, panelist_id);

create table tags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  color text not null default 'gray',
  unique (org_id, name)
);

create table panelist_tags (
  panelist_id uuid not null references panelists(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  primary key (panelist_id, tag_id)
);
create index on panelist_tags (org_id, tag_id);

create table panelist_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  panelist_id uuid not null references panelists(id) on delete cascade,
  author_id uuid not null references users(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index on panelist_notes (org_id, panelist_id);

create table segments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  -- Filter tree evaluated against panelist fields/attributes/tags/activity.
  definition jsonb not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

create table contact_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  panelist_id uuid not null references panelists(id) on delete cascade,
  event_type contact_event_type not null,
  distribution_id uuid,            -- FK added after distributions table exists
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index on contact_events (org_id, panelist_id, occurred_at desc);
