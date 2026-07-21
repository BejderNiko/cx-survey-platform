# Review Rubric

## Severity

| Severity | Definition | Merge effect |
|---|---|---|
| Blocker | Credible path to cross-tenant access, privileged bypass, secret/PII exposure, destructive/irreversible data loss, invalid migration, materially wrong analytics used for decisions, or no safe staged deployment path | PR and staging migration no-go |
| Major | Important security, correctness, GDPR, reliability, or operations defect likely under realistic use; architecture decision creates high rework or unsafe cutover | Must fix or explicitly accept with owner and deadline before relevant gate |
| Minor | Bounded defect, weak defense, missing test/observability, or documentation mismatch with limited immediate impact | Track with clear priority |
| Nit | Readability, consistency, or low-risk maintainability issue | Optional |

Severity requires impact plus likelihood plus reach. Do not inflate severity from theoretical possibility alone.

## Mandatory finding fields

```text
ID: F5-###
Severity: Blocker | Major | Minor | Nit
Category: one rubric category
Capability state: verified working | working only locally | scaffolded/partial | planned
Location: path:line or tight range
Claim: one falsifiable sentence
Evidence type: code | SQL | config | test | command | prior-session | docs
Evidence: input/state -> execution path -> wrong outcome
Counter-evidence checked: relevant guard/test and why insufficient or sufficient
Impact: actor, tenant/data/system, and scope
Reproduction/verification: safe command or test design
Recommendation: concrete change or decision, without implementing it
Gate: PR merge | staging migration | Preview | Production | backlog
Confidence: 0.0-1.0
```

## Security and identity

| Category | Required checks |
|---|---|
| Tenant isolation | Every tenant table/policy; cross-org reads/writes; global `users`; nullable `org_id`; joins/subqueries; RLS enable versus force; app-role ownership/bypass; tests for all operation types |
| Privileged access | All admin/service connection call sites; identity administration; anonymous respondent flow; token-row binding; least privilege; audit; error paths; concurrency |
| RLS function safety | `SECURITY DEFINER` owner and grants; fixed `search_path`; recursive membership lookup; callable surface; hosted Supabase semantics |
| Authentication | bcrypt/local login, timing/user enumeration, cookie signing/claims/expiry, secure flags, CSRF, revocation/deactivation, password handling, login error handling |
| Entra/Supabase Auth cutover | Identity linking, callback/session refresh, group/role mapping, multi-org selection, deprovisioning, invite flow, MFA/conditional access boundary, migration of dev users |
| Hosted database roles | Restricted app role design, admin/service role, pooler compatibility, RLS subject claims, password rotation, connection scope, role ownership and grants |
| Secrets | `.env.example`, server/client bundling, Turbo env filtering/cache, CI values, Preview/Production separation, fallbacks, rotation, logs/errors, Firecrawl key split, analytics bearer |
| Public APIs | Rate limiting, distributed enforcement, payload/body caps, token entropy/leak/replay, enumeration, CORS, cache headers, abuse and denial of service |

## Data, privacy, and migration

| Category | Required checks |
|---|---|
| Migrations | Clean-database order, idempotency/retry, extensions, locks, grants/default privileges, role assumptions, RLS timing, backward compatibility, data backfill, Supabase compatibility |
| Migration readiness | `config.toml`, project linking policy, staging target proof, seed path, migration ledger, dry run, approval boundary, rollback/roll-forward, backup/restore |
| GDPR/data lifecycle | Purpose/legal basis decision points, consent history/enforcement, minimization, direct versus indirect identifiers, retention, anonymization/deletion propagation, subject access/export, audit retention, processor/subprocessor and residency boundaries |
| Import safety | Type/size/row/sheet limits, parser behavior, ZIP/XLSX risk, dry-run/commit equivalence, dedup, encoding, formula injection, malformed values, PII logging, partial failure |
| Export safety | Authorization/tenant scope, formula injection in every format, filenames/headers, memory limits, supported SAV metadata, audit, data minimization |
| Unified data model | No feature silos; foreign-key org consistency; immutable version/lineage; tenant-safe evidence links; panel/response/analysis identity separation |

