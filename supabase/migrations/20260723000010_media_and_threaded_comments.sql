-- Additive schema for private study stimuli and threaded study/question comments.
-- Safe to stage. Do not execute against hosted Supabase without explicit migration approval.

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  study_id uuid not null references studies(id) on delete cascade,
  storage_key text not null unique,
  content_type text not null check (content_type in ('image/png','image/jpeg','image/webp')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 8388608),
  alt_text text not null check (length(trim(alt_text)) between 1 and 300),
  kind text not null check (kind in ('context','preference','first_click')),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
create index media_assets_study_idx on media_assets (org_id, study_id, created_at desc);

alter table media_assets enable row level security;
alter table media_assets force row level security;
create policy media_assets_tenant on media_assets for all to authenticated
  using (org_id in (select current_org_ids()))
  with check (org_id in (select current_org_ids()));
grant select, insert, update, delete on media_assets to authenticated;

-- Supabase-hosted projects get a private bucket. Local PGlite uses the filesystem adapter.
do $bucket$
begin
  if to_regclass('storage.buckets') is not null then
    execute $sql$
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('study-stimuli', 'study-stimuli', false, 8388608,
              array['image/png','image/jpeg','image/webp'])
      on conflict (id) do update
        set public = false,
            file_size_limit = excluded.file_size_limit,
            allowed_mime_types = excluded.allowed_mime_types
    $sql$;
  end if;
end
$bucket$;

alter table comments add column study_id uuid references studies(id) on delete cascade;
alter table comments add column question_code text;
alter table comments add column parent_id uuid references comments(id) on delete cascade;
alter table comments add column status text not null default 'open' check (status in ('open','resolved'));
alter table comments add column resolved_by uuid references users(id);
alter table comments add column resolved_at timestamptz;

-- Backfill only comments whose polymorphic target still exists. Orphans are preserved for review.
update comments c
set study_id = c.entity_id
where c.entity_type = 'study' and c.study_id is null
  and exists (select 1 from studies s where s.id = c.entity_id and s.org_id = c.org_id);

-- NOT VALID preserves any historical orphan row; all new/updated rows are still checked.
alter table comments add constraint comments_study_shape check (
  (entity_type = 'study' and study_id = entity_id)
  or (entity_type <> 'study' and study_id is null and question_code is null and parent_id is null)
) not valid;
alter table comments add constraint comments_resolution_shape check (
  (status = 'open' and resolved_by is null and resolved_at is null)
  or (status = 'resolved' and resolved_by is not null and resolved_at is not null)
);
create index comments_study_thread_idx on comments (org_id, study_id, question_code, created_at);
create index comments_parent_idx on comments (parent_id, created_at);
