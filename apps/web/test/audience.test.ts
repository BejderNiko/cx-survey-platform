/**
 * F5-003: audience building must cover the FULL matching population.
 *
 * Creates a throwaway organization with 520 active, consented panelists (more
 * than the previous silent 500-row truncation) and proves:
 *  - listPanelistIds returns the full population;
 *  - resolveAudience feeds the full population into sampling (unbiased input);
 *  - sampling stays deterministic for a recorded seed;
 *  - the governance cap is enforced explicitly AFTER full eligibility;
 *  - the hard safety limit raises an explicit error, never truncates.
 *
 * Requires: scripts/dev-db.sh init && pnpm seed (same as tenant-isolation).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomSample } from "@ok/domain";
import { listPanelistIds, resolveAudience } from "@/lib/data/panel";
import type { Tx } from "@/lib/db";
import { adminDb, appDb, asUser as asUserWithRole } from "./helpers/db";

const app = appDb();
const admin = adminDb();

const PANELISTS = 520;
let orgId: string;
let userId: string;

// Role-enforcing helper: asserts the transaction runs as `cx_app` (with the
// explicit local `SET LOCAL ROLE cx_app` in PGlite mode) so these checks
// never pass under a privileged role.
async function asUser<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return asUserWithRole(app, userId, orgId, (tx) => fn(tx as unknown as Tx));
}

beforeAll(async () => {
  const [org] = await admin`
    insert into organizations (name, slug, settings)
    values ('Audience Test Org', 'audience-test-org', ${admin.json({ governance: { maxInviteSize: 600, contactCooldownDays: 14, monthlyContactCap: 2 } })})
    returning id`;
  orgId = org.id as string;
  const [user] = await admin`
    insert into users (email, full_name) values ('audience-test@example.invalid', 'Audience Tester')
    returning id`;
  userId = user.id as string;
  await admin`insert into memberships (org_id, user_id, role) values (${orgId}, ${userId}, 'administrator')`;

  const rows = Array.from({ length: PANELISTS }, (_, i) => ({
    org_id: orgId,
    external_id: `aud-${String(i).padStart(4, "0")}`,
    first_name: `Test${i}`,
    last_name: `Panelist${String(i).padStart(4, "0")}`,
    email: `aud-${i}@example.invalid`,
    lifecycle: "active",
  }));
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const inserted = await admin`insert into panelists ${admin(chunk)} returning id`;
    await admin`insert into consent_records ${admin(
      inserted.map((p) => ({ org_id: orgId, panelist_id: p.id, purpose: "survey_contact", status: "granted", granted_at: new Date() })),
    )}`;
  }
}, 60_000);

afterAll(async () => {
  await admin`delete from organizations where id = ${orgId}`;
  await admin`delete from users where id = ${userId}`;
  await app.end();
  await admin.end();
});

describe("full-population audience building (F5-003)", () => {
  it("listPanelistIds returns every matching panelist, beyond 500", async () => {
    const ids = await asUser((tx) => listPanelistIds(tx, { lifecycle: "active" }));
    expect(ids).toHaveLength(PANELISTS);
    expect(new Set(ids).size).toBe(PANELISTS);
  });

  it("resolveAudience counts the full candidate and eligible population", async () => {
    const res = await asUser((tx) =>
      resolveAudience(tx, { orgId, segment: null, method: "random", sampleSize: 50, seed: 42 }),
    );
    expect(res.candidates).toHaveLength(PANELISTS);
    expect(res.eligible).toHaveLength(PANELISTS);
    expect(res.selected).toHaveLength(50);
    expect(res.seed).toBe(42);
  });

  it("random sampling is deterministic for a seed and drawn from the full population", async () => {
    // Two independent resolutions with the same seed must agree. Run them
    // sequentially: the assertion is identical, and PGlite's single-user
    // socket cannot interleave two open transactions.
    const a = await asUser((tx) => resolveAudience(tx, { orgId, segment: null, method: "random", sampleSize: 50, seed: 7 }));
    const b = await asUser((tx) => resolveAudience(tx, { orgId, segment: null, method: "random", sampleSize: 50, seed: 7 }));
    expect(a.selected).toEqual(b.selected);
    // The selection equals a direct seeded sample over the SAME full
    // eligible list — proving the sampler input was never truncated.
    expect(a.selected).toEqual(randomSample(a.eligible, 50, 7).selected);
  });

  it("'all' invitations include every eligible panelist when under the cap", async () => {
    const res = await asUser((tx) => resolveAudience(tx, { orgId, segment: null, method: "all" }));
    expect(res.selected).toHaveLength(PANELISTS); // 520 ≤ org cap of 600 — nobody silently omitted
  });

  it("the governance cap is an explicit error after full eligibility, not a truncation", async () => {
    await admin`update organizations set settings = ${admin.json({ governance: { maxInviteSize: 100 } })} where id = ${orgId}`;
    try {
      await expect(
        asUser((tx) => resolveAudience(tx, { orgId, segment: null, method: "all" })),
      ).rejects.toThrow(/exceeds the governance cap of 100/);
    } finally {
      await admin`update organizations set settings = ${admin.json({ governance: { maxInviteSize: 600 } })} where id = ${orgId}`;
    }
  });

  it("the hard safety limit raises an explicit error instead of truncating", async () => {
    await expect(
      asUser((tx) => listPanelistIds(tx, { lifecycle: "active" }, { max: 100 })),
    ).rejects.toThrow(/exceeds the supported maximum of 100/);
  });
});
