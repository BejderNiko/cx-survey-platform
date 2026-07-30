import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getAnalyticsOverview,
  getDatasetWorkbenchData,
} from "@/lib/data/analytics";
import { loadDatasetPayload } from "@/lib/data/datasets";
import { adminDb, appDb, asUser } from "./helpers/db";

const admin = adminDb();
const app = appDb();

let orgA: string;
let orgB: string;
let multiUser: string;
let datasetA: string;
let datasetB: string;
let versionB: string;

beforeAll(async () => {
  const suffix = randomUUID();
  const [a] = await admin`select id from organizations where slug = 'ok-cx'`;
  const [b] = await admin`select id from organizations where slug = 'nordvind-demo'`;
  const [ownerA] = await admin`select id from users where email = 'owner@example.invalid'`;
  const [ownerB] = await admin`select id from users where email = 'other@example.invalid'`;
  const [existingA] = await admin`
    select id from datasets where org_id = ${a.id} order by created_at limit 1`;
  const [user] = await admin`
    insert into users (email, full_name)
    values (${`analytics-multi-${suffix}@example.invalid`}, 'Analytics Multi Org')
    returning id`;
  await admin`
    insert into memberships (org_id, user_id, role)
    values
      (${a.id}, ${user.id}, 'administrator'),
      (${b.id}, ${user.id}, 'administrator')`;
  const [foreignDataset] = await admin`
    insert into datasets (org_id, name, source_kind, owner_id)
    values (${b.id}, ${`Foreign dataset ${suffix}`}, 'file_import', ${ownerB.id})
    returning id`;
  const [foreignVersion] = await admin`
    insert into dataset_versions (
      org_id, dataset_id, version_number, row_count, variable_count,
      lineage, rows, created_by
    )
    values (
      ${b.id}, ${foreignDataset.id}, 1, 1, 1,
      '{}'::jsonb, '[{"score":9}]'::jsonb, ${ownerB.id}
    )
    returning id`;
  await admin`
    insert into variables (
      org_id, dataset_version_id, name, label, var_type, measure,
      value_labels, missing_values, role, position
    )
    values (
      ${b.id}, ${foreignVersion.id}, 'score', 'Score', 'numeric', 'scale',
      '{}'::jsonb, '[]'::jsonb, 'input', 0
    )`;

  orgA = a.id as string;
  orgB = b.id as string;
  multiUser = user.id as string;
  datasetA = existingA.id as string;
  datasetB = foreignDataset.id as string;
  versionB = foreignVersion.id as string;
  expect(ownerA.id).toBeTruthy();
});

afterAll(async () => {
  if (datasetB) await admin`delete from datasets where id = ${datasetB}`;
  if (multiUser) await admin`delete from users where id = ${multiUser}`;
  await app.end();
  await admin.end();
});

describe("analytics selected-organization scope", () => {
  it("filters overview data for the selected organization of a multi-org user", async () => {
    const overviewA = await asUser(
      app,
      multiUser,
      orgA,
      (tx) => getAnalyticsOverview(tx, orgA),
    );
    const overviewB = await asUser(
      app,
      multiUser,
      orgB,
      (tx) => getAnalyticsOverview(tx, orgB),
    );
    expect(overviewA.datasets.some((dataset) => dataset.id === datasetA)).toBe(true);
    expect(overviewA.datasets.some((dataset) => dataset.id === datasetB)).toBe(false);
    expect(overviewB.datasets.map((dataset) => dataset.id)).toContain(datasetB);
    expect(overviewB.datasets.some((dataset) => dataset.id === datasetA)).toBe(false);
  });

  it("keeps detail and payload scoped even through an admin transaction", async () => {
    await admin.begin(async (tx) => {
      const hidden = await getDatasetWorkbenchData(tx, {
        orgId: orgA,
        datasetId: datasetB,
      });
      const foreignPayload = await loadDatasetPayload(tx, orgA, versionB);
      const own = await getDatasetWorkbenchData(tx, {
        orgId: orgB,
        datasetId: datasetB,
      });
      expect(hidden).toBeNull();
      expect(foreignPayload).toBeNull();
      expect(own?.dataset.id).toBe(datasetB);
    });
  });
});
