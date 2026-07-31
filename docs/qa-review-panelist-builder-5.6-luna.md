# QA review plan — Panelist-modul og Byg-editor

**Reviewer:** 5.6 Luna
**Reviewtype:** Uafhængig kode-, sikkerheds-, funktions- og regressionsreview
**Reviewgrundlag:** Aktuel working-tree-diff mod `HEAD` på `feature/participant-device-qa`
**Produktionsgrænse:** Ingen migrationskørsel, ingen produktionsdata, ingen deploy, ingen commit eller push.

## 1. Formål og stopkriterium

Luna skal forsøge at modbevise, at ændringen er klar. Review er kun godkendt, når alle P0/P1-fund er lukket, automatiske gates er grønne, Panel-filtersemantik er bevist mod PostgreSQL, og Byg-editorens toolbar/logic/synlighed er manuelt verificeret i browsermatrix.

Stop review og markér **BLOCKED**, hvis lokal/staging-database ikke har alle 12 kendte migrationer, `/api/health/readiness` ikke returnerer `status: "ready"`, eller testmiljø peger mod produktion.

## 2. Scope

### Kode under review

- `apps/web/lib/data/panel.ts`
- `apps/web/app/(app)/panel/page.tsx`
- `apps/web/app/(app)/panel/panel-filter-panel.tsx`
- `apps/web/test/panel-filters.test.ts`
- `packages/domain/src/instrument.ts`
- `packages/domain/src/logic.ts`
- `packages/domain/test/logic.test.ts`
- `apps/web/app/(app)/studies/[id]/builder/modern-builder.tsx`
- `apps/web/app/(app)/studies/[id]/builder/page.tsx`

### Bevidste produktvalg, som Luna skal validere

1. Platformens eksisterende Supabase/PostgreSQL- og JSONB-instrumentarkitektur bruges. Ingen Prisma/Azure-ombygning.
2. Øje-ikon styrer **spørgsmålsniveau**, fordi ikonet findes i spørgsmålstoolbar. `hidden: true` udelader spørgsmålet fra preview og live respondentflow.
3. Alder er omtrentligt beregnet fra `birth_year`: `currentYear - maxAge` til `currentYear - minAge`. Ingen præcis fødselsdato findes.
4. Filtergrupper kombineres med SQL-AND. `any`/`all`/`none` gælder inden for gruppe.
5. Panel viser 50 rækker pr. side. Filtreret total omfatter hele matchpopulationen.

## 3. Gate A — Diff- og arkitekturreview

- [ ] Kør `git status --short --branch`, `git diff --check`, `git diff --stat` og fuld `git diff`.
- [ ] Bekræft ingen `.env`, secrets, migrations, lockfile-ændringer eller produktionskonfiguration.
- [ ] Bekræft alle SQL-fragmenter bruger parameterbinding; ingen brugerinput interpoleres som rå SQL.
- [ ] Bekræft `panelistWhere` indkapsler hver betingelse som `and (<gruppe>)`. Regressionsfejl uden parenteser gav tidligere SQL som `true and false or A and false or B`.
- [ ] Bekræft eksisterende `withUser`, RLS og org-scope bevares.
- [ ] Bekræft `hidden` lagres i eksisterende JSONB-draft/version. Ingen migration nødvendig.
- [ ] Gennemgå, om hidden-spørgsmål med indgående/udgående logic-regler kan skabe uventet flow. Opret fund, hvis publiceringsvalidering bør afvise umulige referencer.
- [ ] Bekræft legacy builder ikke taber `hidden`, `visibleIf` eller `branches` ved load/save eller typeskift.

## 4. Gate B — Automatiske checks

Kør fra repo-rod i rent, ikke-produktionsmiljø:

```powershell
pnpm typecheck
pnpm lint
pnpm --filter @ok/domain test -- test/logic.test.ts
pnpm --filter @ok/web exec vitest run test/panel-filters.test.ts --pool=threads --maxWorkers=1 --minWorkers=1
pnpm --filter @ok/web build
```

