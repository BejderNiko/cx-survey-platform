# Fable 5 Build Prompt: OK CX Survey Platform

## Recommended run settings

- Model: Claude Fable 5
- Effort: `xhigh` for architecture and first implementation; reduce to `high` for routine follow-up work
- Run style: autonomous, long-running, with streaming and a generous client timeout
- Working directory: current repository
- Inputs: make these four files readable to the model and its tools

## Prompt

<role>
Act as principal product engineer, research-operations specialist, data architect, statistical-software engineer, and UX lead. Own product discovery, architecture, implementation, verification, and documentation for this project.
</role>

<context>
OK currently depends on separate products for participant-panel management, survey and UX research, operational CX, and advanced statistical analysis. This fragments workflows, data, licenses, integrations, and IT ownership.

Build one original, multi-user CX Survey Platform for OK. Consolidation should reduce duplicate work and IT resources while preserving four capability families:

1. Preely-inspired panelist recruitment, profiles, segmentation, engagement, contact governance, and participation history.
2. Lyssna-inspired surveys and mixed-method research studies, templates, recruitment/screening, result sharing, and UX research analysis.
3. NPS.today-inspired operational CX programs: NPS, CSAT, CES, automated triggers, multi-channel distribution, notifications, follow-up ownership, and closed-loop workflows.
4. IBM SPSS-inspired data preparation, raw-data interchange, statistical analysis, reproducible output, tables, and visualizations.

Use competitor material only as product-research evidence. Do not copy proprietary code, wording, layouts, brand identities, screenshots, or assets. Build an original OK product and information architecture.

Current repository may be empty. Inspect it before choosing architecture. If no application exists, establish a production-minded foundation using current stable, well-supported technologies. Keep setup simple enough to run locally.
</context>

<source_inputs>
Read and programmatically inspect every record in these UTF-8 JSON crawl files before finalizing scope:

- `C:\Users\NIBE\preely-crawl.json`
- `C:\Users\NIBE\lyssna-crawl.json`
- `C:\Users\NIBE\nps-crawl.json`
- `C:\Users\NIBE\ibm-spss-crawl.json`

Each file contains an array of page records with `markdown`, `metadata`, and sometimes `warning`. Files may contain a UTF-8 BOM, mojibake, duplicate or low-value marketing pages, and incomplete product coverage. Parse them structurally. Normalize text only in derived research notes; never modify source crawl files.

Before implementation, create `docs/source-capability-matrix.md`. For every adopted capability, record:

- Capability and user outcome
- Source product
- Source page title and URL from metadata
- Evidence versus inference
- Decision: MVP, later milestone, or excluded
- Target OK module

Do not treat marketing claims as proof of implementation details. Where source evidence is incomplete, label assumption and choose sensible behavior consistent with product goal.
</source_inputs>

<primary_objective>
Deliver working, locally runnable application that proves one coherent end-to-end flow:

1. Team member signs in.
2. Member reviews seeded dummy panelists or imports a validated panelist file.
3. Member filters or creates a reusable panel segment.
4. Member creates or duplicates a branded survey, adds logic, previews it, and publishes it.
5. Member shares public link or distributes simulated invitations to selected panelists.
6. Respondents complete survey.
7. Responses appear in live results.
8. Rules create alerts or follow-up tasks for important responses.
9. Analyst filters data, creates charts, runs statistical analyses, saves reproducible analysis, and exports raw data and results.
10. Another authorized team member can review, collaborate, or analyze according to role.

Do not stop after planning or scaffolding. Implement vertical slice, run it, exercise it in browser, fix defects, and document remaining gaps honestly.
</primary_objective>

<product_principles>
- One shared data model, not four loosely connected mini-products.
- Survey response connects to study, distribution, panelist when permitted, operational follow-up, and analysis dataset.
- Reusable workflows beat one-off screens.
- Raw data remains accessible; derived metrics remain traceable.
- Statistical output must show method, sample, missing-data treatment, assumptions, uncertainty, and provenance.
- Privacy and tenant isolation are foundational.
- Default interface serves repeated internal work: quiet, dense, scan-friendly, and fast.
- Danish and English content must be supported. Use locale-aware dates, numbers, and survey text.
- No invented OK logo or undocumented brand rules. Use replaceable design tokens and neutral OK text branding until official assets are provided.
</product_principles>

<information_architecture>
Use clear primary navigation:

- Home
- Panel
- Studies
- Distributions
- Responses
- Analytics
- Insights
- Follow-up
- Administration

