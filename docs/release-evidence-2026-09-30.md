# Release evidence and deployment gates — 2026-09-30

## Scope and current decision

Read-only release record for Preview-to-Production planning. No Vercel deployment, environment change, hosted migration, production data operation, commit, or push was performed for this record.

**Decision: NO-GO for Production promotion.** Preview and Production run different source SHAs. Both hosted databases are four migrations behind local source; exact-candidate CI, hosted readiness, and browser acceptance are missing. The merged candidate exists only in a detached local review worktree. Local code and database tests do not prove hosted behavior.

## Verified local source state

| Item | Evidence | Finding |
|---|---|---|
| Checkout | Local `git status` and `git rev-parse HEAD` | Branch `Pr13`; HEAD `d743a78f31e282dccf5a2a7d08c744ea512d3f5c`. |
| Working tree | Local `git status --short` | `Pr13` contains uncommitted feedback, comments, panel import, and migration `20260930000017` changes. These are not in either Vercel deployment. |
| Merged candidate | Detached worktree `promotion-review-2026-09-30`; `git merge --no-commit --no-ff Pr13` against `origin/main` | Production and Preview code conflicts resolved locally; uncommitted Luna changes overlaid. No candidate SHA exists until an authorized commit. No remote action followed the single authorized read-only fetch. |
| Vercel links | Root `.vercel/project.json` and `apps/web/.vercel/project.json` | Root links `cx-survey-platform` (`prj_s2fbQX0ckYWVfbAEcnsnNyIRha5z`); web links `web` (`prj_YyXHOjR4wu2Dcy3JdARRPeEa8UYE`). Live deployment observed below is for `cx-survey-platform`; no live `web` deployment was inspected. |
| Release history | `docs/acceptance-2026-09-18.md` | Record says no push, Preview, production release, or hosted migration/readiness proof in that scope. |
| Current feedback work | `docs/feedback-collaboration-acceptance-2026-09-30.md` | Local acceptance reports migration 17 applied to local PGlite (17/17), direct local RLS checks passed, browser UI smoke partial, Vitest/Playwright blocked before assertions, and hosted readiness/release OUT. |

## Vercel and database identity record

Fill each row from the deployment detail in Vercel and matching environment-specific database evidence. Keep secrets, connection strings, anon/service keys, and environment variable values out of this document. Use `UNKNOWN` until directly observed; never infer deployment SHA from a branch name, local Git state, or READY badge.

