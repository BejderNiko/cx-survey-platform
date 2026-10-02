# Preview to Production integration plan — 2026-09-30

## Scope and decision

Combine current Production `main` with Preview `Pr13` and the feedback, comments, and panel-import work. Keep panel recruitment deferred. Release only after the exact merged candidate passes CI, isolated Preview database migration and browser acceptance, backup/rollback review, and a separate Production approval. No hosted data or configuration has been changed by this plan. The review branch is `release/pr13-feedback-20261002`; draft PR [#13](https://github.com/BejderNiko/cx-survey-platform/pull/13) holds the candidate.

## Ordered gates

1. [x] Identify exact current Vercel deployments, Supabase projects, environment scopes, hosted migration heads, and relevant schema objects without exposing values.
2. [x] Merge Production and Preview source in a local review worktree; resolve conflicts, overlay Luna changes, and check TypeScript plus a fresh local migration sequence.
3. [x] Review merged code and run web/domain unit tests, database/RLS tests, production build, analytics tests, and E2E on candidate `013b0df` in [CI #50](https://github.com/BejderNiko/cx-survey-platform/actions/runs/36995405311): web, analytics, and E2E green; 10/10 Playwright tests passed. Documentation-only follow-up commits must still be checked against their exact SHA.
4. [ ] Establish backup/restore and rollback compatibility for each hosted database using [`supabase-free-backup-restore-runbook.md`](supabase-free-backup-restore-runbook.md). Obtain migration approval. Apply missing migrations 14–17 to isolated Preview first, then audit schema, RLS, and `/api/health/readiness`.
5. [ ] Run signed-in Preview browser journeys: feedback from a non-admin; owner inbox; study/section/question/result comments with reload and tenant denial; survey build, publish, distribution, completion, results/export; panel import with synthetic data only.
6. [ ] Resolve any Preview defects and repeat gates 3–5 until accepted. Candidate branch commits and pushes were authorized in this session; Production migration and deployment require a separate reviewed decision under project instructions.
7. [ ] Apply approved Production migration sequence, deploy exact accepted candidate, verify deployment SHA, readiness, auth, feedback, comments, survey and rollback signals. Import real panelists only from usable addresses and verified per-purpose consent evidence.

## Luna High assignments and acceptance

| Agent | Individual plan | Acceptance criteria and observed status |
| --- | --- | --- |
| `feedback_research` | Inspect public feedback repos and compare license, maintenance, architecture, privacy, and integration cost with existing widget. | Produce evidence-backed recommendation. `bebsworthy/feedbacker` was rejected for local-storage/base64 design; no package added. |
| `lyssna_research` | Map Lyssna-like feedback and anchored discussions to current study, section, question, and results surfaces. | Define bounded parity and UX checks. Full Lyssna feature parity remains outside accepted scope. |
| `feedback_impl` | Fix capture/form flow, validate server input, permit all active authenticated roles to submit, keep inbox management scoped. | Typecheck, lint, local migration/RLS and role tests; E2E viewer submission and owner inbox. Local direct checks passed; automated specs and hosted test pending. |
| `comments_impl` | Separate thread scopes and add counts, filtering, deep links, accessible popovers. | Typecheck/lint and create/reply/resolve/reload/browser checks in classic and modern UI. Local direct checks passed; full E2E pending. |
| `panel_csv` | Map all supplied headers and fail closed on missing consent evidence; do not import supplied roster. | Map 27/27 headers, validate independent per-purpose consent, typecheck/lint, synthetic tests, no real-data write. Direct mapping smoke passed; Vitest and DB-backed assertions pending. |
| `merge_builder` | Combine builder, instrument metadata, renderer and Figma changes while preserving both branches' behavior. | No conflict markers; domain/web typecheck and focused builder tests. Integrated direct TypeScript checks pass; focused tests/CI pending. |
| `merge_panel` | Combine panel filters, distribution, readiness, exports, report jobs and RLS checks. | No conflict markers; guards retained; web typecheck/lint and focused tests. Integrated direct TypeScript passes; tests/CI pending. |
| `feedback_release_qa` | Strengthen viewer-to-owner feedback E2E and comment persistence checks, guard test-only DB setup, audit merged candidate. | No accidental hosted DB use; executable tests and browser evidence. Independent code audit complete; guard tightened to start its own server, and raw import failure text replaced with a fixed message. Automated Playwright and hosted browser evidence pending. |

Agent results are inputs to the primary review. A local green typecheck or migration run is insufficient release evidence.

## Release blockers and open decisions

- Hosted projects have migration IDs 1–13. Local source has 1–17; `17 - 13 = 4` pending IDs (`14`, `15`, `16`, `17`). Both hosted projects lack `recruitment_page_questions.source_key` and `comments.section_id`.
- Local Windows blocks Vitest/Playwright child processes (`spawn EPERM`); review worktree build also cannot resolve the temporary `node_modules` junction with Turbopack. Exact-SHA CI is required.
- Supplied 3,478-row roster uses `example.invalid` for every email and has no per-row consent references. Await usable contact addresses and evidence covering each purpose before real import.
- Both hosted Supabase projects show Free and Dashboard has no scheduled backup. Supabase CLI, Docker, `pg_dump`, and `psql` are unavailable here; no backup or restore test has run. Release gate 4 remains open; follow [`supabase-free-backup-restore-runbook.md`](supabase-free-backup-restore-runbook.md) on an approved machine.
- CLI SQL exports omit managed `auth` / `storage` schemas and extension-owned objects. Migrations 14–17 alter only application objects in `public`; migration 17 references managed `auth.uid()` and role `authenticated` without changing `auth`. Application login data in `public.users` is included, but Supabase `auth` users, Storage bucket metadata/files, project settings, and Edge Functions are outside this SQL export. Verify separate Storage recovery if rollback needs stimulus/report files.
- Hosted readiness, analytics identity, restore capability, and rollback compatibility remain unverified. Vercel Ready indicates deployment state only. Both Supabase projects use the Free plan without scheduled database backups; the linked runbook defines a logical export and disposable local restore gate, with Storage object recovery separate.
