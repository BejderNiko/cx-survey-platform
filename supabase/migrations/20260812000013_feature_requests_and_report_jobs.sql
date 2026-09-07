-- Additive workflow schema for internal feature requests and report-job lineage.
-- Approval gate: authoring this file does not authorize running it locally or hosted.

create type feature_request_status as enum ('new','planned','in_progress','done','declined');
create type report_job_status as enum ('queued','running','succeeded','failed','cancelled');
create type report_format as enum ('docx','pptx');

alter table media_assets drop constraint if exists media_assets_kind_check;
alter table media_assets add constraint media_assets_kind_check
  check (kind in ('context','preference','first_click','prototype_frame'));

create table feature_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null check (length(trim(title)) between 3 and 160),
  description text not null check (length(trim(description)) between 1 and 5000),
  status feature_request_status not null default 'new',
  owner_id uuid references users(id) on delete set null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, owner_id) references memberships(org_id, user_id),
  foreign key (org_id, created_by) references memberships(org_id, user_id)
);
create index feature_requests_org_status_idx on feature_requests (org_id, status, updated_at desc);

create table feature_request_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  feature_request_id uuid not null,
  actor_user_id uuid references users(id) on delete set null,
  event_type text not null check (event_type in ('created','status_changed','owner_changed','commented')),
  details jsonb not null default '{}'::jsonb check (pg_column_size(details) <= 32768),
  created_at timestamptz not null default now(),
  foreign key (org_id, feature_request_id) references feature_requests(org_id, id) on delete cascade,
  foreign key (org_id, actor_user_id) references memberships(org_id, user_id)
);
create index feature_request_events_request_idx on feature_request_events (org_id, feature_request_id, created_at);
alter table study_versions
  add constraint study_versions_org_study_id_key unique (org_id, study_id, id);


create table report_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  study_id uuid not null,
  study_version_id uuid not null,
  requested_by uuid not null references users(id),
  format report_format not null,
  status report_job_status not null default 'queued',
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  lease_expires_at timestamptz,
  last_error text check (last_error is null or length(last_error) <= 2000),
  input_snapshot jsonb not null check (pg_column_size(input_snapshot) <= 1048576),
  template_reference text,
  output_storage_key text,
  output_content_type text check (output_content_type in ('application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation')),
  artifact_release_status text not null default 'draft_unbranded' check (artifact_release_status in ('draft_unbranded','template_verified')),
  output_sha256 text check (output_sha256 is null or output_sha256 ~ '^[0-9a-f]{64}$'),
  output_byte_size bigint check (output_byte_size is null or output_byte_size > 0),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  foreign key (org_id, study_id, study_version_id) references study_versions(org_id, study_id, id) on delete restrict,
  completed_at timestamptz,
  foreign key (org_id, study_id) references studies(org_id, id) on delete cascade,
  check ((status = 'succeeded') = (output_storage_key is not null and output_sha256 is not null and output_byte_size is not null and output_content_type is not null and completed_at is not null)),
  check ((status = 'running') = (lease_expires_at is not null)),
  check (error_message is null or length(error_message) <= 2000),
  foreign key (org_id, requested_by) references memberships(org_id, user_id)
);
create index report_jobs_study_idx on report_jobs (org_id, study_id, created_at desc);
create index report_jobs_queue_idx on report_jobs (status, lease_expires_at, created_at) where status in ('queued','running');

create table prototype_path_labels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  study_id uuid not null,
  study_version_id uuid not null,
  question_code text not null check (question_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  path_signature text not null check (length(path_signature) between 1 and 4000),
  label text not null check (length(trim(label)) between 1 and 80),
  updated_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, study_id, study_version_id) references study_versions(org_id, study_id, id) on delete cascade,
  foreign key (org_id, updated_by) references memberships(org_id, user_id),
  unique (org_id, id)
);
create unique index prototype_path_labels_signature_idx on prototype_path_labels
  (org_id, study_version_id, question_code, (encode(sha256(convert_to(path_signature, 'UTF8')), 'hex')));

