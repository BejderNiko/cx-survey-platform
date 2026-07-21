# Claude Opus 4.8 handoff

Upload this ZIP to Claude web, then paste the PGlite implementation prompt supplied by Codex.

## Locked architecture

- Local development and local DB tests: PGlite WASM.
- Native PostgreSQL validation: Linux CI only.
- Hosted staging/production: Supabase managed PostgreSQL.
- Native/local PostgreSQL, Docker, WSL, psql, and Supabase CLI are unavailable on the Windows machine.
- Do not replace Supabase/PostgreSQL architecture.
- Do not connect to hosted Supabase or run hosted migrations during this task.

## Required result

Implement permanent cross-platform PGlite local runtime, safe migration ledger, local-only explicit `SET LOCAL ROLE cx_app`, deterministic seed path without native esbuild, package commands, tests, and documentation. Retain `scripts/dev-db.sh` for authoritative native PostgreSQL CI.

## Known PGlite constraint

PGlite socket startup usernames still execute as `postgres`. Tests must not false-pass. Local user transactions must explicitly execute static `SET LOCAL ROLE cx_app` before setting `request.jwt.claims`; hosted behavior must remain unchanged. Add an assertion proving `current_user = 'cx_app'` in local RLS tests.

## Existing validation

- Auth shim plus five migrations applied in PGlite.
- 40 public tables; RLS enabled on 40; FORCE RLS on 37.
- Deterministic seed: 250 panelists, 94 completed NPS responses, 23 follow-up cases, 25 first-click responses, dataset 94 rows x 12 variables.
- 17 DB behavior checks passed with explicit local role.
- 8 Playwright E2E specs passed.
- Native PostgreSQL 16 remains an authoritative CI-only gate.
- One SPSS `.sav` round-trip remains for Python 3.12/uv CI.

## Safety

Read `AGENTS.md` first. Preserve unrelated changes. No commit, push, branch, remote, GitHub API, `.env`, secret exposure, hosted migration, production data, or provider change. Report files, behavior, commands, tests, risks, manual verification, and confidence.