## Product and analytics correctness

| Category | Required checks |
|---|---|
| Survey correctness | Instrument schema, question types, branching/visibility, forward-only/termination, required answers, localization, version immutability, duplicate study, start/resume/finalize, concurrency, forged submissions |
| Distribution correctness | Consent, cooldown/caps, sampling seed, audience snapshot, invitation status, unsubscribe/bounce, duplicate sends, idempotency, quotas/scheduling claims |
| Metrics | NPS/CSAT/CES banding/denominators/exclusions/versioning; TS/Python parity; missing/invalid values |
| Analytics validity | Procedure-specific statistical contract; fixtures/reference values; assumptions/warnings; small samples; missingness; weights; confidence intervals; multiple testing if applicable; deterministic seeds; library versions |
| Dataset correctness | Exact study-version selection, multi-select/matrix/ranking/interaction encoding, variable metadata, missing rules, lineage, pseudonymity, transformations, raw immutability |
| Follow-up correctness | Rule matching, malformed rule behavior, cross-org assignee resolution, duplicate cases/alerts, response completion transactionality |

## Architecture, delivery, and operations

| Category | Required checks |
|---|---|
| Scalability | Vercel limits, DB pool/concurrency, synchronous request time, upload/export memory, JSONB payloads, analytics payload transfer, queue trigger, rate limiter, 2x peak test plan |
| Deployment topology | Preview/staging/Production isolation; web/database/analytics network; URL/env mapping; cold starts; private service access; provider region alignment |
| CI/CD | Required checks, DB/e2e realism, action pins, frozen locks, least permissions, cancellation/timeouts, artifacts, branch protection claims, environment promotion |
| Observability | Structured logs, correlation/request IDs, metrics, traces, audit coverage, PII/secret redaction, SLO/error budget, provider/runtime alerts, durable job errors |
| Rollback/recovery | Code rollback with forward-only schema, migration recovery, backup/restore drill, RPO/RTO, job replay, incident runbook, ownership |
| Cost/operations | Vercel/Supabase/analytics capacity assumptions, egress, connection pooling, storage growth, logs, backups, support plans, operator workload |
| Documentation accuracy | README/architecture/ADRs/plans/current code/CI/runtime agree; local, scaffolded, and planned features not presented as hosted working |

## Architecture-decision verdicts

For each listed decision, return `accept`, `accept with condition`, `reject`, or `defer with trigger`:

1. pnpm/Turborepo monorepo.
2. Next.js/Vercel web boundary.
3. Separate stateless Python/FastAPI analytics service.
4. Unified PostgreSQL/Supabase system of record.
5. Direct `postgres.js` data access versus `supabase-js`.
6. Local PostgreSQL/auth shim equivalence.
7. Local credential auth boundary before Entra/Supabase Auth.
8. Central TypeScript permission matrix plus PostgreSQL RLS.
9. Privileged connection for identity and anonymous respondent paths.
10. Synchronous jobs with durable records.
11. Inline JSONB dataset versions with Parquet upgrade path.
12. Separate persistent staging Supabase project.
13. Vercel Preview -> staging, Vercel Production -> Production mapping.
14. Containerized analytics target, including Azure Container Apps option.

State evidence, condition/trigger, migration cost, and gate affected.

## Decision-quality rules

- Distinguish defect from accepted vertical-slice limitation.
- Distinguish local security evidence from hosted Supabase behavior.
- Distinguish compile/build success from runtime integration.
- Distinguish declared test count from tests collected/run.
- Distinguish no destructive SQL text from safe production migration.
- Do not invent Entra groups, retention periods, legal basis, region, RPO/RTO, capacity, or budget.
- Convert unresolved business choice into governance decision with named owner role and deadline gate.
