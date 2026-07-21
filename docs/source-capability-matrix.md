# Source capability matrix

Product-research evidence for the OK CX Survey Platform, derived from four crawl files
(`preely-crawl.json`, `lyssna-crawl.json`, `nps-crawl.json`, `ibm-spss-crawl.json`).
Crawls were parsed structurally (330 records total: Preely 100, Lyssna 100, nps.today 100, IBM SPSS 30).
Source files were never modified; text below is normalized (BOM/mojibake fixed) only in these derived notes.

**Legend** — Evidence: `E` = explicit source evidence (feature described on the cited page),
`I` = inference (marketing claim or partial description; behavior chosen by us and labeled assumption).
Decision: `MVP` = in first vertical slice, `Later` = planned milestone, `Excluded` = out of scope.

Competitor material is used as research evidence only. No proprietary code, wording, layouts,
brands, or assets are copied. All module names, IA, and UI are original OK designs.

## 1. Panel management (Preely-inspired)

| # | Capability & user outcome | Source | Source page (title — URL) | Ev. | Decision | OK module |
|---|---------------------------|--------|---------------------------|-----|----------|-----------|
| P1 | Panelist profile with recruitment answers, tags, notes, message history, test/participation history, engagement status — full context on one screen | Preely | "August 2022: Panelist profile" — https://preely.com/academy/panelist-profile-upgrade/ | E | MVP | Panel |
| P2 | Contact governance: account-level caps on contact frequency and max invitation size, so panelists are not over-contacted | Preely | "User panel governance - Use recruitment questions" — https://preely.com/academy/april-2021-part-2-user-panel-governance-even-more-use-of-recruitment-questions/ | E | MVP | Panel + Distributions |
| P3 | Recruitment/segmentation questions usable as list filters and for enrichment over time | Preely | same as P2; "March 2022: Big User Panel release" — https://preely.com/academy/march-2022-release-note-extra-segmentation-questions/ | E | MVP (custom attributes + filters); enrichment campaigns Later | Panel |
| P4 | Screening question with qualify/disqualify gateway before recruitment | Preely | "September 2022: Screening question" — https://preely.com/academy/september-2022-screening-question/ | E | MVP (screening question type + disqualify logic in studies) | Studies |
| P5 | Handpicked, random, or mixed panelist selection for send-outs | Preely | "March 2022: Big User Panel release" (same as P3) | E | MVP (with recorded random seed — our addition for reproducibility) | Panel + Distributions |
| P6 | Panel health dashboard: open/click/bounce/spam/block rates, gender/age coverage | Preely | "Dashboard - Health check on your user panel" — https://preely.com/academy/dashboard/; "November 2022: Test panel dashboard" — https://preely.com/academy/november-2022-test-panel-dashboard/ | E | MVP (basic tiles from simulated delivery events); full coverage charts Later | Panel |
| P7 | Bias control: filter on whether a panelist opened a specific message | Preely | "November 2022: Test panel dashboard" (same as P6) | E | Later | Panel |
| P8 | Share test to selected/segmented panelists via unique per-panelist link + invitation email | Preely | "Share your test via the test panel" — https://preely.com/academy/share-test-via-user-panel-2/ | E | MVP (tokenized invitations, simulated outbox) | Distributions |
| P9 | Workspace membership management (adding users to workspaces) | Preely | "Adding users to workspaces" — https://preely.com/academy/adding-users-to-workspaces/ | E | MVP | Administration |
| P10 | Interview scheduling/messages boundary (Calendly-style booking links in panel messages) | Preely | "Schedule meetings and interviews with Messages" — https://preely.com/academy/calendly-and-messages/ | E | Later (record-keeping only; no external calendar integration) | Studies |
| P11 | Pilot testing a study with a small group before launch | Preely | "How to do a pilot test on Preely" — https://preely.com/academy/pilot-test/ | E | Later (preview covers MVP need) | Studies |
| P12 | Hired/external participant recruitment marketplace | Preely | "In lack of test participants" — https://preely.com/academy/hire-participants/ | E | Excluded (out of scope: no public participant marketplace) | — |
| P13 | Parental control / guardian consent for minors | Preely | "Enrich panelists via questions" — https://preely.com/academy/parental-control/ | E | Excluded (OK panel is adult customers; data minimization) | — |

## 2. Research methods (Lyssna-inspired)