Avoid marketing-style landing page. First screen after sign-in should be operational overview with current studies, response activity, panel health, pending follow-ups, and recent analysis.
</information_architecture>

<functional_requirements>

## 1. Organizations, workspaces, and team access

- Multi-tenant organization and workspace model.
- Invite and deactivate members.
- Roles: Owner, Administrator, Researcher, Panel Manager, Analyst, Viewer.
- Central permission policy; enforce it in API and UI.
- Scope access by organization, workspace, study, dataset, and report where appropriate.
- Audit important actions: membership changes, imports, exports, survey publication, deletion, anonymization, and permission changes.
- Comments or notes on studies, follow-ups, analyses, and reports.
- Local development authentication with seeded users. Keep clean OIDC boundary for later Microsoft Entra ID integration; do not pretend enterprise SSO exists unless implemented and tested.

## 2. Panel management

- Panelist list with fast search, filters, sorting, bulk selection, saved views, and saved segments.
- Profile fields: stable ID, name, email, phone, language, age or birth year, gender when collected, geography, customer status, recruitment source, lifecycle status, consent status and timestamps, created/updated timestamps.
- Configurable custom attributes, recruitment questions, value labels, tags, notes, and attachments or links.
- Profile view with recruitment answers, tags, notes, consent, message/contact history, survey participation history, response eligibility, and engagement status.
- Lifecycle states such as invited, active, paused, unsubscribed, bounced, blocked, anonymized, and archived.
- Screening questions and qualify/disqualify logic.
- Segmentation by profile fields, custom attributes, recruitment answers, tags, activity, message behavior, and participation history.
- Handpicked, random, and mixed panelist sampling. Record random seed and selection logic.
- Governance controls: contact-frequency caps, maximum invite size, exclusions, cooldown periods, quotas, duplicate prevention, and survey-fatigue protection.
- Panel health: active count, consent state, demographic coverage, invitations, opens, clicks, bounces, spam/block events, response and completion rates, recent activity, and stale profiles.
- Enrichment campaigns that collect additional attributes over time.
- Separate identity/contact data from research answers so retention and anonymization can break link irreversibly when required.

## 3. Dummy panelists and later real-data import

- Seed deterministic, clearly fictional panelists with enough variation to test segments, quotas, contact governance, and statistics.
- Use reserved or invalid domains such as `example.invalid`; never generate plausible real personal data.
- Document seed, distributions, and generation method.
- Build real import workflow now, but do not import real OK data during this task.
- Accept CSV and XLSX first. Provide extensible adapter for additional formats.
- Import steps: upload, encoding/delimiter detection, sheet selection, column preview, field mapping, type inference, value mapping, validation, consent-field confirmation, deduplication rule, dry-run summary, commit, and downloadable error report.
- Support stable external ID and configurable deduplication by external ID or normalized email.
- Make imports idempotent where external IDs exist. Record import batch, source, author, counts, errors, and rollback boundary.

## 4. Study and survey management

- Study lifecycle: draft, review, scheduled, live, paused, closed, archived.
- Create from scratch or template; duplicate whole study without copying responses or secrets.
- Version published instruments. Preserve response schema tied to published version.
- Organize with workspace, owner, collaborators, folders, tags, and search.
- Builder supports reusable blocks, drag/reorder, undo/redo, validation, desktop/mobile preview, and accessible respondent view.
- Core question types: NPS, CSAT, CES, single choice, multiple choice, dropdown, short text, long text, numeric, date, rating, Likert, matrix, ranking, and consent/acknowledgement.
- Logic: branching, skip logic, display conditions, termination, required/optional, answer randomization, option randomization, piping, quotas, and screening.
- Themes: logo slot, colors, typography tokens, intro, thank-you, disqualification, closed, and quota-full messages.
- Danish and English survey variants with fallback and preview.
- Templates for relational NPS, transactional NPS, CSAT, CES, onboarding, service recovery, churn, product feedback, and employee or member feedback.
- Calculate NPS correctly as `% promoters - % detractors`, with 9-10 promoters, 7-8 passives, and 0-6 detractors. Show numerator, denominator, valid-response rules, and time window.
- Keep metric definitions versioned so later wording or scale changes do not silently corrupt trends.

## 5. Lyssna-style research methods

Design shared study engine so modules reuse audience, distribution, responses, permissions, and reporting. Include:

- Surveys
- First-click tests with click maps and success criteria
- Five-second tests
- Preference tests
- Open, closed, and hybrid card sorting
- Tree testing and navigation success paths
- Prototype testing through URL or Figma-compatible link boundary
- Live-website tasks
- Think-aloud and interview scheduling records

