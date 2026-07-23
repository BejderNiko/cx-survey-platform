-- Recruitment pages for collecting consented panel sign-ups.
-- Public submissions use server-side token validation; anon receives no table grants.

create table recruitment_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  internal_name text not null check (length(trim(internal_name)) between 1 and 200),
  public_token text not null unique check (public_token ~ '^[a-zA-Z0-9_-]{3,80}$'),
  is_active boolean not null default false,
  language text not null default 'da' check (language in ('da','en')),
  background_color text not null default '#ffffff' check (background_color ~ '^#[0-9a-fA-F]{6}$'),
  some_thumbnail_url text,
  page_title text not null default '',
  page_content text not null default '',
  header_image_url text,
  background_image_url text,
  header_logo_position text not null default 'center' check (header_logo_position in ('left','center','right')),
  thank_you_content text not null default 'Tak for din tilmelding.',
  confirmation_email_title text not null default 'Tak for din tilmelding',
  confirmation_email_content text not null default '',
  confirmation_email_sender_name text not null default 'OK',
  screening_enabled boolean not null default false,
  screening_question_content text not null default '',
  screening_continue_label text not null default 'Fortsæt',
  screening_end_label text not null default 'Afslut',
  screening_end_content text not null default '',
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recruitment_pages_org_idx on recruitment_pages (org_id, created_at desc);
create index recruitment_pages_workspace_idx on recruitment_pages (org_id, workspace_id);

create table recruitment_page_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  recruitment_page_id uuid not null references recruitment_pages(id) on delete cascade,
  custom_field_id uuid not null references custom_fields(id) on delete cascade,
  position integer not null check (position >= 0),
  required boolean not null default false,
  created_at timestamptz not null default now(),
  unique (recruitment_page_id, custom_field_id),
  unique (recruitment_page_id, position)
);
create index recruitment_page_questions_org_idx on recruitment_page_questions (org_id, recruitment_page_id, position);

create table recruitment_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  recruitment_page_id uuid not null references recruitment_pages(id) on delete cascade,
  panelist_id uuid references panelists(id) on delete set null,
  status text not null default 'accepted' check (status in ('accepted','screened_out','failed')),
  answers jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now()
);
create index recruitment_submissions_page_idx on recruitment_submissions (org_id, recruitment_page_id, submitted_at desc);
create index recruitment_submissions_panelist_idx on recruitment_submissions (org_id, panelist_id);

alter table recruitment_pages enable row level security;
alter table recruitment_page_questions enable row level security;
alter table recruitment_submissions enable row level security;

create policy recruitment_pages_tenant on recruitment_pages for all to authenticated
  using (org_id in (select current_org_ids()))
  with check (org_id in (select current_org_ids()));
create policy recruitment_page_questions_tenant on recruitment_page_questions for all to authenticated
  using (org_id in (select current_org_ids()))
  with check (org_id in (select current_org_ids()));
create policy recruitment_submissions_tenant on recruitment_submissions for all to authenticated
  using (org_id in (select current_org_ids()))
  with check (org_id in (select current_org_ids()));

alter table recruitment_pages force row level security;
alter table recruitment_page_questions force row level security;
alter table recruitment_submissions force row level security;

grant select, insert, update, delete on recruitment_pages to authenticated;
grant select, insert, update, delete on recruitment_page_questions to authenticated;
grant select, insert, update, delete on recruitment_submissions to authenticated;