| # | Capability & user outcome | Source | Source page (title — URL) | Ev. | Decision | OK module |
|---|---------------------------|--------|---------------------------|-----|----------|-----------|
| L1 | Surveys with mixed question types (multiple choice, Likert, open text) analyzed together | Lyssna | "How To Reduce Customer Churn: Template" — https://www.lyssna.com/templates/how-to-reduce-customer-churn/ | E | MVP | Studies |
| L2 | First-click testing: task + image, click coordinates captured, click map on results | Lyssna | "How to run a first click test for product onboarding" — https://www.lyssna.com/templates/how-to-run-a-first-click-test-for-product-onboarding/ | E | MVP (one interaction method end-to-end) | Studies |
| L3 | Screener questions with qualify/disqualify to reach the right participants | Lyssna | "How to screen participants with purchasing authority" — https://www.lyssna.com/templates/how-to-screen-participants-with-purchasing-authority/ | E | MVP (screening question + disqualify termination) | Studies |
| L4 | Open/closed/hybrid card sorting for IA validation | Lyssna | "How to refine your IA with hybrid card sorting" — https://www.lyssna.com/templates/how-to-refine-your-ia-with-hybrid-card-sorting/ | E | Later (scaffold only where shared engine supports; no decorative UI) | Studies |
| L5 | Tree testing measuring findability/directness of navigation structure | Lyssna | "How to Improve Information Architecture with Tree Testing" — https://www.lyssna.com/templates/how-to-improve-information-architecture-with-tree-testing/ | E | Later | Studies |
| L6 | Preference testing between competing design/feature options with rationale capture | Lyssna | "How to Evaluate Feature Preferences" — https://www.lyssna.com/templates/how-to-evaluate-feature-preferences/ | E | Later (choice question with media covers a subset in MVP) | Studies |
| L7 | Think-aloud/moderated & unmoderated session records | Lyssna | "Think-Aloud Protocol Guide" — https://www.lyssna.com/guides/think-aloud-protocol/ | E | Later (interview scheduling records; no recording pipeline) | Studies |
| L8 | Live-website testing tasks | Lyssna | "Live website testing templates" — https://www.lyssna.com/templates/live-website-testing-templates/ | E | Later | Studies |
| L9 | Reusable study templates library (churn, navigation, brand, SUS, personas…) | Lyssna | "Templates for usability testing & UX research" — https://www.lyssna.com/templates/ | E | MVP (template gallery with CX + research templates) | Studies |
| L10 | Standardized score calculation from scale batteries (e.g. SUS) with documented formula | Lyssna | "How To Calculate a SUS Score: Template" — https://www.lyssna.com/templates/how-to-calculate-sus-score/ | E | Later (our MVP ships versioned NPS/CSAT/CES metric definitions instead) | Analytics |
| L11 | Integrations (Slack, Figma, etc.) | Lyssna | "Lyssna Integrations" — https://www.lyssna.com/integrations/ | I | Later (connector architecture boundary only) | Distributions |
| L12 | Prototype testing via URL/Figma-compatible link | Preely/Lyssna | "Creating an URL Prototype" — https://preely.com/academy/url-prototype/ | E | Later (URL boundary field scaffolded, labeled not implemented) | Studies |
| L13 | Panel/participant demographics summary on results (completion, gave-up vs drop-off split, device split) | Preely | "Summary of participants demographic data" — https://preely.com/academy/summary/; "Sessions" — https://preely.com/academy/sessions/ | E | MVP (completion/drop-off metrics); per-session path replay Later | Responses/Analytics |

## 3. Operational CX (nps.today-inspired)

