import postgres, { type Sql, type TransactionSql } from "postgres";
import { env } from "./env";

/**
 * Two connection pools:
 *
 * - `appSql` connects as the RLS-subject role `cx_app`. Every query MUST run
 *   inside `withUser(...)`, which sets the Supabase-compatible JWT claims for
 *   the transaction so row-level security scopes rows to the user's orgs.
 *
 * - `adminSql` (superuser locally; service key on Supabase later) is used ONLY
 *   by the anonymous respondent flow (token-validated, narrowly scoped
 *   functions in lib/data/respondent.ts), the seed, and tests. Never use it
 *   in authenticated application commands.
 */

declare global {
  var __cx_app_sql: Sql | undefined;
  var __cx_admin_sql: Sql | undefined;
}

/**
 * Pools are constructed lazily on first use so that importing this module
 * (e.g. during `next build` page-data collection) never reads connection
 * environment variables. Hosted misconfiguration therefore fails on the
 * first query with a named-variable error from lib/env.ts (F5-001), not at
 * import time and never by silently dialing localhost.
 */
function lazySql(make: () => Sql): Sql {
  let real: Sql | undefined;
  const resolve = (): Sql => (real ??= make());
  return new Proxy(function () {} as unknown as Sql, {
    get(_target, prop) {
      const instance = resolve();
      const value = (instance as unknown as Record<PropertyKey, unknown>)[prop];
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(instance) : value;
    },
    apply(_target, _thisArg, args) {
      return Reflect.apply(resolve() as unknown as (...a: unknown[]) => unknown, undefined, args);
    },
  });
}

export const appSql: Sql = lazySql(
  () =>
    globalThis.__cx_app_sql ??
    (globalThis.__cx_app_sql = postgres(env.databaseUrl, {
      max: 10,
      // Supavisor transaction mode (the documented Vercel path) does not
      // support session-bound prepared statements.
      prepare: false,
      onnotice: () => {},
    })),
);

export const adminSql: Sql = lazySql(
  () =>
    globalThis.__cx_admin_sql ??
    (globalThis.__cx_admin_sql = postgres(env.databaseAdminUrl, {
      max: 5,
      // Keep the privileged pool compatible with transaction-mode pooling too.
      prepare: false,
      onnotice: () => {},
    })),
);

export type Tx = TransactionSql;

/** Run `fn` in a transaction with RLS scoped to one active organization. */
export async function withUser<T>(userId: string, orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return appSql.begin(async (tx) => {
    if (env.localDatabaseEngine === "pglite") {
      // PGlite-only mitigation: the PGlite socket server executes every
      // connection as the `postgres` superuser regardless of the username in
      // DATABASE_URL, so the URL role alone does not subject queries to RLS.
      // Switching to the static, non-parameterized role `cx_app` inside the
      // transaction (reverted automatically at COMMIT/ROLLBACK) restores the
      // exact RLS subject the native and hosted paths use. Hosted/Supabase
      // and native local PostgreSQL never execute this branch — there the
      // login role itself is the RLS subject.
      await tx`set local role cx_app`;
    }
    const claims = JSON.stringify({ sub: userId, org_id: orgId, role: "authenticated" });
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    return fn(tx);
  }) as Promise<T>;
}
