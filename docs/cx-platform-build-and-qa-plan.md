# OK CX Platform — Build and QA Plan

Status: 17 July 2026. Scope: one OK-owned platform combining operational CX measurement, usability research, panel recruitment, and statistical analysis.

## 1. Product outcome

Build one governed research system. Users create studies, recruit or sample participants, collect version-pinned responses, analyze immutable datasets, and close customer cases without copying data between NPS, Preely, SPSS, and Lyssna.

Success means:

- One participant and consent model across every research method.
- One immutable study/version/response chain, so published questions and collected answers stay reproducible.
- One dataset and variable model for survey, usability, and imported SPSS data.
- One permission, tenant-isolation, retention, and audit model.
- Danish and English respondent flows.
- Deployable web and analytics services with preview, staging, production, and rollback paths.

## 2. Capability map

| Source category | Capabilities to preserve | Unified platform location |
|---|---|---|
| NPS tools | NPS/CSAT/CES, link/email distribution, reminders, dashboards, detractor follow-up | Study metrics, distributions, response inbox, follow-up cases |
| Preely | First-click tasks, moderated/unmoderated usability tasks, task success, time and interaction evidence | Study methods, task blocks, interaction events, usability results |
| SPSS | Typed variables, labels, missing values, transformations, statistical procedures, SAV import/export | Dataset versions, variable dictionary, recipes, analysis runs, export service |
| Lyssna | First-click, preference/five-second tests, card sorting, tree testing, participant recruitment | Study methods, stimuli, task events, panel and sampling |

Current code is a first vertical slice. It implements survey studies, branching, panel governance, NPS/CSAT/CES, first-click capture, response datasets, 21 analytics procedures, SAV/CSV/XLSX/JSON adapters, follow-up cases, and audit/RLS foundations. Card sorting, tree testing, preference/five-second testing, Entra authentication, scheduled reminders, and production connectors remain roadmap work.

## 3. Shared data model

Every feature must use these entities instead of building method-specific silos:

1. `Organization`, `User`, `Membership`, `Role` — tenant and permission boundary.
2. `Panelist`, `ConsentRecord`, `ContactEvent`, `Tag`, `Attribute` — participant identity and governance.
3. `Study`, `StudyVersion`, `Block`, `Question/Task`, `Stimulus` — authoring and immutable publication.
4. `Distribution`, `Invitation`, `AudienceSnapshot` — recruitment and frozen sample definition.
5. `Response`, `Answer`, `InteractionEvent` — version-pinned research evidence.
6. `Dataset`, `DatasetVersion`, `Variable`, `Recipe`, `AnalysisRun` — reproducible analytics.
7. `FollowupRule`, `FollowupCase`, `AuditEvent` — operational action and accountability.

Rules:

- Published study versions never change.
- Response always references exact published version and capability token.
- Analysis reads one immutable dataset version.
- Dataset lineage records study version, recipe, seed, library versions, and creation time.
- Direct identifiers stay in panel domain. Analysis receives pseudonymous rows and approved attributes only.
- Tenant data access uses RLS-scoped transactions. Service connection stays limited to token-bound respondent and global-identity operations.

## 4. Delivery sequence

### Phase 0 — Secure foundation

Outcome: deployable multi-tenant skeleton.

Work:

- Supabase staging and production projects in approved EU region.
- Microsoft Entra ID through Supabase Auth; remove local password shim from production.
- Apply migrations through source-controlled migration files only.
- Verify RLS on every tenant table with cross-tenant tests.
- Central role policy, current-membership refresh, audit events, secret rotation, security headers, CSP, distributed rate limiting.

Exit gate:

- No tenant escape in automated RLS tests.
- Deactivated or demoted member loses server authorization on next action.
- No production fallback secret or localhost endpoint.
- Security Advisor reviewed; critical/high items closed or accepted in writing.

### Phase 1 — Operational CX vertical slice

Outcome: replace basic NPS workflow end to end.

Work:

- Study builder, validation, immutable publication, public/invitation distribution.
- NPS/CSAT/CES collection with branching, required answers, multilingual labels.
- Panel consent, cooldown, contact caps, sampling, invitation status.
- Response inbox, live results, follow-up rules and cases.
- Version-specific wide dataset build and export.

Exit gate:

- Token cannot start duplicate invitation responses or finalize another token's response.
- Server reconstructs survey path and rejects forged status, type, range, required answer, and first-click metadata.
- Dataset contains only latest selected immutable study version; lineage names version.
- Completion errors remain visible and never show false thank-you state.

### Phase 2 — Usability research parity

Outcome: cover Preely/Lyssna research methods on same study engine.

Work:

- First-click heatmaps with image-coordinate normalization and device metadata.
- Task-success and time-on-task events.
- Five-second and preference tests.
- Open/closed card sorting with similarity matrix and dendrogram output.
- Tree testing with path success, directness, and time.
- Stimulus asset lifecycle, accessibility alternatives, and consent-safe session evidence.

Exit gate:

- Each method has schema validation, respondent renderer, result aggregation, export variables, and desktop/mobile E2E path.
- Coordinates, paths, rankings, and timings are validated server-side.
- Method data becomes ordinary dataset variables/interactions, not separate ungoverned storage.

