import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getStudyShell, listStudies } from "@/lib/data/studies";
import { adminDb, appDb, asUser } from "./helpers/db";

const admin = adminDb();
const app = appDb();

let orgA: string;
let orgB: string;
let userA: string;
let userB: string;
let seededStudyId: string;
let historicalStudyId: string;

beforeAll(async () => {
  const [a] = await admin`select id from organizations where slug = 'ok-cx'`;
  const [b] = await admin`select id from organizations where slug = 'nordvind-demo'`;
  const [ua] = await admin`select id from users where email = 'owner@example.invalid'`;
  const [ub] = await admin`select id from users where email = 'other@example.invalid'`;
  const [seeded] = await admin`
    select id from studies where org_id = ${a.id} order by created_at limit 1`;
  const [workspaceB] = await admin`
    select id from workspaces where org_id = ${b.id} order by created_at limit 1`;
  orgA = a.id as string;
  orgB = b.id as string;
  userA = ua.id as string;
  userB = ub.id as string;
  seededStudyId = seeded.id as string;

  // Historical integrity fixture: FK-valid workspace, but wrong tenant. The
  // study remains org A data and must open without revealing org B workspace.
  const [historical] = await admin`
    insert into studies (
      org_id, workspace_id, title, status, owner_id, draft_definition
    )
    values (
      ${orgA}, ${workspaceB.id}, 'Historisk study med manglende relation',
      'draft', ${userA}, '{}'::jsonb
    )
    returning id`;
  historicalStudyId = historical.id as string;
});

afterAll(async () => {
  if (historicalStudyId) await admin`delete from studies where id = ${historicalStudyId}`;
  await app.end();
  await admin.end();
});

describe("study listing and detail access", () => {
  it("opens a previously seeded study", async () => {
    const study = await asUser(app, userA, orgA, (tx) => getStudyShell(tx, orgA, seededStudyId));
    expect(study).not.toBeNull();
    expect(study?.id).toBe(seededStudyId);
  });

  it("lists a historical study even when optional workspace relation is unavailable", async () => {
    const studies = await asUser(app, userA, orgA, (tx) => listStudies(tx, {
      orgId: orgA,
      query: "Historisk study",
    }));
    expect(studies).toHaveLength(1);
    expect(studies[0].workspace).toBe("Tidligere workspace");

    const detail = await asUser(app, userA, orgA, (tx) => getStudyShell(tx, orgA, historicalStudyId));
    expect(detail).toMatchObject({
      id: historicalStudyId,
      workspace: "Tidligere workspace",
      workspace_missing: true,
    });
  });

  it("returns null for a missing study", async () => {
    const missing = await asUser(app, userA, orgA, (tx) => getStudyShell(
      tx,
      orgA,
      "00000000-0000-0000-0000-000000000000",
    ));
    expect(missing).toBeNull();
  });

  it("does not reveal another tenant study by id", async () => {
    const hidden = await asUser(app, userB, orgB, (tx) => getStudyShell(tx, orgB, seededStudyId));
    expect(hidden).toBeNull();
  });
});
