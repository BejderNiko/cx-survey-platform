# CX Survey Platform

Intern survey-platform til OK CX & Market Insights — one platform replacing
separate tools for panel management, UX research studies, operational CX
(NPS/CSAT/CES with closed-loop follow-up), and statistical analysis.

> Baggrund: Samlet set er der årlige udgifter på +500.000 DKK om året på
> separate værktøjer, som hver især kun bruges delvist. Denne platform samler
> panel, undersøgelser, operationel CX og analyse i ét system.

## What is in the box

- **Panel** — panelists with profiles, consent records, tags, notes, saved
  segments, contact governance (cooldown, caps), CSV/XLSX import with dry run
  and error reports, GDPR anonymization.
- **Studies** — survey builder (16 question types incl. NPS/CSAT/CES, matrix,
  ranking, first-click tests), Danish/English variants, branching and display
  logic, immutable published versions, templates, duplicate, live results.
- **Distributions** — public links with QR, tokenized panel invitations with
  governance-checked, seed-recorded random sampling, simulated dev outbox
  (no real sending), delivery funnel tracking.
- **Responses & Follow-up** — response inbox linked to exact instrument
  versions, rule engine (e.g. NPS ≤ 6 → assigned case + alert), case workflow
  with SLA, notes, and outcomes.
- **Analytics** — versioned datasets built from responses (raw data never
  mutated), variable metadata (labels, measurement levels, missing rules),
  21 statistical procedures with a full statistical contract, Plotly charts,
  reproducible saved recipes, CSV/XLSX/JSON/SPSS-.sav export with round-trip
  tests.
- **Collaboration & governance** — threaded study/question comments; audit log; role-based administration.

See `docs/cx-platform-build-and-qa-plan.md` (unified roadmap + gates),
`docs/github-vercel-implementation-runbook.md` (manual release steps),
`docs/architecture.md`, `docs/implementation-plan.md` (status + honest gap list),
`docs/source-capability-matrix.md` (product research evidence), and `docs/adr/`
(key decisions). Screenshots: `docs/screenshots/`.

## Quickstart (clean checkout)

Prerequisites: Node 22 + pnpm 10, Python 3.12 + [uv](https://docs.astral.sh/uv/).
The local database is **PGlite** (PostgreSQL compiled to WebAssembly, run by
`scripts/dev-db.mjs`): no PostgreSQL installation, Docker, WSL, psql, or
Supabase CLI is needed, so it works on locked-down Windows machines. PGlite is
a local development database only — hosted staging/production stay on Supabase
managed PostgreSQL, and Linux CI validates against native PostgreSQL 16.

```bash
pnpm install                       # JS workspaces

# terminal 1 — local database (foreground server; stop with Ctrl+C)
pnpm db:init                       # create .dev/pglite + apply auth shim + 5 migrations
pnpm db:start                      # PostgreSQL wire protocol on 127.0.0.1:54329 (db: postgres)

# terminal 2 — seed + web app
pnpm seed                          # deterministic demo data (seed 20260716)
pnpm --filter @ok/web dev          # http://localhost:3000

# terminal 3 — analytics service
cd apps/analytics
uv sync
uv run uvicorn ok_analytics.main:app --port 8000
```

`pnpm db:status`, `pnpm db:migrate`, `pnpm db:reset` and `pnpm db:stop` manage
the same database; `pnpm db:stop` works from another terminal while the server
runs in the foreground. All data lives under the gitignored `.dev/` directory
and is disposable synthetic data — `db:reset` removes only `.dev/pglite`.
On Linux with PostgreSQL 16 installed you can use the native engine instead:
`pnpm db:native:init` (scripts/dev-db.sh, database `cx_platform`) with
`LOCAL_DATABASE_ENGINE=native` in your environment.

Sign in at `http://localhost:3000` — seeded users (password `demo1234!`):

| Email | Role |
|---|---|
| owner@example.invalid | owner |
| admin@example.invalid | administrator |
| researcher@example.invalid | researcher |
| panel@example.invalid | panel manager |
| analyst@example.invalid | analyst |
| viewer@example.invalid | viewer |

All demo data is fictional (`example.invalid`); no real personal data exists in
this repository. Production sign-in (Microsoft Entra ID via Supabase Auth) is a
documented boundary, not yet enabled — see `docs/adr/003-auth-boundary.md`.

## Tests

```bash
pnpm --filter @ok/domain test      # 31 domain unit tests
pnpm --filter @ok/web test         # 51 tests incl. RLS tenant-isolation (needs db + seed)
pnpm test:db-manager               # 26 tests for the PGlite dev-db manager
pnpm --filter @ok/web test:e2e     # 8 Playwright specs (needs db + seed + analytics)
cd apps/analytics && uv run pytest # 36 auth/numerical/export tests
pnpm --filter @ok/web build
pnpm typecheck && pnpm lint
```

Database-backed web tests run against whichever engine `DATABASE_URL` /
`LOCAL_DATABASE_ENGINE` select. CI runs them against **native PostgreSQL 16**,
which remains the authoritative validation of login roles and RLS; running them
locally against PGlite additionally asserts `current_user = 'cx_app'` inside
user transactions (see the PGlite note below).

## Repository layout

```
apps/web          Next.js app (UI, server actions, respondent runtime)
apps/analytics    FastAPI statistics service (uv, Dockerfile)
packages/domain   shared domain: instrument schema, logic engine, metrics,
                  permissions, sampling, follow-up rules
supabase/         SQL migrations (Supabase-CLI compatible) + local auth shim
scripts/          dev-db.mjs (PGlite local database manager),
                  dev-db.sh (native PostgreSQL manager for Linux CI),
                  run-ts.mjs (pure-JS TypeScript runner for the seed)
docs/             architecture, ADRs, capability matrix, plan, screenshots
```

## Database commands

```bash
# Local development (PGlite, database `postgres`, 127.0.0.1:54329)
pnpm db:init|db:start|db:stop|db:migrate|db:reset|db:status

# Native PostgreSQL 16 (Linux/CI, database `cx_platform`) — authoritative gate
pnpm db:native:init|db:native:start|db:native:stop|db:native:migrate|db:native:reset
scripts/dev-db.sh psql             # psql into cx_platform (native only)
```

Migrations are tracked in a `_migrations` ledger with SHA-256 checksums:
reruns apply nothing, and editing an already-applied migration fails loudly
(add a new migration file instead, or `pnpm db:reset` the disposable local
database). The local auth shim (`supabase/local/auth_shim.sql`) is applied
first and never to hosted Supabase; hosted migrations remain separate, manual,
and approval-gated (`docs/hosted-role-and-rls.md`).

### PGlite specifics (local development only)

- PGlite is PostgreSQL-in-WASM — great for local dev, **not** a production
  database. Hosted environments reject `LOCAL_DATABASE_ENGINE=pglite`.
- The socket server accepts multiple connections but serializes every query
  through one PGlite instance; a transaction on one connection briefly blocks
  the others. Fine for one developer, unsuitable for shared servers.
- Every socket connection executes as `postgres` no matter which username the
  URL carries, so the app's authenticated transactions run an explicit
  `SET LOCAL ROLE cx_app` in PGlite mode before setting JWT claims — the same
  RLS subject as native/hosted. Tests assert `current_user = 'cx_app'`.
- Native PostgreSQL in CI still proves real login-role behavior end to end.
