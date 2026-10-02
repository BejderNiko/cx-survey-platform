-- PR13 section-scoped comments. Additive only.
-- Do not execute against local or hosted databases without explicit migration approval.

alter table comments
  add column if not exists section_id text;

create index if not exists comments_study_section_idx
  on comments (org_id, study_id, section_id, created_at);