Forventet:

- [ ] Typecheck: 0 fejl.
- [ ] Lint: 0 fejl. Kendt TanStack `useReactTable` React Compiler-advarsel må dokumenteres, men ikke tælles som ny fejl.
- [ ] Logic-tests: hidden første/mellemste spørgsmål springes over.
- [ ] Panel-filtertests: parser, AND på tværs, Any/All/None, alder og pagination består under RLS-rollen `cx_app`.
- [ ] Production build: alle routes kompilerer.

Hvis Windows blokerer `esbuild.exe`, kør tests i CI/Linux eller godkendt udviklingsmiljø. Markér ikke tests som bestået alene på typecheck.

## 5. Gate C — Panel funktionstest

Brug syntetiske panelister. Mindste fixture:

| Panelist | Uddannelse | Tags | Alder via birth_year |
|---|---|---|---:|
| Alpha | University | vip, new | 30 |
| Beta | Trade | vip | 50 |
| Gamma | University | ingen | 25 |

### Filtersemantik

- [ ] `Uddannelse=University ANY` → Alpha + Gamma.
- [ ] `Tags=vip ANY` → Alpha + Beta.
- [ ] `Uddannelse=University AND Tags=vip` → kun Alpha.
- [ ] `Tags=vip,new ALL` → kun Alpha.
- [ ] `Tags=vip NONE` → kun Gamma.
- [ ] To forskellige filterkategorier må aldrig bindes sammen med løs SQL-OR.
- [ ] Tom gruppe ændrer ikke aktivt resultat. Apply-knap er deaktiveret, indtil gruppe er gyldig.
- [ ] X på én gruppe fjerner kun denne gruppe. Andre grupper og søgning bevares.
- [ ] Ukendt field/operator, custom uden key, alder under 0/over 120, min > max og URL over 20.000 tegn afvises sikkert.

### UI, reaktivitet og pagination

- [ ] Filterfeltsøgning matcher dansk label uden hensyn til store/små bogstaver.
- [ ] ACTIVE vises på hvert felt med mindst én aktiv gruppe.
- [ ] Tabel, filtered og available opdateres efter cirka 300 ms uden fuld brugerhandling.
- [ ] Filterændring nulstiller `page`.
- [ ] Pagination viser 50 rækker, bevarer alle query-parametre og viser korrekt side/total.
- [ ] Sortering og checkbox-selection virker på viste side. Luna skal dokumentere, at sortering er side-lokal, hvis produktet forventer global serversortering.
- [ ] Aldersfilter forklarer birth-year-usikkerhed. Test årsskifte og `birth_year = null`.
- [ ] Default-filtermuligheder uden lagrede attributter giver legitimt 0 match; UI må ikke antyde datatilstedeværelse.

## 6. Gate D — Panel performance

Opret mindst 3.500 syntetiske panelister med realistiske tags og attributter. Mål kun server/database-filtertid efter én warm-up; browser-rendering rapporteres separat.

- [ ] Kør 20 gentagelser af: ét attributfilter, `ALL` på to tags, `NONE`, alder og kombineret attribut+tag.
- [ ] Rapportér min, median, p95 og max i millisekunder samt database/CPU.
- [ ] Gate: p95 under 300 ms for hver server-side filtercase på aftalt staging-lignende miljø.
- [ ] Kør `EXPLAIN (ANALYZE, BUFFERS)` på langsomste case. Kontrollér org-/field-/tag-indekser anvendes eller begrund sekventielt scan ved 3.500 rækker.
- [ ] Bekræft available-beregning og full-population audience-sikkerhedsloft ikke giver tavs truncering.

Beregning: sortér 20 tider. Median = gennemsnit af observation 10 og 11. p95 = observation 19 efter stigende sortering.

## 7. Gate E — Byg-editor funktionstest

