# Implementation plan & status

Updated: 2026-07-16 (first vertical-slice milestone complete)

## Delivery sequence status

| # | Phase | Status |
|---|-------|--------|
| 1 | Discovery & source capability matrix | ✅ done (`docs/source-capability-matrix.md`, 61 capability rows) |
| 2 | Architecture, domain model, repo setup | ✅ done (`docs/architecture.md`, ADR 001-005) |
| 3 | Auth, tenancy, roles, navigation, DB, deterministic seed | ✅ done |
| 4 | Panel list/profile/segments/governance + real import workflow | ✅ done |
| 5 | Survey builder/versioning/preview/duplicate/publish/respond | ✅ done |
| 6 | Distribution simulation, delivery tracking, inbox, follow-up rules | ✅ done |
| 7 | Quick + advanced analytics, core statistics, charts, exports | ✅ done |
| 8 | Collaboration, insights repository, audit, privacy workflows | ✅ done (first version) |
| 9 | Browser/accessibility checks, numerical validation, docs | ✅ done |

## Acceptance criteria evidence

1. **Role differences** — six seeded users; Playwright specs prove viewer has no
   admin/builder/publish/run-analysis controls and gets "No access" on /admin.
2. **Tenant isolation** — 8 automated RLS tests against the real DB (cross-tenant
   reads empty, writes rejected, no-claims sees nothing, deactivation revokes).
3. **Dummy panelists** — 250 deterministic fictional panelists
   (`example.invalid`, seed 20260716, distributions documented in
   `apps/web/scripts/seed.ts`) with profiles, tags, filters, saved segments,
   seeded random sampling, consent records, contact history, frequency caps.
4. **Import** — CSV/XLSX wizard with preview, auto-mapping, validation, dedup
   (external_id/email/none), consent confirmation, dry run, commit, audit
   events, downloadable error report; verified end-to-end in Chromium.
5. **Study lifecycle** — create from template/blank, builder with 16 question
   types + branching, duplicate (no responses/tokens), preview, publish
   (immutable versions), pause/close/resume.
6. **Respondent completion** — public + tokenized links; verified on 375px and
   1280px viewports incl. branching (detractor/promoter paths) and first-click.
7. **Version linkage** — responses store `study_version_id`; inbox shows it;
   results compute against the exact published version.
8. **NPS fixture** — domain test proves (9-10/7-8/0-6, %P−%D, transparent
   denominator, exclusions); Python and TS implementations agree on seed data (17).
9. **Rule → assigned follow-up** — Playwright spec: NPS ≤ 6 response creates a
   case assigned to the researcher with due date and alert.
10. **Derived dataset without mutating raw** — derive tab (filter + columns)
    creates new dataset + version with lineage; responses untouched.
11. **Statistics vs fixtures** — 32 pytest cases: hand-computed ANOVA
    (F=3.0, p=0.125), Welch t, r=0.8 fixture, Yates chi², independent Fisher
    implementation, published Spector logistic coefficients, alpha=1 fixture,
    NPS/CSAT/CES bands, bootstrap determinism, kmeans separation. Charts:
    bar, histogram, box, heatmap, correlation matrix, NPS trend line,
    bootstrap distribution, first-click map (8 types on seeded data).
12. **Raw export** — CSV/XLSX/JSON/SAV with codebook/labels; round-trip tests
    for all four; formula-injection sanitization tested.
13. **Reproducible analysis** — saved recipes rerun via UI and record dataset
    version, params, seed, and library versions on every run.
14. **Collaboration** — comments on studies/insights; viewer can read shared
    studies/results/analyses but has no modify controls (spec-tested).
15. **Accessibility** — axe-core (WCAG 2.0/2.1 A+AA) on core pages: 0
    serious/critical violations; keyboard focus visible and functional in the
    respondent runtime.
16. **Responsive verification** — screenshots at 1366×850 and 375×812 in
    `docs/screenshots/`; no horizontal overflow on any checked page.
17. **Clean checkout** — README quickstart covers install → db init → seed →
    run → test for both runtimes.

## Test inventory (all green at time of writing)

- `packages/domain`: 25 Vitest tests (metrics, logic engine, permissions, sampling)
- `apps/web`: 13 Vitest tests (8 RLS tenant isolation, 5 import validation)
- `apps/web` e2e: 8 Playwright specs (roles, panel, closed loop, analytics)
- `apps/analytics`: 32 pytest tests (numerical fixtures + export round-trips)

## Honest gap list (next milestones, highest value first)

1. **Supabase cutover** — hosted project, Supabase Auth + Entra ID, Storage,
   Queues; retire the local auth shim (ADR-002/003/004). Blocked on OK
   decisions: data residency (EU region), Azure tenant credentials.
2. **Distribution depth** — reminders, scheduling/quotas/throttling beyond
   caps, trigger_events processing pipeline (idempotent consumer exists as a
   boundary only), real email provider behind explicit configuration,
   delivered/bounced simulation → provider webhooks.
3. **Research methods** — first-click is fully implemented; card sorting, tree
   testing, preference tests, five-second tests, prototype/live-website tasks,
   think-aloud records are **not built** (deliberately no decorative UI).
4. **Analytics** — imputation workflow, weighted estimates beyond weighted
   means, rotated factor solutions, GLM/mixed models, decision trees, conjoint,
   complex samples, dashboards/saved chart layouts, qualitative coding
   workspace (tagging/themes), Parquet-backed large datasets.
5. **Panel** — enrichment campaigns, bias-control filters (opened-message),
   panel health trend charts, retention/anonymization scheduling (manual
   anonymization works today).
6. **Insights** — full-text search is ILIKE-based today; Postgres FTS or
   pgvector is the milestone; report exports (PDF) not built.
7. **Ops** — rate limiting is per-instance in-memory; needs a shared store
   behind a real deployment. No CSP headers yet. Session revocation list.
8. **Connectors** — Outlook/Teams/Dynamics/Salesforce/Zendesk are architecture
   boundaries (trigger_events + notifications), no live integrations. None are
   presented as working in the UI.

## Deviations from the required stack (all recorded as ADRs)

- Supabase local stack replaced by project-local PostgreSQL + auth shim
  (no Docker daemon available) — ADR-002.
- supabase-js not used locally; postgres.js with per-transaction JWT claims
  gives the same RLS enforcement — ADR-002.
- Supabase Queues/PGMQ deferred; synchronous execution with durable job
  records — ADR-004.
- shadcn/ui used as a style direction with lean local primitives rather than
  the generator CLI; React Hook Form reserved for the import wizard forms
  where validation complexity warrants it.
- Vercel/GitHub environments, previews, and branch protection are documented
  expectations; provisioning them requires account access this run does not
  have (no remote resources were created).
