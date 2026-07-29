import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  completePanelImport,
  failPanelImport,
  planPanelImport,
  recoverStalePanelImports,
  startPanelImportCommit,
  writePanelImport,
} from "@/lib/import/panel-commit";
import type { ImportMapping } from "@/lib/import/validate";
import { adminDb, appDb, asUser } from "./helpers/db";

const admin = adminDb();
const app = appDb();

let orgId: string;
let userId: string;
let otherOrgId: string;
let otherUserId: string;
let firstBatchId: string;

const mapping: ImportMapping = {
  external_id: "external_id",
  first_name: "first_name",
  email: "email",
  region: "attr:region",
};
const rows = Array.from({ length: 3_478 }, (_, index) => ({
  external_id: `BULK-${String(index + 1).padStart(5, "0")}`,
  first_name: `Person ${index + 1}`,
  email: `bulk-${index + 1}@example.invalid`,
  region: index % 2 === 0 ? "Nord" : "Syd",
}));

beforeAll(async () => {
  const suffix = randomUUID();
  const [org] = await admin`
    insert into organizations (name, slug)
    values ('Panel import test', ${`panel-import-${suffix}`}) returning id`;
  const [user] = await admin`
    insert into users (email, full_name)
    values (${`panel-import-${suffix}@example.invalid`}, 'Panel Import Tester') returning id`;
  await admin`
    insert into memberships (org_id, user_id, role)
    values (${org.id}, ${user.id}, 'panel_manager')`;
  await admin`
    insert into custom_fields (org_id, key, label, field_type)
    values (${org.id}, 'region', 'Region', 'text')`;
  const [otherOrg] = await admin`select id from organizations where slug = 'nordvind-demo'`;
  const [otherUser] = await admin`select id from users where email = 'other@example.invalid'`;
  orgId = org.id as string;
  userId = user.id as string;
  otherOrgId = otherOrg.id as string;
  otherUserId = otherUser.id as string;
});

afterAll(async () => {
  if (orgId) await admin`delete from organizations where id = ${orgId}`;
  if (userId) await admin`delete from users where id = ${userId}`;
  await app.end();
  await admin.end();
});

async function createCommittingBatch(filename: string): Promise<string> {
  return asUser(app, userId, orgId, async (tx) => {
    const [batch] = await tx`
      insert into import_batches (
        org_id, filename, file_kind, status, mapping, dedup_rule, counts,
        error_report, dry_run, created_by, commit_started_at
      )
      values (
        ${orgId}, ${filename}, 'csv', 'committing', ${tx.json(mapping)},
        'external_id', '{}'::jsonb, '[]'::jsonb, true, ${userId}, now()
      )
      returning id`;
    return batch.id as string;
  });
}