Implement surveys fully in first vertical slice. Implement at least one interaction-based method end to end, preferably first-click testing. Scaffold remaining methods only where shared engine genuinely supports them; label incomplete UI and code paths accurately. Do not create decorative nonfunctional controls.

## 6. Distribution and operational CX

- Public anonymous link and unique tokenized participant link.
- Simulated development outbox for email invitations, reminders, and transactional messages. No real sending without explicit provider configuration.
- QR and embeddable-link generation where practical.
- Schedule open/close times, reminders, quotas, throttling, frequency caps, and exclusion rules.
- Track queued, sent, delivered, opened, clicked, started, completed, bounced, unsubscribed, and failed states when channel supports them.
- API/webhook boundary for event-triggered surveys from CRM, service, e-commerce, and customer systems.
- Idempotency keys, signed webhook verification, retries, dead-letter handling, and traceable delivery logs.
- Connector architecture for Outlook, Teams, Dynamics, Salesforce, Zendesk, and generic webhooks. First milestone may use tested mocks; distinguish mocks from live integrations.
- Smart question flow: keep survey short while asking relevant follow-ups based on rating or prior answer.

## 7. Responses and closed-loop follow-up

- Response inbox with filters, saved views, respondent context when permitted, survey version, channel, timestamps, completion state, and tags.
- Rule engine based on survey, score, segment, answer, sentiment, channel, or time.
- Actions: alert, assign owner, create follow-up task, set priority/SLA, add tag, and invoke webhook.
- Follow-up states: new, assigned, in progress, waiting, resolved, dismissed.
- Notes, owner, due date, activity history, outcome, and resolution time.
- Team and personal views. Never expose responses across tenant or unauthorized workspace.
- Live dashboard or wallboard mode using privacy-safe fields.

## 8. Analytics workspace

Create approachable two-layer analytics UX:

- `Quick analysis` for researchers and CX users.
- `Advanced analysis` for analysts needing SPSS-like control.

Data workspace:

- Dataset registry with owner, source, version, row count, variable count, created time, and lineage.
- Data grid and variable view.
- Variable name, label, type, format, measurement level, value labels, missing-value rules, role, and notes.
- Filter, sort, recode, compute derived variables, group, aggregate, join approved datasets, reshape where supported, weight cases, and save transformations as reproducible steps.
- Never silently mutate source responses. Create versioned derived datasets.
- Explain row exclusions and missing-data handling for every result.

Imports and exports:

- Import CSV, XLSX, JSON, and SPSS `.sav` through tested adapters where runtime support is available.
- Export raw and filtered data to CSV, XLSX, JSON, and `.sav` where supported.
- Preserve stable IDs, question codes, variable labels, value labels, locale, multi-select representation, missing values, time zone, survey version, and panel linkage policy.
- Export analysis tables and chart-ready data. Export chart images and a readable report format.
- Provide round-trip tests for supported formats. If `.sav` support cannot be made reliable in current environment, expose clear capability status and retain adapter contract; do not fake file compatibility.

Core analysis methods:

- Frequencies, valid/missing counts, percent, cumulative percent
- Mean, median, mode, variance, standard deviation, min/max, quartiles, confidence intervals
- NPS, CSAT, CES, completion, response, and drop-off metrics
- Crosstabs with row/column/total percentages
- Correlation: Pearson and Spearman
- Chi-square and exact-test path for small cells where library supports it
- Independent and paired t-tests
- One-way ANOVA with post-hoc comparisons
- Common nonparametric alternatives
- Linear and binary logistic regression
- Reliability analysis including Cronbach's alpha
- Factor analysis suitable for survey scales
- Weighting and weighted estimates
- Missingness summary and explicit imputation workflow
- Bootstrapped estimates with recorded random seed
- Segmentation or clustering
- Time trend and basic forecasting

Later advanced milestones, after core methods are correct and tested:

- Generalized linear models
- Mixed or repeated-measures models
- Decision trees and predictive models
- Complex survey samples
- Conjoint analysis
- Mediation analysis
- Multivariate time series

Statistical contract:

- Show method, formula or library procedure, variables, filters, weights, sample size, excluded rows, missing strategy, assumptions, estimates, standard errors, confidence intervals, effect sizes where relevant, test statistic, degrees of freedom, p-value, and correction method.
- State what result supports and does not support. Never equate statistical significance with business importance.
- Save analysis recipes with dataset version, parameters, software/library versions, seed, author, and timestamp.
- Validate numerical results against independent known fixtures or a second trusted implementation.

