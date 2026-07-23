-- PROPOSAL ONLY — destructive statements must not run without approved backup and explicit migration approval.
-- Historical migrations stay immutable because the migration ledger verifies their SHA-256 checksums.

-- 1. Preflight counts for backup reconciliation.
select (select count(*) from insights) as insights,
       (select count(*) from evidence_links) as evidence_links,
       (select count(*) from comments where entity_type = 'insight') as insight_comments;

-- 2. Export all three result sets to an approved encrypted backup outside PostgreSQL.
-- 3. Record backup location, row counts, approver and restore test in change ticket.
-- 4. Only then move the statements below into a new timestamped migration.

-- begin;
-- lock table insights, evidence_links, comments in share row exclusive mode;
-- delete from comments where entity_type = 'insight';
-- drop table evidence_links;
-- drop table insights;
-- commit;

-- Rollback requires restoring insights, evidence_links and insight comments from verified backup.
