# LUNA QA-handoff — import, study access og hosted readiness

Dato: 29. juli 2026
Branch: `pr4-hardening`
Scope: Lokal udvikling og test. Ingen hosted migration, deployment eller produktionsdata er ændret.

## 1. Kort ændringsoversigt

- Panelimport har nu varige statusser for `dry_run`, `committing`, `committed` og `failed`.
- Commit bruger org-låst, chunked bulk insert/update og dokumenterer database-resultatet før UI viser succes.
- Gentagen import opdaterer eksisterende panelister uden dubletter og uden at oprette nye consent-records for updates.
- Ekstern CSV/XLSX-rådata kan previewes, mappes og oprettes som dataset + dataset-version med variabelmetadata og lineage.
- Tidligere studies kan åbnes med fallback for manglende historisk workspace/ejer. Manglende eller forkert-tenant study returnerer kontrolleret 404/null.
- Study- og distributionsqueries bruger både RLS via `withAuthorized`/`withUser` og eksplicit `org_id`.
- Hosted runtime validerer database-roller, adskilte forbindelser, HTTPS og nødvendige env-vars uden at logge værdier.
- Offentlig readiness-route kontrollerer konfiguration, database og analytics.

## 2. Files changed

Ændrede filer:

- `README.md`
- `apps/web/app/(app)/analytics/datasets/[id]/page.tsx`
- `apps/web/app/(app)/analytics/page.tsx`
- `apps/web/app/(app)/panel/import/actions.ts`
- `apps/web/app/(app)/panel/import/import-wizard.tsx`
- `apps/web/app/(app)/studies/[id]/builder/page.tsx`
- `apps/web/app/(app)/studies/[id]/layout.tsx`
- `apps/web/app/(app)/studies/[id]/page.tsx`
- `apps/web/app/(app)/studies/[id]/results/page.tsx`
- `apps/web/app/(app)/studies/[id]/udsend/page.tsx`
- `apps/web/app/(app)/studies/actions.ts`
- `apps/web/app/(app)/studies/distribution-actions.ts`
- `apps/web/app/(app)/studies/page.tsx`
- `apps/web/lib/env.ts`
- `apps/web/lib/labels.ts`
- `apps/web/proxy.ts`
- `apps/web/test/env.test.ts`

Nye filer:

- `apps/web/app/(app)/analytics/import/actions.ts`
- `apps/web/app/(app)/analytics/import/page.tsx`
- `apps/web/app/(app)/analytics/import/raw-data-import.tsx`
- `apps/web/app/(app)/studies/error.tsx`
- `apps/web/app/api/health/readiness/route.ts`
- `apps/web/lib/data/studies.ts`
- `apps/web/lib/import/panel-commit.ts`
- `apps/web/lib/import/raw-dataset.ts`
- `apps/web/test/panel-import-commit.test.ts`
- `apps/web/test/raw-data-import.test.ts`
- `apps/web/test/studies-access.test.ts`
- `docs/hosted-readiness.md`
- `docs/luna-qa-handoff-2026-07-29.md`
- `supabase/migrations/20260729000012_import_commit_lifecycle.sql`

## 3. Testkommandoer og resultater

Bestået:

| Kontrol | Kommando | Resultat |
|---|---|---|
| Lokal databaseinitialisering | `node scripts/dev-db.mjs init` | 12/12 migrationer anvendt |
| Deterministisk seed | `node scripts/run-ts.mjs apps/web/scripts/seed.ts` | 250 panelister, 94 + 25 svar, 23 cases, dataset 94 × 12 |
| Web typecheck | `node ../../node_modules/typescript/bin/tsc --noEmit` fra `apps/web` | Bestået |
| Domain typecheck | `node node_modules/typescript/bin/tsc --noEmit` fra `packages/domain` | Bestået |
| Web lint | `node node_modules/eslint/bin/eslint.js .` fra `apps/web` | 0 fejl; 1 eksisterende TanStack Table-advarsel |
| Production build | `node node_modules/next/dist/bin/next build` fra `apps/web` | Bestået; `/analytics/import` og `/api/health/readiness` med i route-manifest |
| Database-manager | `node --test scripts/dev-db.test.mjs` | 26 bestået, 0 fejlet |
| Analytics uden SAV | `py -3.14 -m pytest -q -ra --tb=short -k "not sav"` | 35 bestået, 1 fravalgt |
| Runtime feature-verifikation | Projektets rene TypeScript-loader mod lokal PGlite | Panel, rådata, study access, env guards og tenant-isolation bestået |
| Readiness smoke | Frisk production build + lokal analytics | HTTP 200; database, analytics og configuration = `true` |
| Git whitespace-kontrol | `git diff --check` | Exit 0 |