Visualizations:

- KPI tiles only for real decisions, not decoration.
- Bar, stacked bar, line, area where justified, histogram, density, box plot, scatter, heatmap, correlation matrix, crosstab heatmap, NPS trend, cohort, funnel/drop-off, and first-click map.
- Accessible palette, labels, legends, annotations, confidence intervals where applicable, and downloadable underlying data.
- Global and chart-level filters. Saved dashboard layouts and shareable read-only reports respecting permissions.
- Charts must remain interpretable at common desktop widths and in exported reports.

Qualitative analysis:

- Search, tag, code, group, and annotate open-text responses.
- Themes and evidence snippets linked back to source responses.
- Optional AI summaries, sentiment, and topic suggestions only behind explicit configuration.
- AI output must show provenance, remain editable, and require human review. Never present generated interpretation as raw respondent evidence.

## 9. Insights repository

- Central searchable repository for studies, datasets, analysis outputs, reports, insights, themes, and evidence.
- Standard metadata and tag taxonomy.
- Link insight to supporting charts, tables, response excerpts, study, and dataset version.
- Comments, owners, status, decision/recommendation, and visibility controls.
- Full-text search where supported; otherwise provide explicit implementation milestone rather than fake search.

## 10. Privacy, security, and governance

- GDPR-oriented data design: consent record, purpose, retention rule, export, correction, deletion, and irreversible anonymization workflow.
- Data minimization. Do not collect sensitive attributes by default.
- Separate PII from analytical facts. Use pseudonymous IDs in analysis datasets.
- Encrypt transport; use secure secret management and production-ready password/session defaults.
- Tenant isolation and authorization tests for every sensitive resource type.
- Audit imports, exports, member access changes, publication, retention, deletion, and anonymization.
- Prevent CSV formula injection on export and unsafe file handling on import.
- Rate-limit public response and webhook endpoints. Validate file size, extension, MIME type, schema, and row limits.
- No production claims for compliance, encryption, SSO, backups, or connectors without implemented and verified evidence.
</functional_requirements>

<technical_direction>
First inspect repository and installed runtimes. Prefer existing patterns if code exists. For an empty repository, use architecture comparable to:

- TypeScript web application with current stable React-based framework
- PostgreSQL database with migrations and typed data access
- Python analytics service using maintained libraries such as pandas, SciPy, statsmodels, scikit-learn, and pyreadstat when compatible
- Background-job boundary for imports, exports, distributions, and heavy analysis
- S3-compatible object-storage boundary, with local development implementation
- Containerized local dependencies or equally reproducible setup

This is direction, not blind mandate. Choose simpler equivalent when it improves reliability. Record key decisions in `docs/architecture.md` and short ADRs. Avoid microservices unless analytics runtime or job isolation creates real need.

Use structured parsers and statistical libraries. Do not hand-roll spreadsheet, SAV, statistical distribution, authentication, or survey-logic engines when mature maintained libraries exist.

Keep domain boundaries explicit:

- Identity and tenancy
- Panel and consent
- Studies and instrument versions
- Distribution and delivery
- Responses
- Follow-up
- Datasets and transformations
- Analyses and outputs
- Insights and reporting
</technical_direction>

<required_stack>
This section is mandatory and controls if it conflicts with broader technical direction above. Pin current stable compatible versions at implementation time and commit lockfiles.

Repository:

- GitHub as source of truth.
- Monorepo with `pnpm` workspaces and Turborepo.
- `apps/web`: Next.js application.
- `apps/analytics`: Python analytics API and worker.
- `packages/ui`, `packages/domain`, and `packages/config` only for proven shared code.
- `supabase/`: local configuration, SQL migrations, seed, database functions, grants, RLS, and Storage policies.

Web stack:

- Next.js App Router, React, strict TypeScript, and Vercel.
- Tailwind CSS, shadcn/ui, and Radix primitives.
- React Hook Form and Zod for forms and validation.
- TanStack Table with virtualization for operational and analytical tables.
- Plotly.js for interactive statistical visualizations.
- Next.js Route Handlers or Server Actions for bounded application commands.
- Avoid duplicate generic API layer and avoid heavy analysis inside Vercel request handlers.

Supabase stack:

