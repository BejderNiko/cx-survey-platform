# System Inventory

Inventory describes expected current shape. Fable must verify each row from implementation and downgrade state on conflict.

## Runtime topology

```text
Authenticated browser
  -> Next.js App Router on local Node/Vercel
     -> local signed session cookie
     -> permission policy
     -> postgres.js app connection
        -> per-transaction JWT claims
        -> PostgreSQL RLS
     -> privileged postgres.js admin connection
        -> sign-in, identity administration, anonymous token flow
     -> internal HTTP bearer secret
        -> stateless FastAPI analytics service

Anonymous respondent
  -> /s/:token or /i/:token
  -> /api/respond/start and /api/respond/complete
  -> capability-token checks
  -> privileged database connection

Target hosted topology
  -> Vercel web
  -> Supabase Postgres/Auth/Storage/Queues in approved environment
  -> Microsoft Entra ID through Supabase Auth
  -> independently deployed containerized analytics API/workers
```

Current hosted topology is incomplete. Vercel build works. Preview runtime has no reachable database.

## Technical stack

| Area | Current implementation | Expected state | Evidence anchors | Main gap/decision |
|---|---|---|---|---|
| Monorepo | pnpm `10.33.0`, Turborepo `^2.5.8` | verified working for build/CI orchestration | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.github/workflows/ci.yml` | Runtime env list covers build needs only; audit all env boundaries |
| Web | Next.js `16.2.10`, React `19.2.4`, strict TypeScript, Tailwind 4, App Router/server actions | working locally; build verified on Vercel | `apps/web/package.json`, `apps/web/app/**`, `apps/web/next.config.ts` | Hosted data/auth/analytics absent |
| Shared domain | TypeScript/Zod schemas, permissions, logic, metrics, sampling, submission, follow-up | verified working where unit tests cover | `packages/domain/src/**`, `packages/domain/test/**` | Verify UI/server use same rules without bypass |
| Analytics | FastAPI, Pydantic, pandas, NumPy, SciPy, statsmodels, scikit-learn, pyreadstat, openpyxl | working locally/tested; hosted runtime planned | `apps/analytics/pyproject.toml`, `src/ok_analytics/**`, `tests/**`, `Dockerfile` | Python baseline inconsistent: package `>=3.11`, Docker 3.11, CI/README 3.12 |
| Database | PostgreSQL 16 locally; plain SQL migrations intended for Supabase | working only locally | `scripts/dev-db.sh`, `supabase/local/auth_shim.sql`, `supabase/migrations/**` | Hosted role/config/seed/cutover unverified |
| Data access | `postgres.js`; app pool plus admin pool | working only locally | `apps/web/lib/db.ts`, `apps/web/lib/auth.ts`, `apps/web/lib/data/**` | Intended prompt named established Supabase client; current app does not use `supabase-js` |
| Authentication | bcrypt dev users; `jose` HS256 httpOnly 12-hour cookie | working only locally | `apps/web/lib/auth.ts`, login actions, ADR-003 | Supabase Auth + Entra cutover planned; session lifecycle needs review |
| Authorization | central role/action matrix plus refreshed membership | working locally; inspect completeness | `packages/domain/src/permissions.ts`, `apps/web/lib/auth.ts`, all server actions/routes | Identity-admin/admin connection bypass needs exhaustive audit |
| Tenant isolation | `org_id`, RLS, `auth.uid()`, `current_org_ids()` | working locally based on RLS tests | migration 004, local shim, `lib/db.ts`, tenant test | Hosted roles and connection semantics not proven |
| Public respondent | public/invitation tokens through privileged connection | scaffolded/partial until hostile-path review | `lib/data/respondent.ts`, respond routes, rate limiter, submission validator | Token entropy/lifecycle, payload limits, replay, distributed rate limit |
| Background work | synchronous imports, distributions, analyses, exports with durable rows | scaffolded/partial | ADR-004, actions, `analysis_runs`, `import_batches`, `outbox_messages` | Supabase Queues/PGMQ and worker deployment planned |
| Storage | normalized operational data; dataset rows inline JSONB | working locally at small scale | migrations 001-003, ADR-005 | Private object storage/Parquet planned; no measured threshold |
| Deployment | GitHub Actions + Vercel web preview | build verified; runtime partial | CI workflow, runbook, prior-session build evidence | Supabase/analytics Preview and Production topology absent |
| Observability | audit events and durable operation states | scaffolded/partial | audit helper, audit table, run records | No verified error tracking, metrics, tracing, SLO alerts, incident integration |
| GDPR operations | consent records and manual anonymization paths | scaffolded/partial | migrations, panel actions, build/QA plan | Retention automation, DPIA, processor review, access/deletion evidence need review |

## Unified data model

| Boundary | Core tables/entities | Ownership and invariant to verify |
|---|---|---|
| Identity/tenancy | `organizations`, `workspaces`, `users`, `memberships` | Active membership grants tenant scope; global users do not become cross-tenant bypass |
| Panel/consent | `panelists`, `custom_fields`, `panelist_attributes`, `consent_records`, `tags`, `panelist_tags`, `panelist_notes`, `segments`, `contact_events`, `import_batches` | Direct identifiers remain here; anonymization and consent/contact rules cover derived copies |
| Studies/versions | `studies`, `study_versions`, `study_collaborators`, `templates` | Published versions immutable; responses pin exact version |
| Distribution | `distributions`, `invitations`, `outbox_messages`, `trigger_events` | Audience snapshot and random seed reproducible; tokens scoped and revocable |
| Responses | `responses`, `response_answers`, `interaction_events` | Server validates path, type, value, required state, finalization, and version |
| Follow-up | `followup_rules`, `followup_cases`, `followup_activity`, `notifications` | Rules cannot cross org; respondent-triggered privileged writes remain bounded |
| Datasets/analysis | `datasets`, `dataset_versions`, `variables`, `transformation_recipes`, `analysis_recipes`, `analysis_runs`, `charts` | Raw responses immutable; lineage, exclusions, seed, versions, and PII limits recorded |
| Insights/collaboration | `insights`, `evidence_links`, `comments`, `audit_events` | Evidence links stay tenant-scoped; audit data does not retain prohibited PII |

## Trust boundaries

| Boundary | Credential/capability | Current enforcement | Review focus |
|---|---|---|---|
| Browser -> web | signed `cx_session` cookie | server-side verification plus route cookie-presence proxy | Forgery, expiry, revocation, CSRF, session claims versus current membership |
| Web -> app DB | restricted `DATABASE_URL` | `withUser()` sets request claims inside transaction | Every query runs in transaction; hosted role cannot bypass RLS |
| Web -> admin DB | privileged `DATABASE_ADMIN_URL` | code convention plus narrow wrappers | Enumerate all call sites; verify authorization/token binding and query scope |
| Respondent -> web | public/invitation token plus response id | route validation, rate limit, server submission validation | Replay, token leakage, cross-response completion, oversized inputs, concurrency |
| Web -> analytics | `ANALYTICS_API_SECRET` bearer | required in staging/production by FastAPI | Secret propagation, network exposure, payload/timeout limits, rotation |
| CI -> services | CI-only values and local PostgreSQL | workflow-scoped env and Linux runner | No secret-like values become runtime proof; action pins and least privilege |
| Vercel -> hosted services | environment-specific connections/secrets | not configured for database/analytics | Preview/Production isolation and localhost fallback fail-fast behavior |

## Test inventory

Repository documentation reports 89 automated cases:

```text
domain       31
web          14
Playwright    8
analytics    36
total        31 + 14 + 8 + 36 = 89
```

Fable must collect or run tests where safe and distinguish test declaration, collection, prior CI result, local result, and hosted runtime evidence. A parameterized pytest function may generate multiple cases; source-function count is not test-case count.

Main test/config anchors:

- `.github/workflows/ci.yml`
- `packages/domain/test/**`
- `apps/web/test/**`
- `apps/web/e2e/core-flow.spec.ts`
- `apps/analytics/tests/**`
- `apps/web/scripts/verify-*.mjs`
- `apps/web/vitest.config.ts`
- `apps/web/playwright.config.ts`

## Known stack deviations

1. Supabase local Docker stack replaced by project-local PostgreSQL 16 and local auth shim.
2. `supabase-js` not used for current data access; `postgres.js` sets Supabase-compatible JWT claims.
3. Supabase Auth and Microsoft Entra ID planned, not implemented.
4. Supabase Storage, Realtime, and Queues not active.
5. Background operations synchronous; durable records are queue migration boundary.
6. Dataset versions inline JSONB; Parquet/private object storage planned for large data.
7. Analytics container exists, but hosted service, private networking, autoscaling, and operations not provisioned.
8. Vercel Preview build works, but runtime database and analytics connections do not.
9. Python runtime documentation/configuration spans 3.11 and 3.12.
10. Production governance and GDPR decisions remain open.

Each deviation needs verdict: accept for vertical slice, accept with merge condition, reject before migration, or defer with measurable trigger.
