# Fable 5 Output Contract

Return one review response. Do not write files. Use following sections in order.

## 1. Executive verdict

Include separate verdicts:

- PR merge: `GO`, `CONDITIONAL GO`, or `NO-GO`
- staging migration: `GO`, `CONDITIONAL GO`, or `NO-GO`
- Vercel Preview runtime: `GO`, `CONDITIONAL GO`, or `NO-GO`
- Production: `GO`, `CONDITIONAL GO`, or `NO-GO`

For each: one sentence, blocking finding IDs, evidence confidence. State exactly what reviewed snapshot means.

## 2. Baseline and evidence ledger

Report:

- branch, full commit, base, diff counts, working-tree state
- safe commands run, exit codes, and result summary
- commands skipped and reason
- files/directories searched for absence claims
- prior-session observations used
- any mismatch from handoff

Show diff calculation:

```text
changed files = ...
insertions = ...
deletions = ...
test total = domain + web + e2e + analytics = ...
```

## 3. Capability-state matrix

One row for every material capability. Columns:

| Capability | State | Code evidence | Test/runtime evidence | Missing proof | Confidence |
|---|---|---|---|---|---|

Allowed states only:

- `verified working`
- `working only locally`
- `scaffolded/partial`
- `planned`

Minimum capabilities: tenancy/RLS, role authorization, local auth, Entra/Supabase Auth, panel/consent, import, studies/versioning, respondent public link, invitation flow, distribution governance, follow-up, datasets/lineage, analytics procedures, SAV, exports, audit, GDPR anonymization, hosted Supabase, Vercel Preview, analytics deployment, queues/workers, observability, backup/restore.

## 4. Current architecture diagram

Mermaid diagram derived from code. Show:

- actors
- trust boundaries
- Next.js components
- app/admin DB connections
- RLS and privileged bypass
- respondent token path
- analytics API and bearer secret
- local versus hosted-unavailable services
- PII and analysis-data flows

Mark verified, local-only, partial, and planned components visibly in labels.

## 5. Phased target architecture diagram

Mermaid diagram plus Phase 0-4 notes. Include Vercel, staging/Production Supabase separation, Entra/Supabase Auth, restricted/admin roles, private object storage, queue, containerized analytics workers/API, observability, backup/recovery. Mark governance choices as `TBD by OK`; do not select them silently.

## 6. Severity-ranked verified findings

Order Blocker, Major, Minor, Nit. Use exact finding template from `03-review-rubric.md`.

Rules:

- No finding without path/line evidence or documented absence search.
- No Blocker/Major without concrete failure path and verification method.
- Include counter-evidence.
- Avoid duplicate findings for same root cause.
- Separate observed defect from future hardening.
- If no finding exists at a severity, say `None verified`.

End section with counts:

```text
Blocker = B
Major = M
Minor = m
Nit = n
Total = B + M + m + n
```

## 7. Architecture decision register

For every decision listed in rubric:

| Decision | Verdict | Evidence | Condition/trigger | Migration/rework impact | Gate |
|---|---|---|---|---|---|

Verdicts: `accept`, `accept with condition`, `reject`, `defer with trigger`.

## 8. Migration-readiness verdict

Answer individually:

- SQL order and clean-database viability
- Supabase extension compatibility
- hosted roles/grants/RLS behavior
- config/linking approach
- synthetic staging seed
- secrets and Preview variables
- migration ledger and drift
- backward-compatible rollout
- rollback/roll-forward
- backup/restore
- explicit approval boundary

Give exact pre-migration evidence checklist. Do not provide runnable remote migration command in first pass.

## 9. PR merge conditions

List conditions as:

```text
MC-01 | finding IDs | owner role | required evidence | gate
```

Separate:

- required before marking Ready for review
- required before merge
- allowed after merge but before staging migration
- required before Production

## 10. Staged remediation roadmap

No code changes. Plan only:

1. Phase A: evidence and Blocker/Major closure
2. Phase B: hosted role/migration readiness
3. Phase C: staging Supabase + Vercel Preview integration
4. Phase D: Entra/Auth and GDPR governance
5. Phase E: production operations and scale

For each: scope, dependencies, owner role, tests/evidence, rollback point, exit gate. Keep source/infra changes pending user selection.

## 11. Test and evidence gaps

Matrix:

| Risk/invariant | Existing test | Fresh result | Missing case | Proposed test level | Gate |
|---|---|---|---|---|---|

Cover tenant isolation, privileged routes, token concurrency/replay, auth cutover, migration/roles, anonymization, import/export abuse, survey path validation, metrics parity, numerical fixtures, queue idempotency, load, Preview smoke, backup/restore.

## 12. Cost and operations risks

For each risk: workload assumption, unknown input, likely cost/operational driver, measurement needed, decision owner, phase. No invented prices.

## 13. Open OK governance decisions

At minimum:

- approved cloud/data region and analytics host
- Entra group-to-role mapping and deprovisioning owner
- legal basis, retention periods, DPIA/DPA ownership
- Production data classification and export controls
- RPO/RTO, SLO, incident ownership, on-call expectations
- expected respondents, panel size, imports, concurrency, analytics workload
- budget/support tiers and vendor approval

For each: consequence of delay and latest decision gate.

## 14. Top five actions

Exactly five, ordered. Format:

```text
1. Action | reason | owner role | evidence of completion | blocked changes
```

Actions must follow review-before-change boundary. No migration, credential, deployment, commit, or code-fix action before user selection and Codex verification of Blocker/Major findings.

## 15. Review limitations and confidence

List unavailable evidence, environment limits, tests not run, remote state not refreshed, inference boundaries. End with overall confidence `0.0-1.0` and short calculation/rationale.

## Codex verification handoff

Final appendix listing only Blocker/Major IDs:

| Finding | Exact paths/lines | Claimed failure | Existing evidence | Independent verification needed |
|---|---|---|---|---|

If no Blocker/Major, state `No Blocker/Major findings to verify`.
