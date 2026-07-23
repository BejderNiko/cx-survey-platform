# Architecture

One platform, one shared data model, four capability families (panel, research
studies, operational CX, statistics). This document describes what is actually
built and running; `docs/implementation-plan.md` tracks status and gaps, and
`docs/adr/` records the key decisions.

## System shape

```
apps/web        Next.js 16 (App Router, strict TS, Tailwind 4)
                – all product UI, server actions as bounded commands,
                  respondent runtime (/s/:token, /i/:token), route handlers
apps/analytics  Python 3.12 FastAPI service (uv-managed)
                – 21 statistical procedures, CSV/XLSX/JSON/SAV exports,
                  .sav import; stateless, called only by the web backend
packages/domain Shared TypeScript domain: instrument schema + validation,
                survey logic engine, versioned NPS/CSAT/CES metrics,
                permission policy, seeded sampling, follow-up rule engine
supabase/       SQL migrations (Supabase-CLI compatible), local auth shim
scripts/        dev-db.mjs — PGlite (PostgreSQL WASM) local database manager
                dev-db.sh — native PostgreSQL 16 manager (Linux CI gate)
                run-ts.mjs — pure-JS TypeScript runner for the seed (no esbuild)
```

Local run: `pnpm db:init` → `pnpm db:start` (terminal 1) → `pnpm seed` →
`pnpm --filter @ok/web dev` (terminal 2) → `uv run uvicorn
ok_analytics.main:app --port 8000` (analytics terminal). See README.

Database tiers: **PGlite** (WASM, `.dev/pglite`, database `postgres`) for local
development on machines without native PostgreSQL/Docker/WSL; **native
PostgreSQL 16** in Linux CI as the authoritative validation of login roles,
RLS, and real PostgreSQL behavior; **Supabase managed PostgreSQL** for hosted
staging/production. PGlite is never a hosted engine — the environment layer
rejects `LOCAL_DATABASE_ENGINE=pglite` on Vercel Preview/Production and under
`NODE_ENV=production`. Because PGlite executes every socket connection as
`postgres`, authenticated transactions in PGlite mode issue a static
`SET LOCAL ROLE cx_app` before setting JWT claims (see
`docs/adr/008-pglite-local-development.md`).

## Domain boundaries (single PostgreSQL schema, explicit ownership)

| Boundary | Tables | Notes |
|---|---|---|
| Identity & tenancy | organizations, workspaces, users, memberships | roles: owner, administrator, researcher, panel_manager, analyst, viewer |
| Panel & consent | panelists, custom_fields, panelist_attributes, consent_records, tags, panelist_tags, panelist_notes, segments, contact_events, import_batches | Direct identity data lives here; anonymization scrubs identity and unlinks responses, but retained datasets can still contain pseudonymous demographics and free text pending ADR-007 |
| Studies & versions | studies, study_versions, templates, study_collaborators | instrument = versioned JSONB document; published versions immutable |
| Distribution | distributions, invitations, outbox_messages, trigger_events | audience snapshots freeze panelist ids + selection method + random seed |
| Responses | responses, response_answers, interaction_events | every response references the exact published study_version |
| Follow-up | followup_rules, followup_cases, followup_activity, notifications | rule engine runs at response completion |
| Datasets & analysis | datasets, dataset_versions, variables, transformation_recipes, analysis_recipes, analysis_runs, charts | derived datasets are new versions with lineage; raw responses never mutated |
| Collaboration & audit | comments, audit_events | threaded comments stay scoped to studies and questions |

## Security model (three layers)

1. **PostgreSQL row-level security** — every tenant table carries `org_id`; the
   app connects as the non-superuser role `cx_app` and sets Supabase-compatible
   JWT claims per transaction (`lib/db.ts: withUser`). RLS policies allow only
   rows in organizations where the user has an active membership. This is
   covered by automated tests (`apps/web/test/tenant-isolation.test.ts`).
2. **Central permission policy** — `packages/domain/src/permissions.ts` maps
   roles to actions; every server action goes through
   `withAuthorized(action, fn)` which verifies the session, asserts the
   permission, and opens the RLS-scoped transaction. The UI additionally hides
   disallowed controls, but enforcement is server-side.
3. **Capability tokens for anonymous respondents** — the public flow never uses
   the authenticated role. `lib/data/respondent.ts` (the only service-role code
   path) validates a distribution/invitation token and touches only the rows
   that token grants; endpoints are rate-limited and zod-validated.

Auth today is local credential auth (bcrypt + signed httpOnly session cookie)
with seeded users. It is deliberately shaped as the OIDC boundary: swapping in
Supabase Auth + Microsoft Entra ID replaces `verifyCredentials` and cookie
issuance without touching callers (ADR-003).

## Instrument & metric versioning

The survey instrument (blocks, 17 question types, display conditions,
forward-only branch rules, Danish-only mutable drafts, legacy da/en snapshot reading, and messages) is a zod-validated JSONB
document. Publishing snapshots the draft into `study_versions` together with
the **versioned metric definitions** (`nps@1`: 9-10/7-8/0-6,
`% promoters − % detractors`; `csat@1`; `ces@1`) so later wording or banding
changes can never silently corrupt trends. Responses store `study_version_id`,
and results/datasets are computed against that exact version.

The logic engine (`packages/domain/src/logic.ts`) is shared verbatim by the
builder preview and the live respondent runtime, so previews are truthful.

## Analytics pipeline

```
responses (normalized, immutable)
  └─ buildStudyDataset()  → dataset_versions (wide rows JSONB + variables metadata)
       └─ derived versions (filter/column selection, lineage recorded)
            └─ POST /analyses/run (stateless FastAPI)  → analysis_runs
                 results = full statistical contract: method, n, exclusions,
                 missing strategy, assumptions, estimates, CIs, dof, p,
                 effect sizes, library versions, seed
```

Saved `analysis_recipes` (procedure + params) rerun against any dataset version
for reproducibility. Numerical correctness is guarded by 36 pytest fixtures
(hand-computed values, published Spector logistic coefficients, an independent
hypergeometric implementation for Fisher's exact test) plus the cross-check
that the Python NPS equals the TypeScript domain NPS on seed data.

Dataset rows are stored inline as JSONB — right-sized for survey-scale data
(≤ tens of thousands of rows). Parquet in object storage is the documented
upgrade path for large datasets (ADR-005).

## Jobs & delivery

Imports, distribution send-outs, and analyses currently execute synchronously
inside the request/action with durable records (import_batches,
outbox_messages, analysis_runs) capturing state and errors. The queue upgrade
path is Supabase Queues/PGMQ with the same records as job state (ADR-004).
No real email/SMS is ever sent in development: the outbox stores rendered
messages, and delivery events are simulated. `trigger_events` provides the
idempotency-keyed inbound webhook boundary for CRM-triggered surveys
(processing pipeline is a later milestone).

## Production path (documented, not yet provisioned)

Vercel (web) + hosted Supabase (Postgres/Auth/Storage/Queues) + containerized
analytics service (Dockerfile committed; Azure Container Apps preferred,
pending OK cloud governance). Migrations in `supabase/migrations/` are plain
SQL runnable by the Supabase CLI. No remote resources were created — see
ADR-002 for the local-development equivalences and what changes at cutover.
