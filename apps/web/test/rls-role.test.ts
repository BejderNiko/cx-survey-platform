/**
 * RLS execution-role assertions.
 *
 * PGlite's socket server executes every connection as the `postgres`
 * superuser no matter which username the connection URL carries, so a URL of
 * `postgres://cx_app@...` does NOT by itself subject queries to RLS there.
 * These tests prove that:
 *
 *  1. a user transaction (via the shared `asUser` helper — the same mechanism
 *     lib/db.ts withUser uses) really runs as `cx_app` on the active engine;
 *  2. the admin connection remains privileged (`postgres`);
 *  3. in PGlite mode a raw transaction WITHOUT the explicit
 *     `SET LOCAL ROLE cx_app` remains `postgres` — documenting exactly why
 *     the mitigation and the helper guard exist.
 *
 * Requires: a migrated + seeded local database (pnpm db:init && pnpm seed,
 * or scripts/dev-db.sh init for the native engine).
 */
import { afterAll, describe, expect, it } from "vitest";
import { adminDb, appDb, asUser, isPgliteMode } from "./helpers/db";

const app = appDb();
const admin = adminDb();

afterAll(async () => {
  await app.end();
  await admin.end();
});

describe("RLS execution roles", () => {
  it("user transactions execute as cx_app (never a privileged role)", async () => {
    const currentUser = await asUser(app, null, null, async (tx) => {
      const [row] = await tx`select current_user`;
      return row.current_user as string;
    });
    expect(currentUser).toBe("cx_app");
  });

  it("the admin connection remains privileged (postgres)", async () => {
    const [row] = await admin`select current_user`;
    expect(row.current_user).toBe("postgres");
  });

  it("documents the PGlite constraint: without SET LOCAL ROLE the app connection is postgres", async () => {
    const [row] = await app.begin(async (tx) => tx`select current_user`);
    if (isPgliteMode()) {
      // The very reason the explicit role switch is mandatory locally.
      expect(row.current_user).toBe("postgres");
    } else {
      // Native PostgreSQL: the login role itself is the RLS subject.
      expect(row.current_user).toBe("cx_app");
    }
  });
});
