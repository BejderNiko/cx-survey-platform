-- Panel recruitment pages: self-service landing pages that turn visitors into
-- panelists. A page has appearance/content settings, an optional screening
-- gate, and a set of recruitment questions drawn from the existing
-- `custom_fields` library (the same fields already used for panelist
-- attributes and segment filters) — so a question authored here immediately
-- shows up in segment building and the panelist profile, and vice versa.

create table recruitment_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id),
  internal_name text not null,
  -- Public URL identifier, e.g. "dFcF6cZo_erhvervsbrugerpanel". Globally
  -- unique (not per-org) so /r/<token> needs no org context to resolve,
  -- mirroring distributions.public_token.
  public_token text not null unique,
  is_active boolean not null default true,
  language text not null default 'da',
  background_color text not null default '#e7e7e7',
  some_thumbnail_url text,
  page_title text not null default '',
  page_content text not null default '',
  header_image_url text,
  background_image_url text,
  header_logo_position text not null default 'left', -- left | center | right
  thank_you_content text not null default '',
  confirmation_email_title text not null default '',
  confirmation_email_content text not null default '',
  confirmation_email_sender_name text not null default '',
  screening_enabled boolean not null default false,
  screening_question_content text not null default '',
  screening_continue_label text not null default 'Ja',
  screening_end_label text not null default 'Nej',
  screening_end_content text not null default '',
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on recruitment_pages (org_id, is_active);

-- Which custom fields this page asks, in order, and whether each is required.
-- Name and email are always collected directly on panelists and are not
-- represented here (matching the "Name and Email are always included" note).
create table recruitment_page_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  recruitment_page_id uuid not null references recruitment_pages(id) on delete cascade,
  custom_field_id uuid not null references custom_fields(id) on delete cascade,
  position int not null default 0,
  required boolean not null default false,
  unique (recruitment_page_id, custom_field_id)
);
create index on recruitment_page_questions (org_id, recruitment_page_id, position);

-- One row per completed submission (screen-outs are not recorded: nothing is
-- captured about a visitor before they pass the screening gate). Kept mainly
-- for the page's completion count and audit trail; the created/updated
-- panelist is the durable record.
create table recruitment_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  recruitment_page_id uuid not null references recruitment_pages(id) on delete cascade,
  panelist_id uuid references panelists(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on recruitment_submissions (org_id, recruitment_page_id, created_at desc);

-- RLS: same tenant model as every other data table (see 20260716000004_rls.sql
-- and 20260720000005_force_rls_data_tables.sql). These are new tables, so
-- ENABLE and FORCE are applied together here rather than as a later hardening
-- pass — the non-owner authenticated role (cx_app / cx_app_hosted) is
-- unaffected by FORCE either way; it protects against an owner-privileged
-- connection ever being used for tenant queries.
do $$
declare
  t text;
begin
  foreach t in array array[
    'recruitment_pages', 'recruitment_page_questions', 'recruitment_submissions'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (org_id in (select current_org_ids()))
         with check (org_id in (select current_org_ids()))',
      t || '_tenant', t);
  end loop;
end $$;
