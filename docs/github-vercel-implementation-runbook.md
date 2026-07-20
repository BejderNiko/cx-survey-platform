# GitHub, Supabase, and Vercel Implementation Runbook

Status: 17 July 2026. Owner: OK team. This runbook makes no remote changes; every external step is manual and inspectable.

## 1. Target topology

Use one private GitHub monorepo and two Vercel projects:

| Project | Root directory | Runtime | Purpose |
|---|---|---|---|
| `ok-cx-web` | `apps/web` | Node 22 / Next.js 16 | UI, server actions, respondent API |
| `ok-cx-analytics` | `apps/analytics` | Python 3.12 / FastAPI | Statistics, SAV/CSV/XLSX/JSON adapters |

Use two Supabase projects: staging and production. Web server calls analytics over HTTPS with `ANALYTICS_API_SECRET`. Browser never receives database admin URL, Supabase service key, import API secret, Firecrawl key, or analytics secret.

Two Vercel projects give independent runtimes, secrets, scaling, logs, and rollback. Vercel supports monorepo root directories and Git previews; its Python runtime supports FastAPI. See [Vercel monorepos](https://vercel.com/docs/monorepos), [Git deployments](https://vercel.com/docs/git), and [Python runtime](https://vercel.com/docs/functions/runtimes/python).

## 2. First task — protect repository

Live check on 17 July 2026 found `BejderNiko/cx-survey-platform` public with `main` as default branch. Change repository visibility to private before uploading internal source:

1. GitHub → repository → Settings → General → Danger Zone → Change repository visibility → Private.
2. Confirm only approved OK users/teams retain access.
3. Enable secret scanning and push protection if plan supports them.
4. Never push `.env`, database dumps, respondent exports, panel files, `.dev`, `.vercel`, `node_modules`, or `.venv`.

This workspace is not currently a usable Git working copy. Preserve remote history:

1. Clone private repository into a new folder.
2. Create branch `review/hardened-vertical-slice`.
3. Copy reviewed project files into clone, excluding `.git`, `.tools`, `node_modules`, `.next`, `.dev`, `.venv`, caches, and environment files.
4. Inspect `git status` and every staged file.
5. Run local checks where policy permits.
6. Commit to branch and push branch. Open pull request; do not push directly to `main`.

## 3. GitHub repository controls

### Main ruleset

GitHub → Settings → Rules → Rulesets → New branch ruleset:

- Target default branch `main`.
- Require pull request before merge.
- Require at least one independent approval.
- Dismiss stale approvals after new commits.
- Require all conversations resolved.
- Require branches up to date.
- Require checks: `web`, `analytics`, `e2e`, and Vercel preview after each has reported once.
- Block force pushes and deletion.
- Require linear history; use squash merge.
- No routine bypass. Limit emergency bypass to named repository owners and audit its use.

GitHub documents required checks, pull requests, linear history, signed commits, force-push blocking, and deployment requirements in [ruleset rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets).

### Actions controls

- Keep workflow token at `contents: read` unless a job proves need for more.
- Allow GitHub-owned actions plus explicitly approved third-party actions.
- Keep actions pinned to reviewed full commit SHA with version comment; update through reviewed dependency pull requests.
- Enable Dependabot for npm, GitHub Actions, and Python lockfile updates.
- Add dependency-review check if GitHub plan supports private repositories.
- Keep production credentials out of CI. Current CI uses only disposable local database and job-local test secrets.

GitHub recommends full-length action SHA pins in its [secure-use reference](https://docs.github.com/en/actions/reference/security/secure-use). Dependency review can block vulnerable additions before merge; see [dependency review](https://docs.github.com/en/code-security/tutorials/secure-your-dependencies/customize-dependency-review-action).

### Environments

Create GitHub environments `staging` and `production` for any future migration/deployment workflow:

- Production requires reviewer other than initiator where plan supports it.
- Restrict production to `main` or release tags.
- Store environment-specific secrets only in matching environment.
- Never expose production secrets to pull requests.

Environment secrets become available only to jobs using that environment and after configured protection; see [GitHub environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

## 4. Supabase staging first

1. Create staging project in approved EU region.
2. Record project reference, pooled application connection, direct/service migration connection, project URL, anon key, and service-role key in approved password manager.
3. Apply migrations from `supabase/migrations` to staging only.
4. Seed synthetic data only.
5. Run all tenant-isolation tests and inspect Security Advisor.
6. Confirm backups, retention, PITR availability, and restore procedure for chosen plan.
7. Create production project only after staging gate passes.
8. Apply identical migration files to production. Never edit remote production schema directly.

Supabase recommends RLS on exposed tables and Security Advisor review in its [production checklist](https://supabase.com/docs/guides/deployment/going-into-prod). Its [migration guide](https://supabase.com/docs/guides/deployment/database-migrations) says remote schema changes should flow through migration files; coordinate one production migration at a time.

Important: current app still uses local password authentication boundary. Complete Supabase Auth + Microsoft Entra ID cutover before production. Do not publish seeded `demo1234!` accounts.

## 5. Deploy analytics project first

Vercel → Add New Project → import private repository:

- Project name: `ok-cx-analytics`.
- Root Directory: `apps/analytics`.
- Framework: FastAPI/Python auto-detection.
- Production Branch: `main`.
- Python: `.python-version` pins `3.12`.
- Entrypoint: `pyproject.toml` sets `ok_analytics.main:app`.

Set separate Preview and Production values:

| Variable | Preview | Production |
|---|---|---|
| `APP_ENV` | `staging` | `production` |
| `ANALYTICS_API_SECRET` | unique staging random secret | different production random secret |

Generate at least 32 random bytes per environment. Store value in password manager and matching web project environment. Never reuse production secret in preview.

Deploy. Verify:

1. `GET /health` returns exactly `{"status":"ok"}` without credentials.
2. `GET /health/details` without bearer returns 401.
3. Same request with matching bearer returns procedure and library metadata.
4. A small NPS analysis succeeds; invalid bearer fails.
5. SAV round-trip runs under Python 3.12.

Heavy scientific libraries may exceed standard function bundle. First inspect build output. Only if Vercel reports size limit, enable current Large Functions option for preview, retest cold start/cost, then decide production. Vercel documents Python bundle behavior and dependency inclusion in [Python runtime](https://vercel.com/docs/functions/runtimes/python); current limits remain plan-dependent.

## 6. Deploy web project

Vercel → Add New Project → same repository:

- Project name: `ok-cx-web`.
- Root Directory: `apps/web`.
- Framework: Next.js.
- Node.js: 22.
- Install Command: default workspace-aware pnpm install, or explicitly `pnpm install --frozen-lockfile` if detection differs.
- Build Command: `pnpm build` from web project root.
- Output Directory: framework default; do not set manually.
- Production Branch: `main`.

Set environment values. Preview must point to staging services; production must point to production services.

| Variable | Classification | Notes |
|---|---|---|
| `DATABASE_URL` | secret | RLS-enforced application role/pooler connection |
| `DATABASE_ADMIN_URL` | highly privileged secret | server-only connection for token-bound respondent/global identity operations |
| `SESSION_SECRET` | secret | unique per environment, at least 32 random bytes |
| `APP_BASE_URL` | config | exact Vercel/custom URL used in invitation links |
| `ANALYTICS_URL` | config | matching analytics project HTTPS origin |
| `ANALYTICS_API_SECRET` | secret | same value as matching analytics environment |
| `IMPORT_API_SECRET` | secret | required only if Firecrawl import route is enabled |
| `FIRECRAWL_API_KEY` | secret | provider key; different role from import route secret |
| `NEXT_PUBLIC_SUPABASE_URL` | browser-visible config | set during Supabase Auth cutover |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser-visible public key | set during Supabase Auth cutover; not service role |
| `SUPABASE_SERVICE_ROLE_KEY` | highly privileged secret | set server-side only if cutover code uses it |

Do not confuse keys:

- `IMPORT_API_SECRET` authenticates caller to OK import route.
- `FIRECRAWL_API_KEY` authenticates OK route to Firecrawl.
- `ANALYTICS_API_SECRET` authenticates web server to analytics service.
- Supabase anon key is browser-safe only with correct RLS; service-role key bypasses RLS and must remain server-only.

Vercel variables can be scoped to Preview and Production; see [environment variables](https://vercel.com/docs/environment-variables).

## 7. Preview and staging gate

For pull request preview:

1. Confirm Vercel build succeeds from clean checkout.
2. Confirm preview web uses staging Supabase and staging analytics only.
3. Run 89-case CI gate.
4. Run seeded role journeys.
5. Complete public and invitation survey at desktop and 375 × 720.
6. Test failed completion network response; thank-you must not appear.
7. Test changed-file import between dry-run and commit.
8. Run analytics and exports.
9. Run anonymization inspection.
10. Record screenshots/log links and reviewer sign-off in pull request.

Protect preview deployments with Vercel Authentication where it does not break automated E2E. Production protection choice depends on whether platform is internet-reachable or OK-network-only and on Vercel plan. Vercel explains available scopes and plan constraints in [Deployment Protection](https://vercel.com/docs/deployment-protection).

## 8. Production release

Use expand-contract database changes:

1. Backup and verify restore point.
2. Apply backward-compatible production migration.
3. Verify old production app still works.
4. Approve and merge pull request.
5. Vercel deploys `main` to production.
6. Smoke test login, panel read, survey start/complete, response inbox, analytics health/run, and audit event.
7. Monitor errors, latency, database connections, and analytics cold starts for at least one business cycle chosen by OK.
8. Remove temporary migration compatibility only in later release.

Vercel creates preview deployments for branch pushes and production deployment from production branch through Git integration; see [Deploying Git repositories](https://vercel.com/docs/git).

## 9. Rollback

Code incident:

1. Confirm failure in Vercel logs.
2. Use Vercel Instant Rollback to last known-good production deployment.
3. Verify service recovery.
4. Forward-fix on pull request; do not force-push `main`.

Database incident:

- Do not automatically reverse a migration containing data loss.
- Prefer forward-fix migration.
- Restore only under tested incident procedure and explicit data-owner decision.
- Check rolled-back code remains compatible with current schema before routing traffic.

Vercel notes rollback restores previous deployment configuration but not later environment-variable changes and requires external database/API compatibility; see [Instant Rollback](https://vercel.com/docs/instant-rollback).

## 10. Final production checklist

- [ ] GitHub repository private; collaborators reviewed.
- [ ] Pull request ruleset active; `web`, `analytics`, `e2e`, Vercel required.
- [ ] All 89 tests green on GitHub-hosted runners.
- [ ] Supabase staging/prod separated; RLS and Security Advisor reviewed.
- [ ] Entra/Supabase Auth replaces demo password login.
- [ ] Preview uses no production data or secrets.
- [ ] Analytics details endpoint requires bearer; secrets differ by environment.
- [ ] Firecrawl route secret and provider key separated.
- [ ] Production build and 375 px respondent journey pass.
- [ ] GDPR/DPIA, retention, processor agreements, and access ownership approved.
- [ ] Backup/restore and code rollback drills recorded.
- [ ] Production domain, monitoring, incident contacts, and on-call owner set.

## 11. Decisions OK must make before production

1. Approved data region and vendor/legal basis for Supabase and Vercel.
2. Vercel plan/protection mode for an internal production domain.
3. Entra tenant, allowed groups, and role-mapping owner.
4. Recovery point, recovery time, retention, and audit-log periods.
5. Expected peak invitations/concurrency used for load test.
6. Whether analytics stays as Vercel Python project after cost/cold-start test or moves to approved container platform.