| Field | Preview | Production |
|---|---|---|
| Vercel project name and project ID | `cx-survey-platform`; `prj_s2fbQX0ckYWVfbAEcnsnNyIRha5z` (local link agrees) | `cx-survey-platform`; `prj_s2fbQX0ckYWVfbAEcnsnNyIRha5z` (local link agrees) |
| Deployment URL and assigned domain | [Deployment](https://vercel.com/nikolaj-s-projects2/cx-survey-platform/3HAL6KZARbjgoidKEr48qg6cJSBs); alias `https://cx-survey-platform-git-pr13-nikolaj-s-projects2.vercel.app` | [Deployment](https://vercel.com/nikolaj-s-projects2/cx-survey-platform/5MARLi4LvNPsVtR9gqu6o7AHe1hU); alias `https://cx-survey-platform.vercel.app` |
| Deployment ID | `3HAL6KZARbjgoidKEr48qg6cJSBs` | `5MARLi4LvNPsVtR9gqu6o7AHe1hU` |
| Deployment status and created time (UTC) | Ready / Latest; 2026-09-30 11:51:26 UTC (13:51:26 CEST) | Ready / Current; 2026-09-30 11:49:57 UTC (13:49:57 CEST) |
| Environment label shown by Vercel | Preview | Production |
| Git branch and exact source SHA shown by Vercel | `Pr13`; `d743a78f31e282dccf5a2a7d08c744ea512d3f5c` | `main`; `d779b2139df8ae1b935131b9f1768b6f7ca9af7e` |
| Source evidence link / observation time | Deployment detail above; observed by main agent in Vercel IAB on 2026-09-30 (exact observation time not recorded) | Deployment detail above; observed by main agent in Vercel IAB on 2026-09-30 (exact observation time not recorded) |
| Supabase project reference (identifier only) | `mmzjsykbgtoamtmcirjm` (`cx-survey-platform-staging`) | `bfxdgxgodinigcuyllej` (`supabase-cordovan-elephant`) |
| Database migration head and migration count | `20260812000013`; 13 ledger entries | `20260812000013`; 13 ledger entries |
| `/api/health/readiness` status and safe booleans | UNKNOWN | UNKNOWN |
| Analytics deployment identity and health | UNKNOWN | UNKNOWN |
| Browser smoke result and evidence link | UNKNOWN | UNKNOWN |

Promotion comparison:

- [x] Preview and Production SHA values directly observed and recorded.
- [ ] Production candidate SHA matches accepted Preview SHA, or every difference is reviewed and explained. Current values differ: Production `d779b2139df8ae1b935131b9f1768b6f7ca9af7e`; Preview `d743a78f31e282dccf5a2a7d08c744ea512d3f5c`. This proves different deployment sources; it does not prove containment or ancestry.
- [x] Vercel integration scopes show Preview uses `cx-survey-platform-staging` and Production uses `supabase-cordovan-elephant`; project references differ. Secret values were not opened.
- [ ] Preview and Production readiness results recorded without response secrets or private connection data.

## CI gates defined by `.github/workflows/ci.yml`

Workflow triggers on pull requests and pushes to `main`. Workflow defines CI jobs; it does not itself promote a Preview deployment to Production.

| Job / gate | Exact workflow checks | Acceptance evidence |
|---|---|---|
| `web` | `pnpm install --frozen-lockfile`; `pnpm lint`; `pnpm typecheck`; `pnpm --filter @ok/domain test`; `pnpm --filter @ok/web build`; native PostgreSQL initialization and `pnpm seed`; `pnpm --filter @ok/web test` | Green job on exact candidate SHA; preserve run URL and SHA. Database gate uses native PostgreSQL with `cx_app`, not PGlite. |
| `analytics` | Python 3.12; `uv sync --frozen`; `uv run pytest -q` in `apps/analytics` | Green job on exact candidate SHA; preserve run URL and SHA. |
| `e2e` | Depends on `web`; native PostgreSQL initialization and seed; starts analytics service; installs Playwright Chromium; `pnpm test:e2e` in `apps/web` | Green job on exact candidate SHA; preserve run URL and SHA. |

The earlier local acceptance record describes the Preview branch before this merge. On the merged candidate, direct TypeScript checks for web and domain passed, full web ESLint passed with zero warnings, and a fresh in-memory PGlite database applied all 17 migrations with both required new columns present. Database-manager tests passed 26/26 when run in-process (`node scripts/dev-db.test.mjs`). Focused Vitest started zero assertions because esbuild child process creation returned `spawn EPERM`. Next build failed because the review worktree uses a temporary `node_modules` junction outside Turbopack's root; webpack fallback returned `spawn EPERM`. The feedback E2E guard now refuses an existing server and requires the local port-3000 endpoint plus explicit local database URLs. Re-run build, application tests, and E2E in CI on an exact candidate SHA.

## Hosted schema and runtime configuration audit

- Vercel Project environment-variable search found `DATABASE_URL` and `DATABASE_ADMIN_URL` entries scoped separately to Preview and Production. Values were never revealed. Earlier incomplete list view did not establish absence.
- Both Supabase projects show exactly 13 migration-ledger entries. Local merged source contains 17 migration files; `17 - 13 = 4` pending IDs: `20260909000014`, `20260911000015`, `20260911000016`, `20260930000017`. A ledger mismatch alone does not rule out manual SQL changes.
- Read-only catalog checks in both databases found `recruitment_page_questions.source_key` absent and `comments.section_id` absent. Both had zero panelist rows. The two feature-request INSERT policies still restrict submission to owner/administrator.
- Read-only counts in each database also returned zero rows for studies, recruitment pages, recruitment questions, comments, and feature requests. These selected counts do not establish that the entire database or Auth service is empty.
- Read-only `pg_indexes` checks in both databases found `prototype_path_labels_signature_idx` uses `md5(path_signature)`. The merged candidate keeps Production's immutable migration 13 definition and uses the matching `ON CONFLICT` expression. Fresh local PGlite migration check: 17 applied, 17 ledger entries, two required columns found.
- Independent code QA found the E2E server-reuse risk and import failure text persistence. The candidate now starts its own local test server and stores/returns a fixed import failure message. Direct TypeScript and targeted lint passed after these fixes. This does not replace executable E2E or hosted acceptance.
- Hosted `/api/health/readiness` requests were blocked by the browser client. No runtime-ready claim is made. Supabase overview showed no last backup on either project; restoration capability requires verification before hosted migrations.

## Production promotion checklist

Promotion stays blocked until every required gate has evidence attached.

- [x] Preview deployment identity is complete; exact SHA is directly observed.
- [ ] Exact-SHA CI jobs `web`, `analytics`, and `e2e` are green.
- [ ] Preview points to dedicated Preview Supabase (name/scope checked); verify runtime database identity and analytics environment without exposing credentials.
- [ ] Database readiness agent records migration head, schema readiness, and tenant/RLS evidence for Preview. No hosted migration is implied by committed migration files.
- [ ] Preview browser smoke passes agreed sign-in, panel read, survey start/complete, feedback submission, comments, analytics, and error journeys; evidence links recorded.
- [x] Production deployment identity, source SHA, and Supabase project reference are directly observed; analytics environment remains unverified.
- [ ] Database owner confirms backup/restore point, migration sequence, and compatibility with both current and rollback application versions.
- [ ] Rollback deployment below is identified, available, and compatible with the post-migration schema.
- [ ] Production owner gives final promotion approval after reviewing completed evidence.

## Rollback record

Complete before promotion. Vercel code rollback does not reverse Supabase schema changes or environment-variable changes.

| Rollback item | Required record |
|---|---|
| Last known-good Production deployment ID, URL, SHA, and time | UNKNOWN |
| Vercel rollback method and operator | UNKNOWN |
| Current and candidate database migration heads | UNKNOWN |
| Schema compatibility with rollback SHA | UNKNOWN — database owner evidence required |
| Backup / restore point and verification | UNKNOWN |
| Analytics rollback deployment and compatibility | UNKNOWN |
| Post-rollback smoke path and monitoring owner | UNKNOWN |

Do not roll back code if it cannot operate against the current schema. Prefer an approved forward-fix for database incidents. Never treat Vercel rollback as a database rollback.

## Access and evidence blockers

- Main agent verified the two Vercel deployment detail pages listed above in the browser. Live health/readiness endpoint attempts were blocked by the client; no health claim is made.
- Local Vercel CLI launch remained blocked by Windows group policy for this subtask. No remote changes were made.
- Supabase project mapping, migration ledgers, selected schema columns/policies, and the report-label index are directly observed. Hosted readiness response, analytics deployment identity/health, and hosted browser smoke remain **UNKNOWN**.
- Project links and release notes are local repository evidence only. They do not establish current hosted configuration.

## 2026-10-02 candidate update

This section supersedes the September 30 candidate/CI/deployment status above. It does not change the historical observations in that record.

- Candidate source is now committed on `release/pr13-feedback-20261002`, draft [PR #13](https://github.com/BejderNiko/cx-survey-platform/pull/13). Last code/test SHA verified here: `013b0df8d657e1e4dfd8cabb5cedda6f53f3aabc`.
- [CI #50](https://github.com/BejderNiko/cx-survey-platform/actions/runs/36995405311) succeeded on that PR update: `web`, `analytics`, and `e2e` all green; Playwright log reports **10 passed / 10 run**, including viewer feedback, owner inbox, study/section/question comment persistence, reply, resolve, deep link, and scope isolation in one guarded local-database test. Native PostgreSQL seed and RLS tests ran in the `web`/`e2e` jobs. This is local CI acceptance, not hosted Preview acceptance.
- Vercel's canonical `cx-survey-platform` project showed a **Ready Preview** deployment [eNbdLuEbu6tWSp8E82gddARaYuNv](https://vercel.com/nikolaj-s-projects2/cx-survey-platform/eNbdLuEbu6tWSp8E82gddARaYuNv) for exact SHA `013b0df` on October 2. The Production deployment remained the September 30 `main` source `d779b21`; no Production deployment was initiated here. A second Vercel project named `web` has an empty Root Directory and its deployment from the same repository failed with “No Next.js version detected”; the canonical project uses `apps/web`. Its purpose and whether it should remain connected need a separate configuration decision.
- Read-only Supabase dashboard checks on October 2 still found Preview `mmzjsykbgtoamtmcirjm` and Production `bfxdgxgodinigcuyllej` at migration `20260812000013`, 13 ledger entries each. Candidate has 17 migration files, so `17 - 13 = 4` migrations (14–17) remain for **each** hosted database. No hosted migrations, data import, SQL writes, or configuration changes were made. Hosted `/api/health/readiness` and signed-in Preview smoke remain unverified.
- Both projects are on Supabase Free and show no scheduled database backup. [Free-plan backup and restore runbook](supabase-free-backup-restore-runbook.md) defines separate logical exports and a disposable local restore proof. It also records that Storage objects and managed schemas are outside the SQL export. Required CLI/Docker/`psql` tools are unavailable on this managed Windows machine, so neither backup nor restore has been executed.
- Supplied roster contains 3,478 rows and 27 columns; all addresses use `example.invalid`, and no row carries consent source/time. `3,478 / 3,478 = 100%` unusable email addresses for real contact. No real panelist import was performed. The importer rejects rows lacking purpose-specific consent evidence.

**Current decision: NO-GO for hosted migrations and Production.** Before Preview migration, complete the separate backup and restore gate and obtain the project-required migration approval. After Preview schema audit, test readiness and signed-in journeys on the deployed SHA. Production needs its own reviewed migration/deployment decision and final verification.

### October 2 runtime and role finding

- The documentation follow-up at exact SHA `b34f980e785e1858e23cc6741275c5baa92a46c4` also passed [CI #51](https://github.com/BejderNiko/cx-survey-platform/actions/runs/36996090351): web, analytics, and E2E green; E2E log reports **10 passed**. Canonical Vercel Preview deployment [yw4UkPBZbHdwXSAyTkZ5kneLUTmm](https://vercel.com/nikolaj-s-projects2/cx-survey-platform/yw4UkPBZbHdwXSAyTkZ5kneLUTmm) showed Ready for that SHA.
- Signed-in Preview owner session opened `/studies` and `/feature-requests`, but both showed load errors. Vercel runtime logs for those requests report the exact safe message `DATABASE_URL must use the RLS-enforced application role, not an owner or service role.` The application guard rejects known owner/service usernames before connecting; this is a configuration blocker in addition to the migration gap. The error pages are not a hosted functional pass. The direct readiness URL remained blocked by the browser client, so its booleans are still unknown.
- Read-only SQL in Preview `cx-survey-platform-staging` found `cx_app_hosted`: `LOGIN=true`, `BYPASSRLS=false`, member of `authenticated`, `public` usage and SELECT on `public.studies` and `public.feature_requests` all true. The same role-name lookup in Production `supabase-cordovan-elephant` returned **zero rows**. These spot checks do not prove password validity, full grant coverage, or tenant isolation. No secret values were viewed.
- [Hosted role gate](hosted-database-role-gate-2026-10-02.md) records separate Preview and Production configuration and RLS acceptance. Preview needs an approved change to its scoped `DATABASE_URL`; Production needs role provisioning and separate configuration before promotion. `DATABASE_ADMIN_URL` design remains subject to least-privilege review. No hosted role, environment variable, password, migration, or Production deployment was changed.