Ikke fuldt kørt:

| Kravkommando | Præcis årsag | Forventet miljø |
|---|---|---|
| `pnpm --filter @ok/domain test` | Vitest kræver `esbuild.exe`; Windows-gruppepolitik returnerer fejl 1260 | CI/Windows uden AppLocker-blokering eller Linux |
| `pnpm --filter @ok/web test` | Samme Vitest/esbuild-blokering. Direkte forsøg gav `spawn EPERM`/`spawn UNKNOWN` | CI med tilladt esbuild |
| `pnpm --filter @ok/web test:e2e` | Playwright-driverens proces blev blokeret med `WinError 1260` | CI med installeret Chromium og tilladt Playwright-driver |
| `cd apps/analytics && uv run pytest` | `uv` var ikke tilgængelig; fallback var system-Python 3.14 | Projektets låste uv/Python 3.11–3.13-miljø |
| Fuld analytics-suite inkl. SAV | Python 3.14-processen lukkede brat i `test_sav_roundtrip`, sandsynlig native `pyreadstat`-kompatibilitet | Låst uv-miljø på understøttet Python-version |

## 4. Importbevis

Runtime-verifikation brugte en isoleret testorganisation og 3.478 unikke rækker. Testdata blev slettet efter kontrollen.

Første commit:

| Måling | Resultat |
|---|---:|
| Før-count | 0 |
| Total i fil | 3.478 |
| Valid | 3.478 |
| Create | 3.478 |
| Update | 0 |
| Invalid | 0 |
| Efter-count | 3.478 |
| `import_batches.status` | `committed` |
| Panelister koblet via `import_batch_id` | 3.478 |
| Consent-records | 6.956 = 3.478 × 2 |
| Custom attributes | 3.478 |

Beregning: `0 før + 3.478 creates = 3.478 efter`.

Gentagen import:

| Måling | Resultat |
|---|---:|
| Før-count | 3.478 |
| Create | 0 |
| Update | 3.478 |
| Efter-count | 3.478 |
| Opdaterede navne | 3.478 |
| Consent-records efter repeat | 6.956, uændret |

Tvungen fejl midt i importen efterlod 0 panelister med testens rollback-ID og satte batch til `failed` med `failed_at`.

## 5. Bevis for tidligere studieadgang

- Et eksisterende seeded study blev hentet i korrekt organisation.
- Et historisk study med FK-gyldigt workspace fra forkert tenant blev stadig listet og åbnet.
- Workspace blev vist som `Tidligere workspace`; `workspace_missing = true`.
- Ukendt study-ID returnerede `null` og routes bruger `notFound()`.
- Samme seeded study-ID var skjult for bruger i en anden organisation.

## 6. Bevis for rådataanalyse

- CSV med UTF-8 BOM og komma: 2 rækker parsed.
- CSV med semikolon: 2 rækker parsed.
- Numerisk `score` blev konverteret til tal; missing code `99` blev `null`.
- Dato blev infereret som dato; tekst blev bevaret som tekst.
- Variabellabel og måleniveau `ordinal` blev gemt i variabelmetadata.
- XLSX med to worksheets fandt begge ark og importerede kun valgt `Data`-ark.
- Dataset gemmes med `source_kind = file_import`.
- Dataset-version gemmer SHA-256, filnavn, format, worksheet, separator og importtidspunkt i lineage.
- De 35 beståede analytics-tests uden SAV dækker eksisterende statistik- og eksportflow; SAV kræver gentest i understøttet Python-miljø.

## 7. Bevis for RLS og tenant-isolation

- Panel plan, dedup, writes, attributter og batch-verifikation filtrerer eksplicit på `org_id`.
- Runtime-test med samme `external_id` i en anden organisation gav `create = 1`, `update = 0`.
- Forkert-tenant importbatch var ikke synlig.
- Study listing/detail returnerede ikke study fra anden organisation.
- Study/distribution mutationer filtrerer nu eksplicit på `org_id` ud over `withAuthorized`.
- Database-testens RLS-helper kræver faktisk `current_user = cx_app`; superuser-resultater tæller ikke som gyldigt RLS-bevis.

## 8. Kendte risici