alter table feature_requests enable row level security;
alter table feature_requests force row level security;
alter table feature_request_events enable row level security;
alter table feature_request_events force row level security;
alter table report_jobs enable row level security;
alter table report_jobs force row level security;
alter table prototype_path_labels enable row level security;
alter table prototype_path_labels force row level security;

create policy feature_requests_select on feature_requests for select to authenticated
  using (org_id in (select current_org_ids()));
create policy feature_requests_insert on feature_requests for insert to authenticated
  with check (
    created_by = auth.uid() and exists (
      select 1 from memberships m join users u on u.id = m.user_id
      where m.org_id = feature_requests.org_id and m.user_id = auth.uid()
        and m.deactivated_at is null and u.is_active and m.role in ('owner','administrator')
    )
  );
create policy feature_requests_update on feature_requests for update to authenticated
  using (exists (
    select 1 from memberships m join users u on u.id = m.user_id
    where m.org_id = feature_requests.org_id and m.user_id = auth.uid()
      and m.deactivated_at is null and u.is_active and m.role in ('owner','administrator')
  ))
  with check (org_id in (select current_org_ids()));

create policy feature_request_events_select on feature_request_events for select to authenticated
  using (org_id in (select current_org_ids()));
create policy feature_request_events_insert on feature_request_events for insert to authenticated
  with check (
    actor_user_id = auth.uid() and exists (
      select 1 from memberships m join users u on u.id = m.user_id
      where m.org_id = feature_request_events.org_id and m.user_id = auth.uid()
        and m.deactivated_at is null and u.is_active and m.role in ('owner','administrator')
    )
  );
-- No UPDATE/DELETE policies: feature_request_events is append-only.

create policy report_jobs_select on report_jobs for select to authenticated
  using (exists (
    select 1 from memberships m join users u on u.id = m.user_id
    where m.org_id = report_jobs.org_id and m.user_id = auth.uid()
      and m.deactivated_at is null and u.is_active and m.role in ('owner','administrator')
  ));
create policy report_jobs_insert on report_jobs for insert to authenticated
  with check (
    requested_by = auth.uid() and status = 'queued' and attempt_count = 0
    and output_storage_key is null and lease_expires_at is null
    and exists (
      select 1 from memberships m join users u on u.id = m.user_id
      where m.org_id = report_jobs.org_id and m.user_id = auth.uid()
        and m.deactivated_at is null and u.is_active and m.role in ('owner','administrator')
    )
  );
-- No authenticated UPDATE/DELETE policy: only privileged queue worker mutates lifecycle/output fields.

create policy prototype_path_labels_select on prototype_path_labels for select to authenticated
  using (org_id in (select current_org_ids()));
create policy prototype_path_labels_insert on prototype_path_labels for insert to authenticated
  with check (
    updated_by = auth.uid() and exists (
      select 1 from memberships m join users u on u.id = m.user_id
      where m.org_id = prototype_path_labels.org_id and m.user_id = auth.uid()
        and m.deactivated_at is null and u.is_active and m.role in ('owner','administrator')
    )
  );
create policy prototype_path_labels_update on prototype_path_labels for update to authenticated
  using (exists (
    select 1 from memberships m join users u on u.id = m.user_id
    where m.org_id = prototype_path_labels.org_id and m.user_id = auth.uid()
      and m.deactivated_at is null and u.is_active and m.role in ('owner','administrator')
  ))
  with check (updated_by = auth.uid() and org_id in (select current_org_ids()));

revoke all on feature_requests, feature_request_events, report_jobs, prototype_path_labels from authenticated;
grant select, insert on feature_requests to authenticated;
grant update (status, owner_id, updated_at) on feature_requests to authenticated;
grant select, insert on feature_request_events to authenticated;
grant select, insert on report_jobs to authenticated;
grant select, insert on prototype_path_labels to authenticated;
grant update (label, updated_by, updated_at) on prototype_path_labels to authenticated;
