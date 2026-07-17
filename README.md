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
- **Insights** — findings with decisions and evidence links; comments; audit
  log; role-based administration.

See `docs/cx-platform-build-and-qa-plan.md` (unified roadmap + gates),
`docs/github-vercel-implementation-runbook.md` (manual release steps),
`docs/architecture.md`, `docs/implementation-plan.md` (status + honest gap list),
`docs/source-capability-matrix.md` (product research evidence), and `docs/adr/`
(key decisions). Screenshots: `docs/screenshots/`.

## Quickstart (clean checkout)

Prerequisites: Node 22 + pnpm 10, Python 3.12 + [uv](https://docs.astral.sh/uv/),
PostgreSQL 16 server binaries (`postgresql-16` package; no Docker needed).

```bash
pnpm install                       # JS workspaces
scripts/dev-db.sh init             # local Postgres cluster + migrations (port 54329)
pnpm seed                          # deterministic demo data (seed 20260716)

# terminal 1 — analytics service
cd apps/analytics && uv sync && uv run uvicorn ok_analytics.main:app --port 8000

# terminal 2 — web app
cd apps/web && pnpm dev            # http://localhost:3000
```

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
pnpm --filter @ok/web test         # 14 tests incl. RLS tenant-isolation (needs db + seed)
pnpm --filter @ok/web test:e2e     # 8 Playwright specs (needs db + seed + analytics)
cd apps/analytics && uv run pytest # 36 auth/numerical/export tests
pnpm --filter @ok/web build
pnpm typecheck && pnpm lint         # 89 automated cases total
```

## Repository layout

```
apps/web          Next.js app (UI, server actions, respondent runtime)
apps/analytics    FastAPI statistics service (uv, Dockerfile)
packages/domain   shared domain: instrument schema, logic engine, metrics,
                  permissions, sampling, follow-up rules
supabase/         SQL migrations (Supabase-CLI compatible) + local auth shim
scripts/          dev-db.sh (local Postgres manager)
docs/             architecture, ADRs, capability matrix, plan, screenshots
```

## Database commands

```bash
scripts/dev-db.sh init|start|stop|migrate|reset
scripts/dev-db.sh psql             # psql into cx_platform
```
