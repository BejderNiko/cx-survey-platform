# ADR-001: pnpm/Turborepo monorepo with Next.js web app and Python analytics service

**Status:** accepted · 2026-07-16

## Decision

Monorepo with `apps/web` (Next.js 16 App Router, strict TypeScript, Tailwind 4),
`apps/analytics` (Python 3.11, FastAPI, uv), `packages/domain` (shared TS
domain logic), and `supabase/` (SQL migrations). `packages/ui`/`packages/config`
were not created: no proven shared code exists yet, and the mandate is to add
them only when there is.

## Rationale

- Statistics belong in Python (pandas/SciPy/statsmodels/pyreadstat are the
  mature implementations; hand-rolling them in TS is explicitly out).
- The web app and seed share the instrument schema, logic engine, metric
  definitions, and permission matrix — hence a real domain package instead of
  copies.
- Turborepo gives task orchestration (`build`, `test`, `typecheck`) without
  extra infrastructure.

## Consequences

Two runtimes to install locally (documented in README; both checked by CI).
The analytics service is stateless and independently deployable (Dockerfile).