Kør på alle 17 `QUESTION_TYPES` i kildekoden.

### Toolbar og Required

- [ ] Type, Required-label/toggle, Logic, øje og menu deler ens højde, centerlinje og gap.
- [ ] Test 320, 375, 768, 1024 og 1440 px bredde.
- [ ] Toolbar må wrappe læsbart uden overlap eller skjulte controls.
- [ ] Required toggler, gemmes, overlever reload og håndhæves i respondentflow.

### Logic

- [ ] Logic-knap åbner/lukker regelpanel og har korrekt `aria-expanded`.
- [ ] Opret display condition mod tidligere spørgsmål. Gem, reload, preview; spørgsmålet vises/skjules korrekt.
- [ ] Opret routing rule til senere spørgsmål, Thank you og Disqualify. Gem, reload, preview; target nås korrekt.
- [ ] Logic badge viser off eller on + korrekt antal display/routing-regler.
- [ ] Slet én regel. Andre regler bevares.
- [ ] Typeskift bevarer `visibleIf`, `branches`, required og hidden.
- [ ] Backward/unknown branch afvises af eksisterende validering.

### Synlighed

- [ ] Klik åbent øje → lukket øje, dashed/muted kort og sidebar-count.
- [ ] Hidden-state gemmes og overlever reload.
- [ ] Hidden første, midterste og sidste spørgsmål springes over i både preview og live respondentflow.
- [ ] Hidden spørgsmål indgår ikke ved Required-validering i respondentflow.
- [ ] Genvisning genskaber normal placering og logic-flow.
- [ ] Publiceret versionssnapshot ændres ikke, når senere draft toggle ændres.

### Header og regression

- [ ] Ingen dobbelt tekst/overlap med 0, 1 og flere validation warnings.
- [ ] Ingen overlap ved “Unsaved changes”, “Saving…”, “Saved” og save-fejl.
- [ ] Sticky header dækker ikke første notice/card ved scroll.
- [ ] Welcome screen, Thank you screen, Disqualify og closed/quota messages fungerer uændret.
- [ ] Legacy editor kan åbnes uden usynligt datatab.

## 8. Gate F — Browser og accessibility

| Miljø | Panel | Byg | Preview/live |
|---|---:|---:|---:|
| Chrome seneste | Krævet | Krævet | Krævet |
| Edge seneste | Krævet | Krævet | Krævet |
| Safari seneste eller Playwright WebKit | Krævet | Krævet | Krævet |

- [ ] Keyboard: tab-rækkefølge, Space/Enter på switches/buttons, details-menu og fokusmarkering.
- [ ] Screen reader-navne for Required, Logic, hide/show og remove filter.
- [ ] `aria-pressed` og `aria-expanded` følger visuel state.
- [ ] 200 % zoom uden tabt funktionalitet.
- [ ] Ingen nye console errors, hydration warnings eller failed network requests.

## 9. Fundformat og severity

Hvert fund skal indeholde:

1. Severity: P0 data/security, P1 forkert kernefunktion, P2 væsentlig UX/regression, P3 kosmetik.
2. Fil + præcis linje.
3. Reproduktion: fixture, URL, klik og forventet/faktisk resultat.
4. Evidens: SQL/log/screenshot/video.
5. Root cause eller tydeligt markeret hypotese.
6. Mindste sikre fix og krævede regressionstests.

## 10. Slutrapport

Luna afleverer:

- Gate-resultat: PASS / FAIL / BLOCKED for A–F.
- Kommandoer med exit code og testantal.
- Performance-tabel med rå 20 målinger og beregnede median/p95.
- Browsermatrix med versioner.
- P0–P3-fund sorteret efter severity.
- Acceptance-mapping mod udviklingsplanen.
- Rest-risici: præcis alder, 3.500-rækkers performance, hidden/logic-referencer, side-lokal sortering.
- Entydig anbefaling: **approve**, **approve with P2/P3 follow-up**, eller **request changes**.