1. Permanente Vitest- og Playwright-suiter er skrevet/tilgængelige, men kunne ikke startes på denne Windows-maskine på grund af gruppepolitik. De skal være obligatoriske CI-gates.
2. SAV roundtrip er ikke valideret på Python 3.14. Kør den låste `uv run pytest` på projektets understøttede Python-version.
3. Ingen hosted Supabase-migration eller Vercel/FastAPI-deployment er udført. Hosted readiness er kode- og lokal-smoke-verificeret, ikke produktionsverificeret.
4. Migration 12 er additiv, men skal gennem normal backup-, preview- og rollback-procedure før hosted anvendelse.
5. Lint har én eksisterende React Compiler-advarsel for TanStack `useReactTable`; 0 lintfejl.

## 9. Manuel QA-checkliste

- [ ] Kør hele web/domain Vitest-suiten i CI.
- [ ] Kør Playwright E2E i CI med Chromium.
- [ ] Importér en rigtig 3.478-rækkers CSV via UI og bekræft paneltotal, batchhistorik og refresh af `/panel`.
- [ ] Genimportér samme fil med ændrede navne og bekræft 0 creates / 3.478 updates.
- [ ] Test duplicate rows, ugyldig e-mail, manglende dedup-key og ændret fil efter preview i UI.
- [ ] Importér komma-CSV, semikolon-CSV og multi-sheet XLSX via `/analytics/import`.
- [ ] Åbn det nye dataset i workbench og kør frequencies, descriptives, crosstab/chi-square, correlation, t-test, ANOVA og regression.
- [ ] Eksportér CSV, XLSX, JSON og SAV i låst analytics-miljø.
- [ ] Åbn et ældre study, builder, resultater og udsendelser.
- [ ] Bekræft kontrolleret 404 og brugbar databasefejltekst.
- [ ] Kør migration 12 i Supabase preview/staging efter særskilt godkendelse og backup.
- [ ] Konfigurer hosted env-vars efter `docs/hosted-readiness.md`; kald readiness uden session.
- [ ] Verificer monitoring, backup restore og rollback i staging.

## 10. Forslag til PR-opdeling

1. **PR 1 — panel-import reliability**
   Panel lifecycle-migration, chunked commit, UI-resultat, tests samt study-access/RLS-hardening, hvis leverancen skal holdes til tre PR'er.
2. **PR 2 — external CSV/XLSX dataset import**
   Upload/preview/mapping, variabelmetadata, lineage, dataset-version og rådata-tests.
3. **PR 3 — hosted database and analytics readiness**
   Env-validering, health/readiness, rolle-/HTTPS-separation og driftsdokumentation.

Hvis fire PR'er accepteres, bør study access og tenant-hardening flyttes fra PR 1 til en selvstændig PR for mindre review-scope.
## 11. Rettelser efter LUNAs første review

LUNAs fem fund er rettet før anden reviewrunde:

1. Analytics overview, workbench, payload, actions og eksport filtrerer nu eksplicit på valgt `org_id`, også når RLS ikke er eneste værn.
2. XLSX-formler bruger kun et gemt skalært resultat. Formel uden cached resultat, Excel-fejl og ukendt celleobjekt afvises. Dublette XLSX-headere afvises; tomme headere får stabile `column_N`-navne.
3. CSV `TooManyFields`, `TooFewFields`, quote-fejl og automatisk omdøbning af dublette headere afvises; enkeltkolonne-CSV accepteres fortsat.
4. Panelimport har en 15-minutters commit-lease. En afbrudt `committing`-batch markeres `failed` ved næste import-/historikadgang, mens aktive commits beskyttes af databasens rækkelås.
5. `SESSION_SECRET` og `ANALYTICS_API_SECRET` skal i produktion være mindst 32 bytes, have mindst 8 forskellige tegn, ikke ligne kendte placeholders og ikke have indledende eller afsluttende whitespace. Fejltekster viser kun variabelnavnet.

Ny lokal verifikation efter rettelser:

- Direkte runtime-harness: 25/25 assertions bestået = 8 parser/dato/formel + 2 secret + 15 database/tenant/livscyklus. Supplerende secret-harness bestod 4 forventede afvisninger og 1 stærk værdi. Header-harness bestod afvisning af dublet-CSV, afvisning af dublet-XLSX og tabsfri fallback for tom XLSX-header. Supplerende trailing-header-harness bevarede 2/2 værdier, og LUNAs afsluttende read-only review gav GO uden nye P0/P1/P2-fund.
- TypeScript: bestået.
- ESLint: 0 fejl, 1 eksisterende TanStack-advarsel.
- Next.js production build: bestået.
- Database-manager: 26/26 tests bestået ved direkte kørsel af `scripts/dev-db.test.mjs`.
- `git diff --check`: bestået.
- Vitest kan fortsat ikke starte på maskinen; både sandboxet og godkendt usandboxet forsøg stoppede i Vite/esbuild med `spawn EPERM`/`spawn UNKNOWN`.