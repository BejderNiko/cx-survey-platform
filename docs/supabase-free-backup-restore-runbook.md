# Free-plan Supabase backup and local restore runbook

Status: 2026-10-02 · Read-only against hosted projects. No migration approval is implied.

## Scope and coverage

Both Preview and Production currently show the Free plan and no scheduled backups. Supabase documents automatic daily backups for Pro, Team, and Enterprise, and recommends regular CLI exports with off-site storage for Free projects. Dashboard backup downloads are unavailable on Free. The paid “Restore to a new project” flow and PITR are outside this no-purchase runbook. See [Database Backups](https://supabase.com/docs/guides/platform/backups), [Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod), and [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project).

Migrations 14–17 change only application tables and policies in `public`:

| Migration | Change | Managed-schema effect |
| --- | --- | --- |
| `20260909000014` | Add `source_path`, `target_snapshot`, and `section` to `public.feature_requests`. | None. |
| `20260911000015` | Add `section_id` and an index to `public.comments`. | None. |
| `20260911000016` | Change nullability and add a check constraint and partial unique index on `public.recruitment_page_questions`. | None. |
| `20260930000017` | Replace insert policies on `public.feature_requests` and `public.feature_request_events`. Policies call Supabase's `auth.uid()` and target role `authenticated`; migration does not create or alter objects under `auth`. | References managed Auth API; no managed-schema DDL. |

The application authenticates through its own `public.users` table and signed session cookie in `apps/web/lib/auth.ts`; that table and the rest of `public` application data are within this logical-export scope. The CLI dump is not a full Supabase-project backup: its documented filters omit managed schemas including `auth` and `storage`, and extension-owned objects. The app also uses private Supabase Storage bucket `study-stimuli` for stimulus and report files. The `storage.buckets` row and actual stored objects are not preserved by these SQL dumps. Supabase states database backups contain Storage metadata only, not Storage API objects. The app's Storage assets therefore need a separately approved backup/restore path for full application recovery. See [CLI `db dump` reference](https://supabase.com/docs/reference/cli/supabase-db-schema-declarative), [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), and [Database Backups](https://supabase.com/docs/guides/platform/backups).

The standard export does not preserve `supabase_migrations` history. The CLI guide documents separate schema and data exports when migration history must be retained. Daily physical backups do not include custom-role passwords; do not treat role SQL as proof that credentials can be restored. Built-in `auth.uid()` and Supabase-managed roles must come from the disposable Supabase target, not from this app-schema export.

## Preconditions

- Use an organization-approved Windows machine with Supabase CLI, Docker Desktop, and `psql`. Supabase CLI `db dump` invokes `pg_dump` in a Docker container; direct raw `pg_dump` is not an equivalent replacement because it lacks Supabase-specific filtering. See the [CLI backup and restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) and [Platform restore guide](https://supabase.com/docs/guides/self-hosting/restore-from-platform).
- Use encrypted, access-controlled storage outside this Git worktree. SQL files contain live project data. Never commit, upload to chat, or email dumps.
- Identify Preview and Production project references in Dashboard first. Record only the non-secret project reference, project label, UTC export time, candidate SHA, and migration IDs. Never place a database password or access token in shell history, a URL pasted into chat, or a log.
- Use a separate working folder for each project so `--linked` cannot silently point at the other project. `supabase link --project-ref <ref>` prompts for the database password; CLI documentation says it stores the password in native credential storage when available. Do not pass the password as a command argument.

## Export each project

Repeat this flow independently for Preview and Production. Commands below run from a dedicated empty folder for the labeled project, not from the repository. Enter the non-secret project reference shown in Dashboard at the prompt.

```powershell
supabase init
supabase login
$ProjectRef = Read-Host 'Confirmed project reference from Dashboard'
supabase link --project-ref $ProjectRef

supabase db dump --linked -f roles.sql --role-only
supabase db dump --linked -f schema.sql
supabase db dump --linked -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"

# Preserve migration ledger separately, if restore testing must start at the
# hosted migration baseline rather than treating the schema as a fresh install.
supabase db dump --linked -f migration-history-schema.sql --schema supabase_migrations
supabase db dump --linked -f migration-history-data.sql --schema supabase_migrations --use-copy --data-only

Get-ChildItem -File -Filter *.sql | Select-Object Name, Length
Get-FileHash *.sql -Algorithm SHA256
```

The five SQL files must exist and have non-zero sizes. Save hashes and file sizes in a plain-text manifest beside the encrypted backup; do not include secrets or SQL contents in the manifest. Keep one verified off-site encrypted copy under the organization's retention policy. For extensions, Auth settings, Edge Functions, project secrets, and Storage objects, inventory and handle them separately if the release rollback needs them.

## Restore verification on disposable local Supabase

Do not restore into either hosted project. Create a separate local CLI project for each backup. Supabase documents that `supabase start` applies migrations and seed files, so first start the local stack with an empty app migration directory and no seed file. Restore the hosted baseline and migration ledger. Only then copy migrations 14–17 into the local project's migration directory and apply them with `--local`. The CLI stack supplies local Auth roles/functions required by public RLS policies. Use that stack's local Postgres URL only. Avoid commands with `--linked` or `--db-url` during restore and migration testing. See the [local workflow](https://supabase.com/docs/guides/local-development/cli-workflows).

```powershell
supabase init
if (Get-ChildItem '.\supabase\migrations' -File -ErrorAction SilentlyContinue) { throw 'Restore project must start without app migrations.' }
if (Test-Path '.\supabase\seed.sql') { throw 'Restore project must start without seed data.' }
supabase start
```

Set `$BackupDir` to the selected encrypted backup folder and `$LocalDbUrl` to the local stack connection URL using the approved local secret-handling method. Do not print `$LocalDbUrl`. Set `$CandidateRoot` to the reviewed worktree path. Restore in one transaction and stop on first SQL error:

```powershell
psql --single-transaction --set ON_ERROR_STOP=1 `
  --file (Join-Path $BackupDir 'roles.sql') `
  --file (Join-Path $BackupDir 'schema.sql') `
  --file (Join-Path $BackupDir 'migration-history-schema.sql') `
  --command "SET session_replication_role = replica" `
  --file (Join-Path $BackupDir 'data.sql') `
  --file (Join-Path $BackupDir 'migration-history-data.sql') `
  --dbname $LocalDbUrl

# Add only the candidate migrations after restoring the hosted baseline.
Copy-Item (Join-Path $CandidateRoot 'supabase/migrations/20260909000014_pr13_product_features.sql') '.\supabase\migrations\'
Copy-Item (Join-Path $CandidateRoot 'supabase/migrations/20260911000015_pr13_section_comments.sql') '.\supabase\migrations\'
Copy-Item (Join-Path $CandidateRoot 'supabase/migrations/20260911000016_recruitment_filter_questions.sql') '.\supabase\migrations\'
Copy-Item (Join-Path $CandidateRoot 'supabase/migrations/20260930000017_feature_request_submission_roles.sql') '.\supabase\migrations\'

supabase migration up --local
supabase migration list --local
```

The restore order follows Supabase's documented roles → schema → data procedure, with migration-history schema/data inserted separately as its guide requires. Supabase's restore guide uses this multi-file `psql --single-transaction` pattern. PostgreSQL documents `--single-transaction` as wrapping one or more `-f` and `-c` inputs in one transaction; this only works if scripts contain no explicit transaction controls or statements forbidden in a transaction. `session_replication_role = replica` disables triggers during data loading; use only on the disposable restore target. Local CLI commands must explicitly use `--local`. See [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [CLI migration reference](https://supabase.com/docs/reference/cli/supabase-migration-list), and [PostgreSQL `psql` reference](https://www.postgresql.org/docs/current/app-psql.html).

If a logical restore fails because local platform/extension versions differ, stop and record the exact sanitized error. Do not “fix” the backup by editing SQL until the mismatch is understood. A successful logical restore validates only the objects included in these SQL exports; it is not proof that Auth accounts, Storage objects, settings, keys, Edge Functions, or every managed object were restored.

## Acceptance evidence before hosted migration

For both Preview and Production, retain:

1. Project label/reference, UTC backup time, candidate SHA, and migration baseline; no password or token.
2. Non-empty roles/schema/data/history SQL files, SHA-256 hashes, and encrypted off-site-copy confirmation.
3. Successful restore log with secrets and row contents removed; compare read-only source and restored counts for key `public` tables (including `feature_requests`, `feature_request_events`, `comments`, and `recruitment_page_questions`).
4. Local migration ledger shows the backed-up baseline before migration, then IDs 14–17 after `supabase migration up --local`.
5. Restored `public` schema has the 14–17 columns, index/constraint, and both `feature_requests_insert` / `feature_request_events_insert` policies. Run the existing local DB/RLS checks and application smoke tests against only the disposable restore.
6. Separate decision for Storage file recovery. If rollback must restore stimuli or report artifacts, record verified bucket/object recovery too; SQL-only restore is insufficient.

No hosted migration is authorized by this runbook. Keep the release gate open until both project backups pass their respective disposable restores, migration-coverage gaps are resolved, and the owner separately approves Preview migration.