| # | Capability & user outcome | Source | Source page (title — URL) | Ev. | Decision | OK module |
|---|---------------------------|--------|---------------------------|-----|----------|-----------|
| N1 | NPS 0–10 with promoter/passive/detractor categories (9–10/7–8/0–6) and red-yellow-green reporting | nps.today | "What Is NPS?" — https://nps.today/what-is-nps/ | E | MVP (score = %promoters − %detractors, transparent numerator/denominator, versioned definition) | Studies + Analytics |
| N2 | Rating + reason pattern: free-text reason and/or predefined main-reason category after score | nps.today | "What Is NPS?" (same as N1) | E | MVP (smart follow-up questions conditioned on score) | Studies |
| N3 | Single unified scale + smart question flow across the journey; short surveys with relevant follow-ups | nps.today | "Benefits of Single Scale CX" — https://nps.today/benefits-of-single-scale-cx/ | E | MVP (branching on score; shared scale components) | Studies |
| N4 | Close the loop: alerts, automatic involvement of right people, follow-up tasks, notes, status tracking, documentation of actions | nps.today | "Close the loop" — https://nps.today/close-the-loop/ | E | MVP (rule engine → alert/assign/task; case states; notes; activity history) | Follow-up |
| N5 | Automated survey triggers from CRM/service/order systems (event-triggered surveys) | nps.today | "Salesforce plugin" — https://nps.today/salesforce-plugin/; "NPS for Dynamics" — https://nps.today/integrations/dynamics/ | E | MVP: inbound webhook trigger boundary with idempotency; live CRM connectors Later (mocks clearly labeled) | Distributions |
| N6 | Multi-channel distribution: email, SMS/RCS, QR codes, embedded widgets, direct links | nps.today | "Benefits of Single Scale CX" (channel list); "When to Use SMS or RCS" — https://nps.today/when-to-use-sms-or-rcs/ | E | MVP: email (simulated outbox) + public/tokenized links + QR; SMS/RCS/widgets Later | Distributions |
| N7 | Reminders, anti-spam, send-out throttling managed centrally | nps.today | "Functions" — https://nps.today/functions/ | E | MVP (frequency caps + exclusion at audience selection; reminders Later) | Distributions |
| N8 | Survey-fatigue protection: frequency limits per customer (e.g., relational yearly, transactional every 14 days), audience segmentation | nps.today | "Survey fatigue and how to avoid it" — https://nps.today/survey-fatigue-and-how-to-avoid-it/ | E | MVP (per-org contact cooldown + cap enforced at distribution build) | Panel + Distributions |
| N9 | Relational vs transactional survey types with different cadence | nps.today | "The best way to measure NPS" — https://nps.today/the-best-way-to-measure-nps/ | E | MVP (templates for relational + transactional NPS) | Studies |
| N10 | Live dashboards and wallboards for teams | nps.today | "Close the loop" (share responses on live wallboards) | E | Later (privacy-safe wallboard mode); MVP has live results per study | Responses |
| N11 | Response notifications in Outlook/Teams | nps.today | "NPS for Dynamics" (platform features) | E | Later (notification connector boundary; in-app alerts in MVP) | Follow-up |
| N12 | React–retain–transform action levels; CSAT and CES programs alongside NPS | nps.today | "From Measurement to Action" — https://nps.today/from-measurement-to-action/; "Operational customer experience" — https://nps.today/operational-customer-experience/ | E | MVP (CSAT/CES question types + metrics; priority on follow-up cases) | Follow-up + Analytics |
| N13 | AI agent / AI feedback analysis | nps.today | "Functions" (CX AI Agent) | I | Later (only behind explicit configuration, human-reviewed) | Analytics |
| N14 | Perception Gap (P-GAP) agent-vs-customer scoring | nps.today | "P-GAP – mind the gap" — https://nps.today/p-gap-mind-the-gap/ | I | Excluded (employee-coaching product, not in OK scope) | — |
| N15 | Public NPS benchmark tool | nps.today | "What Is NPS?" (benchmark link) | I | Excluded | — |

## 4. Statistics & data preparation (IBM SPSS-inspired)

