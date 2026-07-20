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

export const appSql: Sql =
  globalThis.__cx_app_sql ??
  (globalThis.__cx_app_sql = postgres(env.databaseUrl, {
    max: 10,
    onnotice: () => {},
  }));

export const adminSql: Sql =
  globalThis.__cx_admin_sql ??
  (globalThis.__cx_admin_sql = postgres(env.databaseAdminUrl, {
    max: 5,
    onnotice: () => {},
  }));

export type Tx = TransactionSql;

/** Run `fn` in a transaction with RLS scoped to `userId`. */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return appSql.begin(async (tx) => {
    const claims = JSON.stringify({ sub: userId, role: "authenticated" });
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    return fn(tx);
  }) as Promise<T>;
}
