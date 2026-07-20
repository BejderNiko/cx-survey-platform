# ADR-004: Synchronous execution with durable job records; queue as upgrade path

**Status:** accepted · 2026-07-16

## Decision

Imports, distribution send-outs, exports, and analyses run synchronously inside
the server action/request, but every operation writes a durable record first
(`import_batches`, `distributions` + `outbox_messages`, `analysis_runs` with
status/error/seed/library versions). Nothing long-running hides in memory.

## Rationale

At current scale (hundreds of panelists, survey-sized datasets) synchronous
execution is faster to build, easier to debug, and completes in well under a
second. Supabase Queues/PGMQ (the mandated queue) is unavailable without the
Supabase stack (ADR-002). Adding Celery/Redis is explicitly prohibited without
measured need.

## Consequences

- The job-record schema is queue-ready: moving an operation to a worker means
  enqueueing the record id instead of executing inline; consumers already
  treat records as the source of truth.
- Known limit: very large imports/exports would block a request — documented
  as a later milestone tied to the Supabase Queues adoption.