- Supabase PostgreSQL as transactional system of record.
- Supabase Auth as authoritative identity service.
- Microsoft Entra ID through Supabase Azure provider for production team login; seeded local users until credentials exist.
- RLS on every exposed tenant table plus server-side permission checks.
- `supabase-js`, generated TypeScript database types, and reviewed SQL functions for complex transactions.
- Supabase CLI migrations as sole schema migration source. Do not add competing Prisma or ORM migrations.
- Private Supabase Storage for imports, exports, attachments, Parquet datasets, reports, and temporary analysis files.
- Signed short-lived URLs and object-level authorization.
- Supabase Realtime only for useful response, follow-up, and dashboard updates.
- Supabase Queues/PGMQ for durable import, export, distribution, notification, and analytics jobs.
- Separate development, staging, and production Supabase projects.
- Never connect Vercel Preview to production database or production panelist data.
- Use EU region only after OK confirms data-residency and processor requirements.

Analytics stack:

- Python managed by `uv` and `pyproject.toml` with locked dependencies.
- FastAPI and Pydantic for typed internal endpoints and job contracts.
- pandas, PyArrow, and DuckDB for processing, Parquet datasets, and analytical queries.
- SciPy and statsmodels for tests and regression.
- scikit-learn for clustering and supported predictive methods.
- pyreadstat for tested SPSS `.sav` import and export.
- Plotly Python for figures compatible with Plotly.js.
- openpyxl or equivalent maintained XLSX library.
- pytest with fixed numerical fixtures and cross-library validation.
- Keep raw responses normalized in PostgreSQL. Materialize large or wide versioned analytical datasets as Parquet in private Storage.
- Queue imports, `.sav` conversion, large exports, reports, distributions, and nontrivial analyses.
- Worker must be idempotent and record job state, inputs, tenant, dataset version, library versions, seed, outputs, and errors.

Containerize analytics API and worker. Keep deployment portable. Do not make critical analytics depend on Vercel Python runtime or Vercel Queues while those services remain Beta. Choose production worker host after checking OK cloud policy. Prefer Azure Container Apps or comparable managed container runtime when OK Microsoft/Azure governance supports it. Local worker must run through Docker without cloud credentials.

Do not add Celery, Redis, or second queue unless measured requirements exceed Supabase Queues. Do not use Supabase Edge Functions for heavy statistical computation.

GitHub and delivery:

- Short-lived feature branches and pull requests.
- Protected `main` with review, passing checks, and resolved conversations.
- GitHub Actions: format, lint, TypeScript, Python, unit, integration, RLS/tenant isolation, build, and Playwright smoke tests.
- Development, Preview, Staging, and Production environments with least-privilege secrets.
- Dependency, code, and secret scanning where account plan supports them.
- Vercel Preview for pull requests using non-production Supabase.
- Production deploy from protected `main` after approvals.
- Preview and Production environment variables separated.
- Vercel function region aligned with Supabase region when supported.
- No persistent reliance on Vercel function filesystem.
- Production migrations run in dedicated approved job with concurrency protection, not generic Vercel build.
- Do not create remote repository, paid service, or cloud resource without explicit approval.

Development:

- Visual Studio Code recommended; full Visual Studio supported as editor.
- Add `.editorconfig`, workspace recommendations, tasks, and debug profiles.
- Keep build, test, migration, seed, and run commands IDE-independent.
- No `.sln`, MSBuild, or .NET dependency unless OK explicitly selects .NET.
- Use Vitest for TypeScript unit/domain tests, Playwright for end-to-end journeys, and pytest for analytics/file adapters.
- Use Supabase CLI and Docker for local development.
- Add `.env.example` with variable names and descriptions, never values.

Required environment flow:

`feature branch -> GitHub pull request -> CI -> Vercel Preview with non-production Supabase -> review -> protected main -> staging checks -> approved production deployment`
</required_stack>

<minimum_data_model>
Design normalized entities covering:

- Organization, Workspace, User, Membership, Role, Permission
- Panel, PanelistIdentity, PanelistProfile, CustomField, AttributeValue, ConsentRecord, Tag, Segment, ContactEvent, ImportBatch
- Study, StudyVersion, Instrument, Block, Question, Option, LogicRule, Template, Collaborator
- Distribution, AudienceSnapshot, Invitation, DeliveryEvent, PublicLink, TriggerEvent
- Response, ResponseAnswer, ResponseEvent, InteractionEvent
- FollowUpRule, FollowUpCase, Assignment, Note, Activity
- Dataset, DatasetVersion, Variable, ValueLabel, TransformationRecipe, AnalysisRecipe, AnalysisRun, AnalysisOutput, Chart, Dashboard
- Insight, EvidenceLink, Comment, AuditEvent

