-- PR13 additive product features. Authoring this file does not authorize
-- running it against local or hosted databases.

alter table feature_requests
  add column if not exists source_path text,
  add column if not exists target_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists section text;
