-- Durable panel-import commit lifecycle.
-- Additive only. Hosted execution remains approval-gated.

alter type import_status add value if not exists 'committing' before 'committed';

alter table import_batches
  add column if not exists commit_started_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists failure_message text;
