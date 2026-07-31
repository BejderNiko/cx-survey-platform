import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listPanelists, parsePanelFilters } from "@/lib/data/panel";
import type { Tx } from "@/lib/db";
import { adminDb, appDb, asUser as asUserWithRole } from "./helpers/db";

const app = appDb();
const admin = adminDb();
const suffix = crypto.randomUUID().slice(0, 8);
let orgId: string;
let userId: string;

async function asUser<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return asUserWithRole(app, userId, orgId, (tx) => fn(tx as unknown as Tx));
}

beforeAll(async () => {
  const [org] = await admin`
    insert into organizations (name, slug)
    values (${`Panel Filter Test ${suffix}`}, ${`panel-filter-test-${suffix}`})
    returning id`;
  orgId = org.id as string;
  const [user] = await admin`
    insert into users (email, full_name)
    values (${`panel-filter-${suffix}@example.invalid`}, 'Panel Filter Tester')
    returning id`;
  userId = user.id as string;
  await admin`insert into memberships (org_id, user_id, role) values (${orgId}, ${userId}, 'administrator')`;

  const [education] = await admin`
    insert into custom_fields (org_id, key, label, field_type, options)
    values (${orgId}, 'uddannelse', 'Uddannelse', 'select', ${admin.json(["University", "Trade"])})
    returning id`;
  const [vip] = await admin`insert into tags (org_id, name) values (${orgId}, 'vip') returning id`;
  const [newTag] = await admin`insert into tags (org_id, name) values (${orgId}, 'new') returning id`;
  const year = new Date().getFullYear();
  const panelists = await admin`
    insert into panelists ${admin([
      { org_id: orgId, external_id: `pf-a-${suffix}`, first_name: "Alpha", last_name: "One", birth_year: year - 30 },
      { org_id: orgId, external_id: `pf-b-${suffix}`, first_name: "Beta", last_name: "Two", birth_year: year - 50 },
      { org_id: orgId, external_id: `pf-c-${suffix}`, first_name: "Gamma", last_name: "Three", birth_year: year - 25 },
    ])}
    returning id, external_id`;
  const byExternalId = new Map(panelists.map((row) => [String(row.external_id), String(row.id)]));
  const alpha = byExternalId.get(`pf-a-${suffix}`)!;
  const beta = byExternalId.get(`pf-b-${suffix}`)!;
  const gamma = byExternalId.get(`pf-c-${suffix}`)!;

  await admin`
    insert into panelist_attributes (panelist_id, field_id, org_id, value)
    values
      (${alpha}, ${education.id}, ${orgId}, ${admin.json("University")}),
      (${beta}, ${education.id}, ${orgId}, ${admin.json("Trade")}),
      (${gamma}, ${education.id}, ${orgId}, ${admin.json("University")})`;
  await admin`
    insert into panelist_tags (panelist_id, tag_id, org_id)
    values
      (${alpha}, ${vip.id}, ${orgId}),
      (${alpha}, ${newTag.id}, ${orgId}),
      (${beta}, ${vip.id}, ${orgId})`;
}, 30_000);

afterAll(async () => {
  if (orgId) await admin`delete from organizations where id = ${orgId}`;
  if (userId) await admin`delete from users where id = ${userId}`;
  await app.end();
  await admin.end();
});

describe("panel filter parsing", () => {
  it("normalizes a valid age range and rejects unsafe ranges", () => {
    expect(parsePanelFilters(JSON.stringify([{ field: "age", operator: "any", values: ["18", "65"] }]))).toEqual([
      { field: "age", operator: "all", values: ["18", "65"] },
    ]);
    expect(parsePanelFilters(JSON.stringify([{ field: "age", operator: "all", values: ["70", "20"] }]))).toEqual([]);
    expect(parsePanelFilters(JSON.stringify([{ field: "custom", operator: "any", values: ["x"] }]))).toEqual([]);
  });
});

describe("panel filter SQL", () => {
  it("combines categories with AND", async () => {
    const result = await asUser((tx) => listPanelists(tx, {
      filters: [
        { field: "uddannelse", operator: "any", values: ["University"] },
        { field: "tag", operator: "any", values: ["vip"] },
      ],
    }));
    expect(result.total).toBe(1);
    expect(result.rows[0].first_name).toBe("Alpha");
  });

  it("supports Any, All, and None within a category", async () => {
    const any = await asUser((tx) => listPanelists(tx, { filters: [{ field: "tag", operator: "any", values: ["vip", "new"] }] }));
    const all = await asUser((tx) => listPanelists(tx, { filters: [{ field: "tag", operator: "all", values: ["vip", "new"] }] }));
    const none = await asUser((tx) => listPanelists(tx, { filters: [{ field: "tag", operator: "none", values: ["vip"] }] }));
    expect(any.total).toBe(2);
    expect(all.total).toBe(1);
    expect(all.rows[0].first_name).toBe("Alpha");
    expect(none.total).toBe(1);
    expect(none.rows[0].first_name).toBe("Gamma");
  });

  it("filters approximate age from birth year", async () => {
    const result = await asUser((tx) => listPanelists(tx, { filters: [{ field: "age", operator: "all", values: ["20", "35"] }] }));
    expect(result.total).toBe(2);
    expect(result.rows.map((row) => row.first_name).sort()).toEqual(["Alpha", "Gamma"]);
  });

  it("pages rows while retaining the full filtered count", async () => {
    const result = await asUser((tx) => listPanelists(tx, { limit: 1, offset: 1 }));
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(3);
  });
});