Protect historical accuracy with immutable published study versions, audience snapshots, response provenance, and dataset versions.
</minimum_data_model>

<delivery_sequence>
Maintain `docs/implementation-plan.md` and update it as work progresses.

1. Discovery and source matrix
2. Architecture, domain model, threat/privacy notes, and repository setup
3. Authentication, tenancy, roles, navigation, database, and deterministic seed
4. Panel list/profile/segments/governance and real import workflow
5. Survey builder/versioning/preview/duplicate/publish/respond flow
6. Distribution simulation, delivery tracking, response inbox, and follow-up rules
7. Quick analytics, advanced dataset workspace, core statistics, charts, and exports
8. Multi-user collaboration, insights repository, audit, and privacy workflows
9. Browser accessibility/responsiveness checks, numerical validation, security tests, and documentation

Build thin end-to-end capability early. Then deepen modules. Do not spend entire run designing architecture without a working response-to-analysis path.
</delivery_sequence>

<acceptance_criteria>
Do not call first milestone complete until evidence demonstrates:

1. Two seeded users with different roles have different allowed actions.
2. Tenant/workspace isolation is enforced by automated tests.
3. Dummy panelists support profiles, tags, filters, saved segment, random selection, consent, contact history, and frequency cap.
4. CSV or XLSX panel import supports preview, mapping, validation, deduplication, dry run, commit, audit, and error report.
5. User can create, duplicate, preview, publish, and close survey with branching.
6. Public or tokenized respondent can complete survey on mobile and desktop.
7. Responses connect to exact published survey version and appear in results.
8. NPS fixture calculation proves promoters minus detractors with transparent denominator.
9. Important response creates assigned follow-up through tested rule.
10. Analyst can create derived dataset without mutating raw responses.
11. Core descriptive statistics, crosstab, one inferential test, regression, and at least five useful chart types run on seeded data and match trusted fixtures.
12. Raw export contains documented schema and passes supported round-trip tests.
13. Saved analysis can rerun with same inputs and reproduce result.
14. Another authorized member can review shared study and analysis; Viewer cannot modify them.
15. No critical accessibility violations in core flow; keyboard navigation and visible focus work.
16. Browser verification covers common desktop and mobile viewport with no incoherent overlap or clipped controls.
17. Setup, migrations, seed, tests, and local run instructions work from clean checkout.
</acceptance_criteria>

<verification_rules>
- Before reporting progress, verify every claim against tool output from this run.
- Run focused tests continuously and full relevant suite before milestone completion.
- Validate statistics with fixed datasets containing known answers and edge cases.
- Test zero responses, all missing, tiny sample, duplicated import rows, multi-select questions, partial responses, deleted panelist link, expired survey, and unauthorized access.
- Use browser automation for core flow. Capture screenshots for key operational views at desktop and mobile sizes.
- Inspect console and network errors.
- Report failed, skipped, mocked, scaffolded, and unverified behavior plainly.
- Never describe placeholder, mock connector, planned format, or static chart as implemented production capability.
</verification_rules>

<scope_boundaries>
- Do not use real OK panelist data during this task.
- Do not send real email or SMS.
- Do not copy competitor visual identity or assets.
- Do not claim full SPSS parity. Deliver correct core analysis and maintain explicit phased gap list.
- Do not add unrelated marketing site, billing, subscription plans, or public participant marketplace.
- Do not add features, abstractions, compatibility shims, or infrastructure unrelated to stated product.
- Do not perform destructive or irreversible operations without explicit approval.
</scope_boundaries>

<autonomy>
When enough information exists, act. Make reversible technical choices and record assumptions. Ask user only for input unavailable from repository or source files when wrong assumption would materially change product, expose data, incur external cost, or cause irreversible action.

Do not end on plan or promise. Continue implementation until acceptance criteria are met or a genuine blocker requires user input. When blocked, state exact evidence, completed work, and smallest decision needed.
</autonomy>

<final_report>
Lead with working outcome. Then report:

- Run instructions and local URL
- Implemented workflows with evidence
- Test, browser, accessibility, and numerical-validation results
- Architecture and data-model decisions
- Source capability coverage by MVP/later/excluded counts
- Privacy and security controls implemented versus planned
- Mocked or incomplete connectors and file formats
- Known limitations and next highest-value milestone

Keep report clear for product owner who did not watch tool work. Do not expose hidden reasoning. Provide concise rationale, evidence, and decisions.
</final_report>
