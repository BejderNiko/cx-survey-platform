/**
 * Shared helpers for database-backed tests. They work against both local
 * engines:
 *
 * - native PostgreSQL (scripts/dev-db.sh, database `cx_platform`) — the
 *   authoritative CI gate, where the `cx_app` login role is the RLS subject;
 * - PGlite (scripts/dev-db.mjs, database `postgres`) — where every socket
 *   connection executes as `postgres` regardless of the URL username, so user
 *   transactions must explicitly `SET LOCAL ROLE cx_app`.
 *
 * `asUser` therefore both applies the PGlite mitigation AND asserts that the
 * transaction really runs as `cx_app` on every engine. A test that would
 * otherwise "pass" while unintentionally executing as a superuser (RLS
 * bypassed) fails loudly instead.
 */
import postgres from "postgres";
import { env } from "@/lib/env";

export function isPgliteMode(): boolean {
  return env.localDatabaseEngine === "pglite";
}

export function appDb(): postgres.Sql {
  return postgres(process.env.DATABASE_URL ?? env.databaseUrl, { max: 2, prepare: false, onnotice: () => {} });
}

export function adminDb(): postgres.Sql {
  return postgres(process.env.DATABASE_ADMIN_URL ?? env.databaseAdminUrl, { max: 2, prepare: false, onnotice: () => {} });
}

/**
 * Runs `fn` in an application transaction with RLS scoped to `userId`
 * (null = anonymous / no claims), mirroring lib/db.ts withUser. Throws if the
 * transaction is not executing as `cx_app` — RLS results proven under a
 * privileged role would be meaningless.
 */
export async function asUser<T>(
  app: postgres.Sql,
  userId: string | null,
  orgId: string | null,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return app.begin(async (tx) => {
    if (isPgliteMode()) {
      await tx`set local role cx_app`; // static SQL, never parameterized
    }
    const [{ current_user: currentUser }] = await tx`select current_user`;
    if (currentUser !== "cx_app") {
      throw new Error(
        `RLS test guard: expected the user transaction to run as 'cx_app' but current_user is '${currentUser}'. ` +
          `Row-level security would not apply — refusing to count this as a valid check.`,
      );
    }
    const claims = userId && orgId ? JSON.stringify({ sub: userId, org_id: orgId, role: "authenticated" }) : "{}";
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    return fn(tx);
  }) as Promise<T>;
}
