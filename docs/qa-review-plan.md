# QA / Code Review Plan — OK CX Survey Platform (first vertical slice)

Audience: an independent reviewer (human or AI) doing pre-merge QA of the
`claude/new-session-7retft` branch. The code was built autonomously in one
run; nothing here has had a second pair of eyes yet. Treat every claim in the
docs as verifiable, not as given.

## 1. What you are reviewing

A multi-tenant internal CX platform (panel management, survey studies,
operational NPS/CSAT/CES with closed-loop follow-up, statistical analytics)
consolidating four tool categories. Monorepo:

```
apps/web           Next.js 16 App Router, strict TS — all UI, server actions,
                   respondent runtime (/s/:token, /i/:token), API routes
apps/analytics     Python 3.11 FastAPI — 21 statistical procedures, exports
packages/domain    shared TS domain (instrument schema, logic engine, metrics,
                   permission policy, sampling, follow-up rules)
supabase/          SQL migrations + RLS policies + local-dev auth shim
scripts/dev-db.sh  local PostgreSQL 16 manager (no Docker)
docs/              architecture.md, adr/001-005, implementation-plan.md,
                   source-capability-matrix.md, screenshots/
```

Read first (30 min): `README.md` → `docs/architecture.md` → `docs/adr/*` →
`docs/implementation-plan.md` (acceptance evidence + declared gap list).

## 2. How to run it (needed for behavioral QA)

Prereqs: Node 22 + pnpm 10, Python 3.11 + uv, PostgreSQL 16 server binaries.

```bash
pnpm install
scripts/dev-db.sh init && pnpm seed
cd apps/analytics && uv sync && uv run uvicorn ok_analytics.main:app --port 8000 &
cd apps/web && pnpm dev            # http://localhost:3000
```

Seeded logins (password `demo1234!`): owner@ / admin@ / researcher@ / panel@ /
analyst@ / viewer@ `example.invalid`. Test suites:

```bash
pnpm --filter @ok/domain test        # 25 unit
pnpm --filter @ok/web test           # 13 incl. 8 RLS isolation (needs db+seed)
pnpm --filter @ok/web test:e2e       # 8 Playwright (needs db+seed+analytics)
cd apps/analytics && uv run pytest   # 32 numerical/export fixtures
pnpm typecheck && pnpm lint
```

All 78 were green at handoff. Reproduce that first; a red baseline invalidates
the rest of the review.

## 3. Review priorities (in order)

### P0 — Security & tenant isolation

| Target | Files | What to challenge |
|---|---|---|
| RLS model | `supabase/migrations/20260716000004_rls.sql`, `supabase/local/auth_shim.sql`, `apps/web/lib/db.ts` | Is every tenant table covered? Can any query path run on `appSql` outside `withUser()`? Is `current_org_ids()` (SECURITY DEFINER) abusable? |
| Service-role surface | `apps/web/lib/data/respondent.ts` | This is the ONLY code using the RLS-bypassing connection. Verify every function is gated by a capability token and touches only token-granted rows. Author's concern: `completeResponse` authorizes by `responseId` alone (server-generated UUID returned to the starter) — assess whether that capability is sufficient or should be bound to the token/session. |
| Public API hardening | `apps/web/app/api/respond/*`, `apps/web/lib/rate-limit.ts` | zod limits (200 answers / 50 interactions) but `value` is `unknown` — is there any payload-size cap per answer (e.g. multi-MB long_text)? Rate limiter is in-memory per instance (documented) — confirm acceptable for local milestone. |
| AuthN/session | `apps/web/lib/auth.ts`, `middleware.ts`, `app/login/page.tsx` | HS256 session JWT, 12 h, no revocation list (deactivation cuts data access via RLS but not the session itself). User enumeration via bcrypt timing in `verifyCredentials`. Assess severity for an internal tool. |
| Permission policy | `packages/domain/src/permissions.ts` + every `withAuthorized(...)` call site | Grep all server actions/routes: does any mutation skip `withAuthorized`? Do UI-hidden controls have server enforcement (they should — spec-tested for a few)? |
| File handling | `apps/web/lib/import/parse.ts`, `apps/web/app/(app)/panel/import/actions.ts`, `apps/analytics/src/ok_analytics/exports.py` | Size/extension/MIME caps, XLSX parsing risks, CSV formula-injection sanitization on BOTH export paths (web error report + Python exports). |
| SQL injection | `apps/web/lib/data/panel.ts` (`segmentConditions`) | Field names are interpolated as identifiers via `tx(f.field)` — confirm the zod enum on `segmentFilterField` closes injection, incl. the `attribute`/`key` path. |
| Internal service trust | `apps/web/lib/analytics-client.ts`, `apps/analytics/src/ok_analytics/main.py` | FastAPI has NO auth — localhost-only assumption. Confirm it binds appropriately and flag deployment requirements. |
| Headers/CSP | `apps/web/next.config.ts` | No CSP/security headers configured yet (known gap). Confirm and rank. |

