/**
 * Tenant isolation tests against the real local database (RLS enforced by
 * PostgreSQL for the `cx_app` role, exactly as the app connects).
 *
 * Requires: scripts/dev-db.sh init && pnpm seed
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const app = postgres(process.env.DATABASE_URL ?? "postgres://cx_app@127.0.0.1:54329/cx_platform", { max: 2, onnotice: () => {} });
const admin = postgres(process.env.DATABASE_ADMIN_URL ?? "postgres://postgres@127.0.0.1:54329/cx_platform", { max: 2, onnotice: () => {} });

let orgA: string, orgB: string, userA: string, userB: string;

async function asUser<T>(userId: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    const claims = userId ? JSON.stringify({ sub: userId, role: "authenticated" }) : "{}";
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

beforeAll(async () => {
  const [a] = await admin`select id from organizations where slug = 'ok-cx'`;
  const [b] = await admin`select id from organizations where slug = 'nordvind-demo'`;
  const [ua] = await admin`select id from users where email = 'owner@example.invalid'`;
  const [ub] = await admin`select id from users where email = 'other@example.invalid'`;
  orgA = a.id; orgB = b.id; userA = ua.id; userB = ub.id;
});

afterAll(async () => {
  await app.end();
  await admin.end();
});

describe("row-level security tenant isolation", () => {
  it("org A member sees only org A organizations", async () => {
    const orgs = await asUser(userA, (tx) => tx`select id from organizations`);
    expect(orgs.map((o) => o.id)).toEqual([orgA]);
  });

  it("org B member cannot see org A panelists", async () => {
    const own = await asUser(userB, (tx) => tx`select count(*)::int as n from panelists`);
    expect(own[0].n).toBe(3); // only Nordvind's seeded panelists
    const crossOrg = await asUser(userB, (tx) => tx`select count(*)::int as n from panelists where org_id = ${orgA}`);
    expect(crossOrg[0].n).toBe(0);
  });

  it("org B member cannot see org A studies, responses, or follow-up cases", async () => {
    const studies = await asUser(userB, (tx) => tx`select title from studies`);
    expect(studies.map((s) => s.title)).toEqual(["Nordvind medlemsmåling"]);
    const responses = await asUser(userB, (tx) => tx`select count(*)::int as n from responses`);
    expect(responses[0].n).toBe(0);
    const cases = await asUser(userB, (tx) => tx`select count(*)::int as n from followup_cases`);
    expect(cases[0].n).toBe(0);
  });

  it("org A member cannot read org B rows even by explicit id filter", async () => {
    const rows = await asUser(userA, (tx) => tx`select id from studies where org_id = ${orgB}`);
    expect(rows).toHaveLength(0);
  });

  it("writes into another tenant are rejected by RLS with-check", async () => {
    await expect(
      asUser(userB, (tx) => tx`
        insert into tags (org_id, name) values (${orgA}, 'smuggled-tag')`),
    ).rejects.toThrow(/row-level security/);
    const check = await admin`select count(*)::int as n from tags where name = 'smuggled-tag'`;
    expect(check[0].n).toBe(0);
  });

  it("updates across tenants affect zero rows", async () => {
    const updated = await asUser(userB, (tx) => tx`
      update studies set title = 'hacked' where org_id = ${orgA} returning id`);
    expect(updated).toHaveLength(0);
    const check = await admin`select count(*)::int as n from studies where title = 'hacked'`;
    expect(check[0].n).toBe(0);
  });

  it("a connection without JWT claims sees nothing", async () => {
    const orgs = await asUser(null, (tx) => tx`select count(*)::int as n from organizations`);
    expect(orgs[0].n).toBe(0);
    const panelists = await asUser(null, (tx) => tx`select count(*)::int as n from panelists`);
    expect(panelists[0].n).toBe(0);
  });

  it("deactivated memberships lose access", async () => {
    await admin`update memberships set deactivated_at = now() where user_id = ${userB} and org_id = ${orgB}`;
    try {
      const orgs = await asUser(userB, (tx) => tx`select count(*)::int as n from organizations`);
      expect(orgs[0].n).toBe(0);
    } finally {
      await admin`update memberships set deactivated_at = null where user_id = ${userB} and org_id = ${orgB}`;
    }
  });
});
