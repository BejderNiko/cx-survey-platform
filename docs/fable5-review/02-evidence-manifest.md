# Evidence Manifest

Inspect whole pull-request diff and security-critical current files. Do not limit review to documents listed here.

## 1. Baseline and diff

Run and cite:

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
git log --oneline --decorate main..HEAD
git diff --shortstat main...HEAD
git diff --name-status main...HEAD
git diff --check main...HEAD
git diff -- . ':!docs/screenshots/**'
```

Use `main...HEAD` for PR change scope. Use direct file reads for current line citations. Do not fetch or update refs.

## 2. Product intent and documentation claims

| Evidence | Required question |
|---|---|
| `README.md` | Which capabilities, commands, versions, and green-test claims match implementation? |
| `FABLE5_CX_PLATFORM_PROMPT.md` | What product/stack was intended? Never use as proof of implementation. |
| `docs/architecture.md` | Does architecture match code and deployment reality? |
| `docs/source-capability-matrix.md` | Are source-derived capabilities implemented, partial, or planned? |
| `docs/implementation-plan.md` | Are completed statuses and gap list accurate? |
| `docs/cx-platform-build-and-qa-plan.md` | Are gates enforceable and evidence current? |
| `docs/qa-review-plan.md` | Which author concerns remain, were fixed, or need stronger evidence? |
| `docs/github-vercel-implementation-runbook.md` | Are environment, migration, release, rollback steps safe and complete? |
| `docs/owner-notes.md` | Are ownership assumptions explicit and current? |
| `docs/adr/001-monorepo-and-stack.md` | Is monorepo/runtime split justified? |
| `docs/adr/002-local-postgres-no-docker.md` | Is local-to-hosted equivalence valid? |
| `docs/adr/003-auth-boundary.md` | Can Entra/Supabase Auth replace local auth without caller/data-model changes? |
| `docs/adr/004-synchronous-jobs-with-durable-records.md` | Are timeouts/concurrency/idempotency safe until queues? |
| `docs/adr/005-dataset-storage-inline-jsonb.md` | Is JSONB threshold measurable and tenant-safe? |

## 3. Build, dependencies, CI, and environment

- `package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `turbo.json`
- `.github/workflows/ci.yml`
- `.gitignore`
- `.env.example` (names/comments only; contains no secret values)
- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/next.config.ts`
- `apps/web/vitest.config.ts`
- `apps/web/playwright.config.ts`
- `apps/analytics/pyproject.toml`
- `apps/analytics/uv.lock`
- `apps/analytics/.python-version`
- `apps/analytics/Dockerfile`
- `packages/domain/package.json`
- `packages/domain/tsconfig.json`

Check version consistency, frozen installs, action pins, permissions, environment propagation, build-time versus runtime settings, server-only separation, localhost fallbacks, caching, and deployment assumptions.

## 4. Authentication, authorization, and request boundaries

Mandatory:

- `apps/web/lib/env.ts`
- `apps/web/lib/db.ts`
- `apps/web/lib/auth.ts`
- `apps/web/proxy.ts`
- `apps/web/app/login/**`
- `apps/web/app/(app)/layout.tsx`
- `packages/domain/src/permissions.ts`
- every `apps/web/app/**/actions.ts`
- every `apps/web/app/api/**/route.ts`

Search all TypeScript/TSX for:

```text
adminSql
appSql
withUser
withAuthorized
withIdentityAdminAuthorized
requireSession
cookies
redirect
process.env
```

For every mutation and sensitive read, identify authentication, action permission, tenant scope, transaction, audit event, input validation, and error behavior.

## 5. Data access and public respondent surface

Mandatory:

- `apps/web/lib/data/panel.ts`
- `apps/web/lib/data/datasets.ts`
- `apps/web/lib/data/respondent.ts`
- `apps/web/lib/dataset-build.ts`
- `apps/web/lib/audit.ts`
- `apps/web/lib/rate-limit.ts`
- `apps/web/app/api/respond/start/route.ts`
- `apps/web/app/api/respond/complete/route.ts`
- `apps/web/app/s/[token]/page.tsx`
- `apps/web/app/i/[token]/page.tsx`
- `apps/web/components/survey/renderer.tsx`
- `apps/web/components/survey/public-runtime.tsx`
- `packages/domain/src/instrument.ts`
- `packages/domain/src/logic.ts`
- `packages/domain/src/submission.ts`
- `packages/domain/src/metrics.ts`
- `packages/domain/src/followup.ts`
- `packages/domain/src/sampling.ts`

Trace token generation, lookup, expiry/revocation state, start, resume, complete, duplicate/concurrent requests, stored identifiers, validation, follow-up writes, and error responses.

## 6. Database schema, migrations, roles, and RLS

Read full files, not search snippets:

- `supabase/migrations/20260716000001_tenancy_and_panel.sql`
- `supabase/migrations/20260716000002_studies_distribution_responses.sql`
- `supabase/migrations/20260716000004_rls.sql`
- `supabase/local/auth_shim.sql`
- `scripts/dev-db.sh`
- `apps/web/scripts/seed.ts`
- `apps/web/test/tenant-isolation.test.ts`

Inventory every table. For each, record tenant anchor, foreign keys, uniqueness, delete behavior, indexes, RLS enabled/forced state, policies, grants, and privileged access. Audit `current_org_ids()` owner, `SECURITY DEFINER`, `search_path`, executable grants, recursion avoidance, and hosted behavior.

Explicitly check absence/presence of:

- `supabase/config.toml`
- `supabase/seed.sql`
- hosted restricted-login-role SQL or documented creation method
- migration ledger/repeatability strategy
- backward-compatible rollout and rollback plan
- backup/restore verification

Do not run SQL or migration commands.

## 7. Imports, exports, and GDPR paths

- `apps/web/lib/import/parse.ts`
- `apps/web/lib/import/validate.ts`
- `apps/web/app/(app)/panel/import/actions.ts`
- `apps/web/app/api/import-batches/[id]/errors/route.ts`
- `apps/web/app/api/dataset-versions/[id]/export/route.ts`
- `apps/web/app/api/import/firecrawl/route.ts`
- `apps/web/app/api/import/firecrawl/crawl/route.ts`
- `apps/web/app/(app)/panel/actions.ts`
- `apps/web/app/(app)/distributions/actions.ts`
- `apps/web/lib/templates.ts`
- `apps/analytics/src/ok_analytics/exports.py`
- `apps/analytics/src/ok_analytics/main.py`
- import/export tests and verify scripts

Trace file size, row count, file type, parser limits, decompression/memory exposure, formula-injection protection, filename/content-disposition behavior, dry-run/commit identity, duplicate rules, PII persistence, anonymization propagation, prior dataset versions, outbox/audit details, and export authorization.

Firecrawl routes are separate research tooling. Verify auth, key separation, input/URL restrictions, response exposure, provider error handling, and whether they belong in production app surface.

## 8. Analytics contract and validity

- `apps/web/lib/analytics-client.ts`
- `apps/web/app/(app)/analytics/actions.ts`
- `apps/web/lib/dataset-build.ts`
- `apps/analytics/src/ok_analytics/contracts.py`
- `apps/analytics/src/ok_analytics/frame.py`
- `apps/analytics/src/ok_analytics/registry.py`
- all `apps/analytics/src/ok_analytics/procedures_*.py`
- `apps/analytics/src/ok_analytics/exports.py`
- `apps/analytics/src/ok_analytics/versions.py`
- all `apps/analytics/tests/**`
- `apps/web/scripts/verify-analytics.mjs`
- `packages/domain/src/metrics.ts`
- `packages/domain/test/metrics.test.ts`

For each supported procedure, check input contract, exclusions, missing strategy, assumptions/warnings, estimates, confidence intervals, degrees of freedom, p-values, effect sizes, weights, deterministic seed, library versions, numerical references, and error behavior. Check TS/Python NPS/CSAT/CES parity.

## 9. Tests and claimed evidence

- `packages/domain/test/**`
- `apps/web/test/**`
- `apps/web/e2e/**`
- `apps/analytics/tests/**`
- `apps/web/scripts/verify-final.mjs`
- `apps/web/scripts/verify-study-flow.mjs`
- `apps/web/scripts/verify-import.mjs`
- `apps/web/scripts/verify-analytics.mjs`
- `docs/screenshots/**` only as visual historical evidence

Map every high-risk invariant to tests. Record whether test was inspected, collected, run locally now, reported green in prior CI, or not run. Green suite does not prove uncovered behavior.

## 10. Evidence quality and citation format

Rank evidence:

1. Fresh reproducible command/test output in allowed local scope.
2. Current executable code/SQL/config with traceable reasoning.
3. Prior-session CI/runtime observation tied to exact commit.
4. Tests not run in this pass.
5. Documentation/screenshots/prompts.

Every finding citation format:

```text
path/to/file.ext:line or path/to/file.ext:start-end
```

Use tight ranges. Cite test path/line separately. For absence claims, cite search command and directories inspected. Never cite absolute user paths in final review except working-directory baseline.
