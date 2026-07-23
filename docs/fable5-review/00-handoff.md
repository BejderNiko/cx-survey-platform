# Fable 5 Review Handoff

Snapshot date: 2026-07-20. Review target: current pull-request branch against local `main`.

## Verified source state

| Item | Value | Evidence |
|---|---|---|
| Review checkout | `C:\Users\NIBE\Documents\cx-survey-platform-review` | Local path inspected 2026-07-20 |
| Branch | `review/hardened-vertical-slice` | `git branch --show-current` |
| HEAD | `bceeacde8377f58d191bdc914c39f17d54448212` (`bceeacd`) | `git rev-parse HEAD`; `git log -1` |
| HEAD subject | `Pass session secret to web build` | `git log -1 --format=%s` |
| Base | local `main` at `5a6f713` | `git log --decorate`; Fable must verify |
| PR diff | 180 files, 23,629 insertions, 6,966 deletions | `git diff --shortstat main...HEAD` |
| Changed-file count | 180 | Count of `git diff --numstat main...HEAD` rows |
| Source working tree before review-package copy | clean | `git status --porcelain=v1` returned no rows |

Calculation:

```text
changed files = count(git diff --numstat main...HEAD rows) = 180
insertions = git diff --shortstat main...HEAD = 23,629
deletions = git diff --shortstat main...HEAD = 6,966
```

Review-package files may appear as expected untracked files after handoff. They are inputs, not part of commit `bceeacd`. Any other change invalidates baseline.

## CI and Preview state

Referenced Codex session `019f7f10-258c-7443-83c6-041274370f2f` observed following at same commit:

- GitHub showed five green checks.
- Latest Vercel Preview build completed: Next compilation, TypeScript, page-data collection, and deployment succeeded.
- `git diff --check main...HEAD` returned no whitespace errors.
- Preview runtime login failed.
- Runtime log showed connection refusal to `127.0.0.1:54329`.

Failure chain:

```text
POST /login
  -> verifyCredentials()
  -> adminSql
  -> DATABASE_ADMIN_URL absent
  -> apps/web/lib/env.ts localhost fallback
  -> 127.0.0.1:54329 inside Vercel
  -> connection refused
```

Password validity was never evaluated. Green build proves compilation and configured build pipeline only. It does not prove database, authentication, analytics, RLS, or end-to-end Preview behavior.

External check status is carried from referenced session. Fable is forbidden to refresh GitHub/Vercel state in first pass.

## Supabase staging state

Referenced session visually inspected newly created Supabase project `cx-survey-platform-staging` as healthy. State at handoff:

- designated staging
- separate from Production
- empty of application schema/data
- no repository migrations applied
- no synthetic seed applied
- no Vercel Preview database connection configured
- no hosted application role configured
- no Production data copied

User did not authorize migrations. Fable must not connect or change project.

Static migration audit in referenced session counted:

```text
tenancy/panel tables       16
study/response tables      15
analytics tables              7
retired repository tables     2
total                         40
```

No `DROP`, `TRUNCATE`, or `DELETE FROM` was found in four migration files. This does not establish hosted migration readiness.

## Known pre-review blockers and unknowns

Do not convert these into duplicate findings without deeper evidence:

- Hosted restricted database role is not defined. Local `cx_app` creation lives in `supabase/local/auth_shim.sql`, which must not run on hosted Supabase.
- `supabase/config.toml` absent.
- Hosted synthetic seed procedure not defined; only TypeScript local seed exists.
- Local bcrypt/JWT auth remains. Microsoft Entra ID through Supabase Auth not implemented.
- Preview lacks usable database and analytics services.
- Supabase Storage, Realtime, and Queues not exercised.
- Jobs run synchronously with durable records.
- Dataset rows stored inline in PostgreSQL JSONB; Parquet/object storage remains scale path.
- Production data region, Entra group mapping, retention schedule, DPIA ownership, legal basis, service ownership, RPO/RTO, and approved analytics host remain OK decisions.

Fable should report a known gap only when severity, hidden coupling, misleading documentation, or remediation order differs from current description.

## Review state vocabulary

Use one state for every capability:

| State | Required evidence |
|---|---|
| `verified working` | Direct implementation plus relevant test/reproduction in appropriate environment |
| `working only locally` | Direct local implementation/evidence; hosted path unverified or absent |
| `scaffolded/partial` | Boundary/subset exists; major behavior or production integration missing |
| `planned` | Documentation/prompt only; implementation evidence absent |

Lower state wins when evidence conflicts.

## Guardrails

- Review only. No fixes.
- No credentials or secret values.
- No remote operations.
- No migrations, seeds, SQL, or database changes.
- No Git writes.
- No deployment or provider configuration.
- No claim based only on documentation, screenshot, CI, or green build.
- Codex verifies all Blocker/Major findings before any implementation decision.
