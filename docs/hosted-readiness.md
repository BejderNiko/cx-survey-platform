# Hosted readiness for 6–8 internal users

Status: code- and runbook-ready for staging validation. No hosted resource or production data was changed.

Code cannot guarantee 100% uptime. Availability depends on Vercel, Supabase, analytics hosting, network, plan limits, operational monitoring, backup restore, and incident response.

## Runtime topology

- Web: Next.js on Vercel.
- System of record: Supabase managed PostgreSQL.
- Authenticated SQL: RLS-enforced application login through `DATABASE_URL`.
- Privileged server-only SQL: separately reviewed login through `DATABASE_ADMIN_URL`.
- Analytics: FastAPI deployment over HTTPS.
- Local-only database: PGlite. Hosted Preview/Production rejects PGlite and loopback targets.

`GET /api/health/readiness` returns only readiness booleans. It checks mandatory hosted configuration, database connectivity, and protected analytics details. It returns HTTP 503 if any dependency is unavailable. It never returns connection strings, keys, host details, or exception text.

## Environment-variable roles

| Variable | Caller → target | Exposure | Rule |
|---|---|---|---|
| `DATABASE_URL` | web server → PostgreSQL | server secret | Dedicated non-owner, RLS-enforced application connection. Never `postgres`, `service_role`, or admin role. |
| `DATABASE_ADMIN_URL` | narrow server paths → PostgreSQL | highly privileged server secret | Separate PostgreSQL URL. Never browser config or Supabase API key. |
| `SESSION_SECRET` | web server → session signing | server secret | Unique per environment; at least 32 random bytes. |
| `APP_BASE_URL` | web server → public links | public config | Exact HTTPS origin in Preview/Production. |
| `ANALYTICS_URL` | web server → FastAPI | server config | HTTPS origin in Preview/Production. No localhost fallback. |
| `ANALYTICS_API_SECRET` | web server → FastAPI | shared server secret | Same value on matching web/analytics environment; at least 32 random bytes; different between staging and production. |
| `IMPORT_API_SECRET` | approved caller → import route | server secret | Authenticates caller to OK route. Not Firecrawl credential. |
| `FIRECRAWL_API_KEY` | import route → Firecrawl | provider secret | Authenticates OK route to Firecrawl. Not route secret. |
| `NEXT_PUBLIC_SUPABASE_URL` | browser → Supabase | public config | Used when Supabase Auth cutover is active. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser → Supabase | public key | Safe only with correct RLS. Never service role. |
| `SUPABASE_SERVICE_ROLE_KEY` | narrow server path → Supabase API | highly privileged server secret | Bypasses RLS. Never browser-visible and never substituted for a PostgreSQL URL. |

Preview must use staging-only database, analytics service, and secrets. Production values must differ.

## Timeouts and failure behavior

- Analytics calls time out after 30 seconds by default; health details use 1.5 seconds.
- Analysis runs persist `running`, then `succeeded` or `failed` in separate transactions.
- Panel imports persist `dry_run`, `committing`, `committed`, or `failed`; visits to import/history recover `committing` leases older than 15 minutes as failed after the atomic write transaction has released its row lock.
- Readiness returns 503 on missing configuration, database failure, analytics failure, or timeout.
- User-facing study errors show controlled text. Logs and responses must not include secret values.

## Backup and restore gate

Before production:

1. Choose Supabase backup/PITR plan and record RPO/RTO owners.
2. Create staging restore point.
3. Restore into isolated staging project.
4. Verify row counts, migration ledger, RLS policies, application login, one seeded study, one panel batch, and one dataset version.
5. Record restore duration and evidence.
6. Do not declare production-ready until restore drill passes.

## Monitoring

Monitor at minimum:

- Vercel 5xx rate, latency, function timeout, and deployment health.
- `/api/health/readiness` from an external monitor.
- Supabase CPU, storage, connection pool, slow queries, backup status, and Security Advisor.
- Analytics `/health`, authenticated `/health/details`, latency, memory, cold starts, and 5xx rate.
- Counts of panel imports stuck in `committing`, analysis runs stuck in `running`, and new `failed` rows.

Alert destination, on-call owner, and business-hours response target remain OK-owned decisions.

## Rollback

- Code: use Vercel rollback to last compatible deployment; verify database schema remains compatible.
- Database: prefer reviewed forward-fix. Never automatically reverse data-loss migration.
- Analytics: retain previous container/deployment revision until one clean business cycle.
- Import: failed panel transaction rolls back panelist/consent/attribute writes; batch remains durable as `failed` when database is reachable.
- Migration `20260729000012_import_commit_lifecycle.sql` is additive. Hosted execution remains separately approval-gated.