### Phase 3 — SPSS-style analytics

Outcome: analysts can work without exporting routine studies to SPSS.

Work:

- Variable dictionary, labels, value labels, user/system missing values, measures, weights, filters, recodes, computed variables.
- Descriptives, crosstabs, tests, regression, reliability, factor/cluster, bootstrap, CX metrics.
- Saved recipes and immutable analysis runs with seed and library versions.
- CSV/XLSX/JSON/SAV import/export with formula-injection protection.
- Add multiple imputation, mixed models, conjoint, and large-data Parquet only after core usage proves demand.

Exit gate:

- TS and Python metric definitions agree on shared fixtures.
- Numerical tests include known reference values, edge cases, exclusions, degrees of freedom, confidence intervals, and warnings.
- SAV round-trip preserves supported labels and values under Python 3.12.

### Phase 4 — Production operations

Outcome: dependable internal service.

Work:

- Scheduled reminders, outbox provider, bounce/unsubscribe handling.
- CRM and data-warehouse connectors through queued, idempotent jobs.
- SLO dashboards, error tracking, audit retention, backup/restore drill, incident runbook.
- Data retention schedules, deletion requests, DPIA, DPA/vendor review, access review.

Exit gate:

- Restore drill proves recovery point and recovery time targets chosen by OK.
- Rollback works for code without rolling back incompatible database migrations.
- One owner is named for security, data protection, product, and service operations.

## 5. Automated quality gate

Pull request gate must run on clean Linux runners with Node 22, pnpm 10.33, and Python 3.12.

Current test inventory calculation:

- Domain unit cases: 31.
- Web unit/RLS cases: 14.
- Browser cases: 8.
- Analytics cases: 36.
- Total: `31 + 14 + 8 + 36 = 89` automated cases.

Required checks:

1. Frozen dependency install.
2. Lint with zero errors. Existing warnings need a tracked cleanup issue; new warnings fail review.
3. Domain and web TypeScript checks.
4. Domain unit tests.
5. Production Next build.
6. Local PostgreSQL migration + seed from empty database.
7. Web unit and tenant-isolation tests.
8. Python tests, including numerical and export round-trips.
9. Playwright core journey with analytics service and database.

Release gate adds:

- Desktop Chromium plus 375 × 720 mobile respondent check.
- Owner, researcher, panel manager, analyst, and viewer role journeys.
- Public link, invitation, disqualification, duplicate-click, network-failure, and already-completed paths.
- CSV/XLSX import at valid, invalid, duplicate, changed-after-dry-run, and 20,001-row boundary cases.
- GDPR anonymization inspection across panelist, invitation, outbox, response links, notes, attributes, tags, consent, and contact detail.
- Accessibility: keyboard completion and zero serious/critical axe violations on login, builder, panel, respondent, results, and analytics.

## 6. Performance and reliability targets

Initial targets require validation against OK usage forecasts before production:

- Respondent start/complete: p95 below 750 ms excluding platform cold start.
- App read actions: p95 below 1 second for seeded/expected production volume.
- 20,000-row import: explicit progress or completion within chosen server timeout; never silent truncation.
- Analysis requests: deterministic result for same dataset version, parameters, libraries, and seed.
- Error budget and concurrency target: set from expected monthly invitations and peak launch traffic, then load-test at 2× expected peak.

Targets are acceptance criteria, not measured claims.

## 7. Go/no-go rules

Block release for:

- Tenant escape or service-route authorization bypass.
- Invalid/forged respondent data accepted.
- Dry-run/commit divergence or silent import truncation.
- Direct identifier left reachable after anonymization beyond approved legal/audit retention.
- Failed migration from clean database or failed restore drill.
- Red required CI check or failed production build.

Do not promote to production on local-only evidence. Required sequence: pull request CI → Vercel preview → staging database smoke test → data/security sign-off → production promotion.

## 8. Review status of supplied snapshot

Implemented during review:

- Current-role refresh for every authorized server operation.
- Token-bound and idempotent invitation response start/completion.
- Server-side instrument/path/value/status/interaction validation.
- Completion error handling and retry-safe start.
- Version-specific dataset generation.
- File/sheet/mapping/count-bound import commit and hard 20,000-row rejection.
- Broader anonymization scrub for outbox and invitation tokens.
- Analytics bearer authentication and minimal public health response.
- Security headers, local-font build, monorepo root, worker-thread build, Next 16 proxy migration.
- CI production build, Python 3.12 pin, frozen Python sync, least token permission, concurrency, timeouts, and action-version pins.

Local evidence from this review must be read with environment limits:

- Domain TypeScript: passed.
- Web TypeScript: passed.
- ESLint: 0 errors, 6 warnings.
- Next production build: passed.
- Analytics: 35 cases passed locally; SAV round-trip remains unexecuted under supported Python because available local Python 3.14 crashes inside native `pyreadstat`.
- Vitest and Python Playwright: blocked by Windows group policy (`spawn EPERM` / WinError 1260), not test failures.
- GitHub CI and browser staging run: not executed yet.

Verdict: vertical-slice source is ready for a protected pull request, not direct production deployment. Production remains no-go until all 89 CI cases and staging/manual release gates pass.