async function createDryRunBatch(
  filename: string,
  fileSha256 = `sha-${randomUUID()}`,
): Promise<{ batchId: string; fileSha256: string }> {
  return asUser(app, userId, orgId, async (tx) => {
    const counts = {
      total: 1,
      valid: 1,
      invalid: 0,
      create: 1,
      update: 0,
      skippedDuplicates: 0,
      before: 0,
      fileSha256,
      sheet: null,
    };
    const [batch] = await tx`
      insert into import_batches (
        org_id, filename, file_kind, status, mapping, dedup_rule, counts,
        error_report, dry_run, created_by
      )
      values (
        ${orgId}, ${filename}, 'csv', 'dry_run', ${tx.json(mapping)},
        'external_id', ${tx.json(counts as never)}, '[]'::jsonb, true, ${userId}
      )
      returning id`;
    return { batchId: batch.id as string, fileSha256 };
  });
}
describe("panel import database commit", () => {
  it("binds commit to dry-run fingerprint and records terminal lifecycle states", async () => {
    const dryRun = await createDryRunBatch("lifecycle.csv");
    await expect(asUser(app, userId, orgId, (tx) => startPanelImportCommit(tx, {
      orgId,
      batchId: dryRun.batchId,
      filename: "lifecycle.csv",
      mapping,
      dedupRule: "external_id",
      fileSha256: "different-fingerprint",
      sheet: null,
    }))).rejects.toThrow(/Filen eller arket/);

    await asUser(app, userId, orgId, async (tx) => {
      await startPanelImportCommit(tx, {
        orgId,
        batchId: dryRun.batchId,
        filename: "lifecycle.csv",
        mapping,
        dedupRule: "external_id",
        fileSha256: dryRun.fileSha256,
        sheet: null,
      });
      await completePanelImport(tx, {
        orgId,
        batchId: dryRun.batchId,
        counts: {
          total: 1,
          valid: 1,
          invalid: 0,
          create: 1,
          update: 0,
          skippedDuplicates: 0,
          before: 0,
          after: 1,
        },
        errors: [],
      });
    });

    const [batch] = await admin`
      select status, dry_run, commit_started_at, committed_at
      from import_batches where id = ${dryRun.batchId}`;
    expect(batch).toMatchObject({ status: "committed", dry_run: false });
    expect(batch.commit_started_at).toBeTruthy();
    expect(batch.committed_at).toBeTruthy();
  });

  it("finalizes explicit failures and recovers only expired committing leases", async () => {
    const failedBatchId = await createCommittingBatch("explicit-failure.csv");
    const staleBatchId = await createCommittingBatch("stale.csv");
    const freshBatchId = await createCommittingBatch("fresh.csv");
    await admin`
      update import_batches set commit_started_at = now() - interval '16 minutes'
      where id = ${staleBatchId}`;

    const result = await asUser(app, userId, orgId, async (tx) => {
      const failed = await failPanelImport(tx, {
        orgId,
        batchId: failedBatchId,
        message: "controlled failure",
      });
      const recovered = await recoverStalePanelImports(tx, orgId);
      return { failed, recovered };
    });
    expect(result).toEqual({ failed: true, recovered: 1 });

    const statuses = await admin`
      select id, status, failure_message
      from import_batches
      where id in (${failedBatchId}, ${staleBatchId}, ${freshBatchId})`;
    const byId = new Map(statuses.map((row) => [row.id as string, row]));
    expect(byId.get(failedBatchId)).toMatchObject({
      status: "failed",
      failure_message: "controlled failure",
    });
    expect(byId.get(staleBatchId)?.status).toBe("failed");
    expect(byId.get(freshBatchId)?.status).toBe("committing");
  });

  it("commits 3,478 creates, then repeats idempotently as 3,478 updates", async () => {
    firstBatchId = await createCommittingBatch("bulk-create.csv");
    const first = await asUser(app, userId, orgId, async (tx) => {
      const plan = await planPanelImport(tx, orgId, rows, mapping, "external_id");
      expect(plan.counts).toMatchObject({
        before: 0,
        total: 3_478,
        valid: 3_478,
        invalid: 0,
        create: 3_478,
        update: 0,
      });
      const verification = await writePanelImport(tx, {
        orgId,
        batchId: firstBatchId,
        filename: "bulk-create.csv",
        plan,
      });
      const counts = { ...plan.counts, after: verification.after };
      await tx`
        update import_batches set status = 'committed', dry_run = false,
          counts = ${tx.json(counts as never)}, committed_at = now()
        where id = ${firstBatchId} and org_id = ${orgId}`;
      return { counts, verification };
    });
    expect(first.counts.after).toBe(3_478);
    expect(first.verification.linked).toBe(3_478);

    const [firstEvidence] = await admin`
      select ib.status, ib.committed_at,
             (select count(*)::int from panelists p
              where p.org_id = ib.org_id and p.import_batch_id = ib.id) as linked,
             (select count(*)::int from consent_records c
              where c.org_id = ib.org_id) as consents,
             (select count(*)::int from panelist_attributes a
              where a.org_id = ib.org_id) as attributes
      from import_batches ib where ib.id = ${firstBatchId}`;
    expect(firstEvidence).toMatchObject({ status: "committed", linked: 3_478, consents: 6_956, attributes: 3_478 });
    expect(firstEvidence.committed_at).toBeTruthy();

    const secondBatchId = await createCommittingBatch("bulk-repeat.csv");
    const updatedRows = rows.map((row) => ({ ...row, first_name: `${row.first_name} opdateret` }));
    const second = await asUser(app, userId, orgId, async (tx) => {
      const plan = await planPanelImport(tx, orgId, updatedRows, mapping, "external_id");
      expect(plan.counts).toMatchObject({
        before: 3_478,
        create: 0,
        update: 3_478,
        invalid: 0,
      });
      const verification = await writePanelImport(tx, {
        orgId,
        batchId: secondBatchId,
        filename: "bulk-repeat.csv",
        plan,
      });
      return { plan, verification };
    });
    expect(second.verification).toEqual({ after: 3_478, linked: 3_478 });
    const [afterRepeat] = await admin`
      select count(*)::int as total,
             count(*) filter (where first_name like '% opdateret')::int as updated
      from panelists where org_id = ${orgId}`;
    expect(afterRepeat).toEqual({ total: 3_478, updated: 3_478 });
    const [consents] = await admin`
      select count(*)::int as count from consent_records where org_id = ${orgId}`;
    expect(consents.count).toBe(6_956);
  }, 60_000);

  it("keeps tenant deduplication scoped to the selected organization", async () => {
    const foreignPlan = await asUser(app, otherUserId, otherOrgId, (tx) => planPanelImport(
      tx,
      otherOrgId,
      [rows[0]],
      mapping,
      "external_id",
    ));
    expect(foreignPlan.counts).toMatchObject({ create: 1, update: 0 });
    const hiddenBatch = await asUser(app, otherUserId, otherOrgId, (tx) => tx`
      select id from import_batches where id = ${firstBatchId} and org_id = ${otherOrgId}`);
    expect(hiddenBatch).toHaveLength(0);
  });

  it("rolls back mid-import writes and persists failed status separately", async () => {
    const batchId = await createCommittingBatch("forced-failure.csv");
    const failureRow = [{
      external_id: "ROLLBACK-ONLY",
      first_name: "Rollback",
      email: "rollback-only@example.invalid",
      region: "Nord",
    }];
    await expect(asUser(app, userId, orgId, async (tx) => {
      const plan = await planPanelImport(tx, orgId, failureRow, mapping, "external_id");
      await writePanelImport(tx, { orgId, batchId, filename: "forced-failure.csv", plan });
      throw new Error("forced database finalization failure");
    })).rejects.toThrow("forced database finalization failure");

    await asUser(app, userId, orgId, async (tx) => {
      await tx`
        update import_batches
        set status = 'failed', failed_at = now(), failure_message = 'forced database finalization failure'
        where id = ${batchId} and org_id = ${orgId} and status = 'committing'`;
    });
    const [[panelist], [batch]] = await Promise.all([
      admin`select count(*)::int as count from panelists where org_id = ${orgId} and external_id = 'ROLLBACK-ONLY'`,
      admin`select status, failed_at, failure_message from import_batches where id = ${batchId}`,
    ]);
    expect(panelist.count).toBe(0);
    expect(batch).toMatchObject({ status: "failed", failure_message: "forced database finalization failure" });
    expect(batch.failed_at).toBeTruthy();
  });
});