### P1 — Correctness of the domain core

| Target | Files | What to challenge |
|---|---|---|
| Survey logic engine | `packages/domain/src/logic.ts`, `instrument.ts` | Branch/visibleIf semantics, forward-only enforcement, termination. Try to author an instrument in the builder that loops, skips required questions, or strands the respondent. |
| Metric definitions | `packages/domain/src/metrics.ts` + `apps/analytics/.../procedures_basic.py` (nps/csat/ces) | TS and Python must agree (both banding and exclusion rules). Seeded dataset should yield NPS 17 in both. |
| Statistics | `apps/analytics/src/ok_analytics/procedures_*.py`, `tests/test_procedures.py` | Check the statistical contract per procedure (n, exclusions, missing strategy, CIs, dof, effect sizes). Spot-verify 2-3 fixtures independently (e.g. Welch t, Fisher exact, Spector logistic). Judge whether warnings (Levene, small cells, separation) are adequate. |
| Dataset build | `apps/web/lib/dataset-build.ts` | Multi-select → 0/1 indicator columns, matrix → per-row columns, ranking → rank positions; missing handling; pseudonymity (no PII columns beyond gender/birth-year/status when linked — assess re-identification risk at small n). |
| Versioning integrity | `apps/web/app/(app)/studies/actions.ts`, `lib/data/respondent.ts` | Published `study_versions` immutable? Responses always pinned to the version they answered? Duplicate copies no responses/tokens? |
| Follow-up rules | `packages/domain/src/followup.ts`, `lib/data/respondent.ts` (completeResponse) | Rule matching semantics, assignee resolution by email, behavior when rules are malformed. |

### P2 — Data lifecycle & GDPR

- `apps/web/app/(app)/panel/actions.ts` → `anonymizePanelist`: verify the
  scrub is complete (any PII left in `contact_events.detail`, outbox rows,
  audit `details`, dataset versions built BEFORE anonymization?). Author's
  concern: previously built dataset versions retain pseudonymous rows with
  gender/birth-year — decide if that meets "break link irreversibly".
- Import wizard: dry-run vs commit re-parse the client-held file — can the
  file change between steps and diverge from the dry-run report?
- Consent: is `survey_contact` consent actually enforced everywhere contact
  happens (`applyGovernance` in `lib/data/panel.ts` + distribution creation)?

### P3 — Frontend quality & UX

- Respondent runtime (`components/survey/renderer.tsx`): required-question
  bypass attempts, back-button behavior with branches, double-submit,
  first-click on scaled/zoomed images, keyboard-only completion.
- Builder (`app/(app)/studies/[id]/builder/builder.tsx`): destructive edits
  (delete question referenced by branches → validation should block publish),
  unsaved-changes handling.
- Tables/lists: 500-row cap messaging in panel; sorting; empty states.
- i18n: da/en survey variants incl. fallback; locale-aware dates/numbers.
- Accessibility: axe reported 0 serious/critical on core pages — re-verify one
  or two, plus screen-reader sanity of the NPS scale buttons.

### P4 — Code quality / architecture

- Server actions consistency (`revalidatePath` coverage, error surfacing).
- Duplication worth consolidating (e.g. Shell components in `/s` and `/i`
  pages; results aggregation vs analytics procedures).
- Type assertions: postgres.js rows are cast with `as` liberally — spot risky ones.
- ADR quality: do ADR-002/004 deviations (no Supabase stack, sync jobs) create
  hidden production risk not called out?

## 4. Known gaps — do NOT report these as findings (already declared)

See `docs/implementation-plan.md` §"Honest gap list": Supabase/Entra cutover,
reminders/scheduling, CRM connectors (boundary only), card sorting/tree
testing, imputation/mixed models/conjoint, in-memory rate limiting, no CSP,
per-instance sessions, Parquet for large datasets, CI workflow committed but
never executed.
Report them only if you find them **misrepresented** (claimed working when not).

## 5. Deliverable format for findings

For each finding:

```
ID:        QA-###
Severity:  Blocker | Major | Minor | Nit
Category:  security | correctness | data/GDPR | ux/a11y | quality | docs
Location:  path/to/file.ts:line
Claim:     one-sentence defect statement
Evidence:  repro steps or code excerpt (what input/state → what wrong outcome)
Fix:       concrete suggested change
```

Finish with: (a) verdict per P0-P4 area, (b) overall go/no-go for pushing the
branch and proceeding to the Supabase cutover milestone, (c) top 5 fixes in
priority order.

## 6. Time-boxed suggested pass (≈ half a day)

1. 0:30 docs + run app + green test baseline
2. 1:30 P0 security sweep (respondent.ts and RLS first)
3. 1:00 P1 domain/stats spot-verification
4. 0:45 P2 anonymization/import lifecycle
5. 0:45 P3 exploratory UX on seeded data (desktop + 375 px)
6. 0:30 write-up
