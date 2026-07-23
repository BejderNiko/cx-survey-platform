# Route error audit — 2026-07-23

## Reproduction

Initial web TypeScript check produced 25 blocking errors:

- 15 authenticated route calls used the old `withUser(userId, fn)` contract.
- 10 recruitment references used missing capability `recruitment.manage`.
- Calculation: 15 + 10 = 25 blocking compile errors.

`withUser` now requires `withUser(userId, orgId, fn)`. Without selected `orgId`, the transaction cannot set the tenant claim used by RLS. The stale calls therefore blocked the build before database queries could complete. Recruitment code likewise could not compile until the central permission action existed.

## Affected route families

| Route | Finding | Change |
|---|---|---|
| `/studies` | stale tenant transaction call | pass session org ID |
| `/studies/[id]` | stale tenant transaction call | pass session org ID |
| `/studies/[id]/builder` | stale tenant transaction call | pass session org ID |
| `/studies/[id]/results` | stale tenant transaction call | pass session org ID |
| `/studies/[id]/udsend` | stale tenant transaction call | pass session org ID |
| `/panel` | stale tenant transaction call | pass session org ID |
| `/panel/import` | stale tenant transaction call | pass session org ID |
| `/panel/[id]` and `/panel/segments` | stale tenant transaction call | pass session org ID |
| panel recruitment | capability missing from central policy | add `recruitment.manage` and role mapping |
| admin, home, analytics | stale tenant transaction call | pass session org ID |

`createPanelInvite` remains behind the distribution permission and audience governance path. `Promise.all` was not the primary compile failure; each query now executes inside the same org-scoped transaction. Missing records still use route-level `notFound()` handling.

## Safe error observability

App error boundary now shows Danish permission/error text plus either Next.js digest or client-generated error reference. It does not print stack traces, secrets, SQL, tokens, or respondent data.

## Verification status

- Domain TypeScript: pass.
- Web TypeScript: pass.
- ESLint: 0 errors; 1 pre-existing TanStack compiler warning.
- Next.js production build: pass after removal of a locked generated `.next` cache; generated route list excludes `/insights` and includes `/api/stimuli/[id]`.
- Five direct domain smoke assertions: pass (17 types, complete metadata, immutable Danish normalization, valid preference acceptance, forged preference rejection).
- Local PGlite migration chain: pass; 10 migrations applied, latest `20260723000010_media_and_threaded_comments.sql`.
- Recruitment migration dependency: `20260722000007_recruitment_pages.sql` now creates the tenant-scoped base tables required by migrations 00008 and 00009.
- Local seed: pass; 250 panelists, 94 completed NPS responses, 23 follow-up records, 25 first-click responses, and one 94-row x 12-column dataset.
- Targeted Playwright: admin/respondent 2/2 pass; analytics 2/2 pass.
- Full Node Playwright suite: 8/8 pass in 31.3 seconds against local Next.js, FastAPI analytics, and PGlite.
- Respondent diagnosis: `127.0.0.1` triggered Next.js dev-origin blocking; unchanged respondent flow passed through `localhost`.
- Native Python Playwright: browser-driver process blocked by Group Policy, so the repository's Node Playwright suite was used.
- Vitest domain/web: attempted outside sandbox; both stop before test collection because Group Policy blocks esbuild child-process startup (`spawn UNKNOWN`).
- Deployed/local comparison was not run because repository rules prohibit GitHub integrations/APIs and no deployed target was supplied.
