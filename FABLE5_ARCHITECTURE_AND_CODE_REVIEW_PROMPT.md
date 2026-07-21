# Fable 5 Architecture and Code Review Prompt

## Role

Act as independent architecture, security, data, analytics, and delivery reviewer. Review current pull-request branch as evidence, not as product marketing. First pass is review-only. Do not fix findings.

Working directory:

```text
C:\Users\NIBE\Documents\cx-survey-platform-review
```

Read these instructions before inspecting implementation:

1. `docs/fable5-review/00-handoff.md`
2. `docs/fable5-review/01-system-inventory.md`
3. `docs/fable5-review/02-evidence-manifest.md`
4. `docs/fable5-review/03-review-rubric.md`
5. `docs/fable5-review/04-output-contract.md`
6. `FABLE5_CX_PLATFORM_PROMPT.md` for intended product and stack only

Treat repository code, migrations, executable configuration, and reproducible test output as stronger evidence than these documents.

## Non-negotiable first-pass boundary

Operate source-read-only.

- Do not edit, create, rename, delete, format, or generate repository files.
- Do not commit, stage, push, fetch, pull, merge, rebase, reset, switch branches, create branches, change remotes, or open/update a pull request.
- Do not install or upgrade dependencies.
- Do not read, request, print, copy, or modify credentials or secret values.
- Do not open `.env`, `.env.local`, `.vercel`, credential stores, shell history, or provider dashboards.
- Do not call GitHub, Vercel, Supabase, Azure, Microsoft Entra, Firecrawl, email, or other remote APIs.
- Do not run migrations, seeds, database reset/init scripts, SQL, or commands that modify local or remote databases.
- Do not deploy, provision, connect, or configure infrastructure.
- Do not run Fable-authored scripts or code changes.
- Do not use network access. If a dependency or test needs network, record it as not run.

Ignored build/test output such as `.next`, `.turbo`, Python caches, and test reports must not be deliberately retained or presented as source changes. If a safe command unexpectedly changes tracked files, stop and report exact paths. Deliver review in response only; do not write output into checkout.

Implementation begins only after user reviews findings, Codex independently verifies each Blocker and Major, and user explicitly selects recommendations.

## Baseline gate

Run read-only Git checks first:

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
git diff --shortstat main...HEAD
git diff --numstat main...HEAD | Measure-Object | Select-Object -ExpandProperty Count
git diff --check main...HEAD
```

Expected source baseline:

- branch: `review/hardened-vertical-slice`
- commit: `bceeacde8377f58d191bdc914c39f17d54448212`
- comparison: `main...HEAD`
- diff: 180 files, 23,629 insertions, 6,966 deletions
- allowed untracked review inputs only:
  - `FABLE5_ARCHITECTURE_AND_CODE_REVIEW_PROMPT.md`
  - `FABLE5_CX_PLATFORM_PROMPT.md`
  - `docs/fable5-review/00-handoff.md`
  - `docs/fable5-review/01-system-inventory.md`
  - `docs/fable5-review/02-evidence-manifest.md`
  - `docs/fable5-review/03-review-rubric.md`
  - `docs/fable5-review/04-output-contract.md`

If branch or commit differs, or other tracked/untracked changes exist, stop. Report mismatch. Do not adapt silently.

## Evidence rules

For every material claim:

1. Cite repository-relative path and exact line or tight line range.
2. State evidence type: code, SQL, config, test, command output, prior-session observation, or documentation.
3. State reproduction or reasoning chain.
4. State counter-evidence checked.
5. Assign confidence from `0.0` to `1.0`.

Do not claim capability works because README says so. Do not claim deployed behavior works because CI or Vercel build is green. Do not treat screenshots, plans, ADRs, or original Fable prompt as runtime proof. Documentation can prove intent only.

Classify every reviewed capability as exactly one state:

- `verified working`: direct code plus relevant test/reproduction evidence in appropriate environment
- `working only locally`: direct local evidence exists, hosted path not verified
- `scaffolded/partial`: boundary or subset exists, important behavior or production integration missing
- `planned`: documentation or prompt only; working implementation not found

When evidence conflicts, choose lower state and explain conflict.

## Review method

1. Verify baseline gate.
2. Inspect full `main...HEAD` diff, not only recently discussed files.
3. Inspect current implementation outside diff where needed to understand inherited behavior.
4. Build current architecture and trust-boundary model from code.
5. Compare current architecture with intended product/stack and phased target.
6. Trace tenant identity, authorization, RLS, privileged connections, public tokens, PII, response data, dataset lineage, analytics payloads, and deployment secrets end to end.
7. Audit all rubric categories in `03-review-rubric.md`.
8. Run only existing safe local commands that need no install, network, credentials, or database mutation. Preferred candidates:

```powershell
pnpm lint
pnpm typecheck
pnpm --filter @ok/domain test
pnpm --filter @ok/web build
Set-Location apps\analytics
uv run pytest -q
```

Skip command if runtime, dependencies, or policy make it unsafe. Web tests needing PostgreSQL/seed and Playwright tests needing services are not authorized in this pass. Cite existing CI evidence as prior-session evidence, not fresh local reproduction.

9. Re-run `git status --short` after tests. Report any generated or changed paths.
10. Produce response exactly matching `04-output-contract.md`.

## Required review scope

Cover:

- current PR architecture and complete technical stack
- unified data model and bounded ownership
- multi-tenant isolation, RLS completeness, role grants, `SECURITY DEFINER`, and hosted role model
- local auth, session security, Entra/Supabase Auth cutover, identity-admin bypass
- anonymous respondent capability tokens and privileged data path
- Supabase/Vercel boundaries and environment fallbacks
- secrets and environment-variable flow through Turborepo, Next.js, CI, Preview, and Production
- migration safety, repeatability, hosted compatibility, seed strategy, rollback, backup/restore
- GDPR: data minimization, consent, purpose, retention, anonymization, audit, access/deletion, processors, residency
- import/export safety, formula injection, upload limits, file parsers, error reports, SAV handling
- survey schema, branching, required answers, version pinning, duplicate/finalization behavior, metrics
- analytics contracts, numerical validity, missing values, reproducibility, library/version/seed capture
- synchronous work and future queue/worker boundaries
- scalability, concurrency, payload/storage limits, rate limiting, serverless/runtime constraints
- observability, auditability, SLOs, incident recovery, cost and operations
- CI/CD evidence, test coverage, staging gate, deployment topology, rollback conditions
- documentation accuracy and contradictions
- phased target architecture without inventing unresolved OK governance decisions

## Finding discipline

Severity must follow rubric definitions. No speculative Blocker/Major. Every Blocker/Major needs concrete failure path, affected asset/actor, code or SQL evidence, and verification command/test where possible.

For absence findings, show search scope and why absence matters. For accepted risks, name condition making risk acceptable. For rejected architecture decisions, name safer alternative and migration impact.

Finish without modifying code or infrastructure.
