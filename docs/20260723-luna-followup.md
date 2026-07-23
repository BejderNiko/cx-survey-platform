# Luna follow-up — 2026-07-23

## Changes

- Invitation stimulus access now rejects bounced, unsubscribed, and failed invitation statuses.
- Study stimulus cleanup retries storage deletion three times and emits only a safe reference plus failure count when cleanup remains incomplete.
- New additive tenant-integrity migration adds same-organization foreign keys for media and threaded comments.
- Tenant audit and rollback procedure documented in 20260723-tenant-integrity-audit.md.
- Preference tests cover valid 2- and 8-image boundaries and invalid 1- and 9-image inputs.

## Verification

- Domain TypeScript: pass.
- Web TypeScript: pass.
- ESLint: pass; one existing TanStack warning.
- Next production build: pass.
- Vitest: blocked before collection by Group Policy, error spawn UNKNOWN.
- PGlite migration run: blocked because PGlite failed to initialize; existing local data was not reset or deleted.
- Hosted Supabase migration: not run.

## Required before hosted rollout

1. Run read-only tenant audit and confirm all three cross-organization counts are zero.
2. Back up and validate recruitment, media, and comment constraints.
3. Apply Insights cleanup only through separately approved destructive migration.
4. Run revoked-invitation, study-delete, comments, preference, and responsive stimulus E2E in staging.
