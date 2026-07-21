/**
 * Environment access with local-development defaults and hosted fail-fast.
 *
 * Design rules (F5-001):
 * - Importing this module NEVER throws, so `next build` succeeds without
 *   runtime-only variables; validation happens on first access at runtime.
 * - Local development defaults to the PGlite database managed by
 *   scripts/dev-db.mjs (engine "pglite"); LOCAL_DATABASE_ENGINE=native keeps
 *   the scripts/dev-db.sh PostgreSQL defaults (used by Linux CI).
 * - PGlite is strictly a local development engine: LOCAL_DATABASE_ENGINE=pglite
 *   is rejected on Vercel Preview/Production and under NODE_ENV=production,
 *   and the engine never defaults to pglite in those environments.
 * - On Vercel Preview/Production every runtime variable below is required —
 *   a missing value fails the request loudly instead of silently falling
 *   back to localhost. Hosted database URLs keep coming from DATABASE_URL /
 *   DATABASE_ADMIN_URL; hosted mode is never inferred from a localhost
 *   fallback.
 * - Database/analytics targets must not be loopback addresses on Vercel.
 * - Error messages name the variable, never its value.
 */

/**
 * Local database engines. "pglite" = PostgreSQL WASM via scripts/dev-db.mjs
 * (database name `postgres`); "native" = real PostgreSQL via
 * scripts/dev-db.sh (database name `cx_platform`, authoritative in CI).
 */
export type LocalDatabaseEngine = "pglite" | "native";

const LOCAL_DEFAULTS_BY_ENGINE = {
  pglite: {
    DATABASE_URL: "postgres://cx_app@127.0.0.1:54329/postgres",
    DATABASE_ADMIN_URL: "postgres://postgres@127.0.0.1:54329/postgres",
  },
  native: {
    DATABASE_URL: "postgres://cx_app@127.0.0.1:54329/cx_platform",
    DATABASE_ADMIN_URL: "postgres://postgres@127.0.0.1:54329/cx_platform",
  },
} as const;

const LOCAL_DEFAULTS = {
  SESSION_SECRET: "local-dev-session-secret-change-me",
  APP_BASE_URL: "http://localhost:3000",
  ANALYTICS_URL: "http://127.0.0.1:8000",
} as const;

function onVercel(): boolean {
  return Boolean(process.env.VERCEL);
}

/** Vercel Preview and Production deployments must be fully configured. */
function hostedStrict(): boolean {
  return onVercel() && ["production", "preview"].includes(process.env.VERCEL_ENV ?? "");
}

function productionRuntime(): boolean {
  return hostedStrict() || process.env.NODE_ENV === "production";
}

/**
 * Resolves the local database engine, or null when running hosted (where the
 * concept does not apply and DATABASE_URL/DATABASE_ADMIN_URL are mandatory).
 *
 * - Explicit LOCAL_DATABASE_ENGINE always wins locally and is validated.
 * - "pglite" is rejected in any production runtime (Vercel Preview/Production
 *   or NODE_ENV=production) — PGlite is a local development database only.
 * - Unset: defaults to "pglite" for local development, "native" under a
 *   production NODE_ENV outside Vercel (self-hosted smoke runs), and null on
 *   hosted Vercel.
 */
function localDatabaseEngine(): LocalDatabaseEngine | null {
  const raw = process.env.LOCAL_DATABASE_ENGINE;
  if (raw !== undefined && raw !== "") {
    if (raw === "pglite") {
      if (productionRuntime()) {
        throw new Error(
          "LOCAL_DATABASE_ENGINE=pglite is only supported in local development. " +
            "Remove the variable in this environment; hosted deployments must use " +
            "the managed database configured via DATABASE_URL and DATABASE_ADMIN_URL.",
        );
      }
      return "pglite";
    }
    if (raw === "native") return hostedStrict() ? null : "native";
    throw new Error('LOCAL_DATABASE_ENGINE must be "pglite" or "native" when set.');
  }
  if (hostedStrict()) return null;
  if (process.env.NODE_ENV === "production") return "native";
  return "pglite";
}

function isLoopbackTarget(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false; // unparseable → let the driver report it; nothing to leak here
  }
  return (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost") ||
    hostname.startsWith("127.")
  );
}

function requiredInHosted(name: keyof typeof LOCAL_DEFAULTS): string {
  const value = process.env[name];
  if (value) return value;
  if (hostedStrict()) {
    throw new Error(
      `${name} is not configured for this Vercel environment. ` +
        `Set it in the project's environment variables; there is no hosted fallback.`,
    );
  }
  return LOCAL_DEFAULTS[name];
}

function databaseTarget(name: "DATABASE_URL" | "DATABASE_ADMIN_URL"): string {
  const value = process.env[name];
  if (value) {
    if (hostedStrict() && isLoopbackTarget(value)) {
      throw new Error(
        `${name} points at a loopback address, which cannot be reached from Vercel. ` +
          `Configure the hosted service URL for this environment.`,
      );
    }
    return value;
  }
  if (hostedStrict()) {
    throw new Error(
      `${name} is not configured for this Vercel environment. ` +
        `Set it in the project's environment variables; there is no hosted fallback.`,
    );
  }
  // Reaching this point validates pglite-mode restrictions as a side effect.
  const engine = localDatabaseEngine() ?? "native";
  return LOCAL_DEFAULTS_BY_ENGINE[engine][name];
}

function connectionTarget(name: "ANALYTICS_URL"): string {
  const value = requiredInHosted(name);
  // Deployed Vercel environments are always "preview" or "production";
  // VERCEL_ENV=development only occurs under local `vercel dev`, where
  // loopback targets are legitimate.
  if (hostedStrict() && isLoopbackTarget(value)) {
    throw new Error(
      `${name} points at a loopback address, which cannot be reached from Vercel. ` +
        `Configure the hosted service URL for this environment.`,
    );
  }
  return value;
}

export const env = {
  /**
   * "pglite" | "native" for local development, null when hosted. Reading this
   * validates LOCAL_DATABASE_ENGINE (pglite is rejected in production
   * runtimes). lib/db.ts uses it to apply the local-only
   * `SET LOCAL ROLE cx_app` RLS mitigation in PGlite mode.
   */
  get localDatabaseEngine(): LocalDatabaseEngine | null {
    return localDatabaseEngine();
  },
  get databaseUrl(): string {
    return databaseTarget("DATABASE_URL");
  },
  get databaseAdminUrl(): string {
    return databaseTarget("DATABASE_ADMIN_URL");
  },
  get sessionSecret(): string {
    const value = process.env.SESSION_SECRET;
    if (value) return value;
    if (hostedStrict() || process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set in production environments.");
    }
    return LOCAL_DEFAULTS.SESSION_SECRET;
  },
  get appBaseUrl(): string {
    return requiredInHosted("APP_BASE_URL");
  },
  get analyticsUrl(): string {
    return connectionTarget("ANALYTICS_URL");
  },
  get analyticsApiSecret(): string | undefined {
    const value = process.env.ANALYTICS_API_SECRET;
    if (!value && hostedStrict()) {
      throw new Error(
        "ANALYTICS_API_SECRET is not configured for this Vercel environment. " +
          "The analytics service requires bearer authentication outside local development.",
      );
    }
    return value;
  },
};