| # | Capability & user outcome | Source | Source page (title — URL) | Ev. | Decision | OK module |
|---|---------------------------|--------|---------------------------|-----|----------|-----------|
| S1 | Variable metadata model: labels, value labels, missing-value rules, measurement levels; data view + variable view | IBM SPSS | "Data Preparation Software" — https://www.ibm.com/products/spss-statistics/data-preparation | E | MVP (dataset variable registry with labels/levels/missing rules) | Analytics |
| S2 | Data validation: identify suspicious/invalid cases, missing-data patterns, distribution summaries | IBM SPSS | same as S1 | E | MVP (missingness summary per variable); anomaly rules Later | Analytics |
| S3 | Descriptives, means, crosstabs, correlations as core procedures | IBM SPSS | "Bootstrapping" — https://www.ibm.com/products/spss-statistics/bootstrapping (procedure list) | E | MVP (frequencies, descriptives, crosstab w/ chi-square, Pearson/Spearman) | Analytics |
| S4 | Regression: linear and binary logistic prediction of outcomes | IBM SPSS | "Regression" — https://www.ibm.com/products/spss-statistics/regression | E | MVP (OLS + binary logistic with full statistical contract) | Analytics |
| S5 | Bootstrapping: resampled SEs/CIs for mean, median, correlation, regression coefficients; controllable sample count and random seed | IBM SPSS | "Bootstrapping" (same as S3) | E | MVP (bootstrap CI for key estimates with recorded seed) | Analytics |
| S6 | Missing values: pattern analysis and imputation workflow | IBM SPSS | "Missing Values" — https://www.ibm.com/products/spss-statistics/missing-values | E | MVP: explicit missing handling + missingness summary; imputation workflow Later | Analytics |
| S7 | Exact tests for small samples/cells | IBM SPSS | "Exact Tests" — https://www.ibm.com/products/spss-statistics/exact-tests | E | MVP (Fisher exact path for 2×2 small cells via SciPy) | Analytics |
| S8 | Custom tables: nesting/stacking, presentation-ready summary tables with CIs and significance marks | IBM SPSS | "Custom Tables" — https://www.ibm.com/products/spss-statistics/custom-tables | E | MVP: crosstab with row/col/total % + tests; nested/stacked tables Later | Analytics |
| S9 | Advanced statistics: GLM, GENLIN, mixed models, Cox survival | IBM SPSS | "Advanced Statistics" — https://www.ibm.com/products/spss-statistics/advanced-statistics | E | Later (explicit phased gap list; no SPSS-parity claim) | Analytics |
| S10 | Forecasting/time series (incl. VAR), decision trees, neural networks, conjoint, complex samples, categories (optimal scaling) | IBM SPSS | "Forecasting", "Decision Trees", "Neural Networks", "Conjoint Analysis", "Complex Samples", "Categories" — https://www.ibm.com/products/spss-statistics/forecasting et al. | E | Later: trend + basic forecasting, clustering, then trees/conjoint/complex samples. Neural networks Excluded | Analytics |
| S11 | Mediation analysis, statistics for genomics, AI output assistant | IBM SPSS | "Features" — https://www.ibm.com/products/spss-statistics/features | E | Mediation Later; genomics Excluded; AI summaries Later behind explicit config | Analytics |
| S12 | `.sav` raw-data interchange (SPSS file format) | IBM SPSS | "IBM SPSS Statistics" — https://www.ibm.com/products/spss-statistics (product family reference) | I | MVP via `pyreadstat` adapter with round-trip tests; capability status surfaced honestly | Analytics |
| S13 | Reproducible analysis: saved procedure + parameters rerunnable on dataset version | IBM SPSS | Syntax/procedure concept across feature pages | I | MVP (analysis recipes: dataset version + params + library versions + seed) | Analytics |

## 5. Cross-cutting capabilities (inferred product baseline)

| # | Capability & user outcome | Source | Evidence | Decision | OK module |
|---|---------------------------|--------|----------|----------|-----------|
| X1 | Multi-tenant org/workspace with roles and per-module permissions | Preely (workspaces), all | I — all four products imply team/tenant models; role taxonomy is our design | MVP | Administration |
| X2 | Audit log of imports, exports, publication, membership and permission changes | — | I — assumption; GDPR-driven requirement, not evidenced in crawls | MVP | Administration |
| X3 | GDPR consent records, retention, irreversible anonymization; PII separated from research answers | — | I — assumption from product goal + Danish market (nps.today privacy pages confirm GDPR posture only) | MVP: consent + PII separation + anonymization; retention automation Later | Panel |
| X4 | CSV/XLSX panel import with mapping, validation, dedup, dry run, error report | — | I — standard panel tooling; workflow design is ours | MVP | Panel |
| X5 | Danish + English UI and survey variants | nps.today (da/en site pairs in crawl) | E (bilingual content exists) / I (in-product behavior) | MVP (survey language variants + locale-aware formatting; UI in English with da survey support) | All |
| X6 | Insights repository linking findings to evidence | Lyssna | "UX Research Repository" — https://www.lyssna.com/blog/ux-research-repository/ | E (concept) | MVP-lite (insight records linked to studies/analyses); full-text search Later | Insights |

## Coverage summary

- **MVP**: 34 capabilities (P1–P3, P5, P6, P8, P9, L1–L3, L9, L13, N1–N9, N12, S1–S8, S12, S13, X1–X6)
- **Later**: 21 capabilities (P7, P10, P11, L4–L8, L10–L12, N10, N11, N13, S9, S10-partial, S11-partial, plus enrichment, reminders, wallboards, imputation)
- **Excluded**: 6 capabilities (P12, P13, N14, N15, genomics, neural networks)

Marketing claims were not treated as implementation proof: where a crawl page only asserts an
outcome ("AI agent", "instant closed loop"), the row is marked `I` and our implementation decision
is recorded independently.
