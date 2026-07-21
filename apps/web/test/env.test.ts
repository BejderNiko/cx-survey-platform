/**
 * F5-001: environment validation. Local development keeps safe defaults;
 * Vercel Preview/Production must fail fast on missing configuration and must
 * never accept loopback database/analytics targets. Importing the module must
 * never throw (build safety) — only access does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MANAGED = [
  "LOCAL_DATABASE_ENGINE",
  "DATABASE_URL",
  "DATABASE_ADMIN_URL",
  "SESSION_SECRET",
  "APP_BASE_URL",
  "ANALYTICS_URL",
  "ANALYTICS_API_SECRET",
  "VERCEL",
  "VERCEL_ENV",
] as const;

const saved: Partial<Record<(typeof MANAGED)[number], string | undefined>> = {};

beforeEach(() => {
  for (const key of MANAGED) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of MANAGED) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllEnvs();
});

async function loadEnv() {
  vi.resetModules();
  return (await import("@/lib/env")).env;
}

describe("local development defaults", () => {
  it("defaults to the PGlite engine and its dev-db.mjs URLs when nothing is set", async () => {
    const env = await loadEnv();
    expect(env.localDatabaseEngine).toBe("pglite");
    expect(env.databaseUrl).toBe("postgres://cx_app@127.0.0.1:54329/postgres");
    expect(env.databaseAdminUrl).toBe("postgres://postgres@127.0.0.1:54329/postgres");
    expect(env.appBaseUrl).toBe("http://localhost:3000");
    expect(env.analyticsUrl).toBe("http://127.0.0.1:8000");
    expect(env.sessionSecret).toBe("local-dev-session-secret-change-me");
    expect(env.analyticsApiSecret).toBeUndefined();
  });

  it("LOCAL_DATABASE_ENGINE=native keeps the dev-db.sh cx_platform defaults", async () => {
    process.env.LOCAL_DATABASE_ENGINE = "native";
    const env = await loadEnv();
    expect(env.localDatabaseEngine).toBe("native");
    expect(env.databaseUrl).toBe("postgres://cx_app@127.0.0.1:54329/cx_platform");
    expect(env.databaseAdminUrl).toBe("postgres://postgres@127.0.0.1:54329/cx_platform");
  });

  it("prefers explicit values over defaults", async () => {
    process.env.DATABASE_URL = "postgres://cx_app@127.0.0.1:54329/other_db";
    process.env.ANALYTICS_API_SECRET = "local-secret";
    const env = await loadEnv();
    expect(env.databaseUrl).toBe("postgres://cx_app@127.0.0.1:54329/other_db");
    expect(env.analyticsApiSecret).toBe("local-secret");
  });
});

describe("LOCAL_DATABASE_ENGINE=pglite is local-development only", () => {
  it("is accepted in local development", async () => {
    process.env.LOCAL_DATABASE_ENGINE = "pglite";
    const env = await loadEnv();
    expect(env.localDatabaseEngine).toBe("pglite");
    expect(env.databaseUrl).toBe("postgres://cx_app@127.0.0.1:54329/postgres");
  });

  for (const vercelEnv of ["preview", "production"] as const) {
    it(`is rejected on Vercel ${vercelEnv}`, async () => {
      process.env.VERCEL = "1";
      process.env.VERCEL_ENV = vercelEnv;
      process.env.LOCAL_DATABASE_ENGINE = "pglite";
      const env = await loadEnv();
      expect(() => env.localDatabaseEngine).toThrow(/LOCAL_DATABASE_ENGINE=pglite is only supported in local development/);
    });
  }

  it("is rejected under NODE_ENV=production outside Vercel", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.LOCAL_DATABASE_ENGINE = "pglite";
    const env = await loadEnv();
    expect(() => env.localDatabaseEngine).toThrow(/only supported in local development/);
  });

  it("never defaults to pglite when NODE_ENV=production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const env = await loadEnv();
    expect(env.localDatabaseEngine).toBe("native");
    expect(env.databaseUrl).toContain("cx_platform");
  });

  it("rejects unknown engine values without leaking them", async () => {
    process.env.LOCAL_DATABASE_ENGINE = "sqlite-secret-value";
    const env = await loadEnv();
    let message = "";
    try {
      void env.localDatabaseEngine;
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/LOCAL_DATABASE_ENGINE must be/);
    expect(message).not.toContain("sqlite-secret-value");
  });

  it("pglite rejection errors name the variable but never database values", async () => {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "production";
    process.env.LOCAL_DATABASE_ENGINE = "pglite";
    process.env.DATABASE_URL = "postgres://user:supersecretpw@db.example.supabase.co:6543/postgres";
    const env = await loadEnv();
    try {
      void env.localDatabaseEngine;
      throw new Error("expected rejection");
    } catch (error) {
      expect((error as Error).message).toContain("LOCAL_DATABASE_ENGINE");
      expect((error as Error).message).not.toContain("supersecretpw");
    }
  });
});

describe("Vercel Preview/Production require full configuration", () => {
  for (const vercelEnv of ["preview", "production"] as const) {
    it(`rejects missing values in ${vercelEnv}`, async () => {
      process.env.VERCEL = "1";
      process.env.VERCEL_ENV = vercelEnv;
      const env = await loadEnv();
      expect(() => env.databaseUrl).toThrow(/DATABASE_URL is not configured/);
      expect(() => env.databaseAdminUrl).toThrow(/DATABASE_ADMIN_URL is not configured/);
      expect(() => env.analyticsUrl).toThrow(/ANALYTICS_URL is not configured/);
      expect(() => env.appBaseUrl).toThrow(/APP_BASE_URL is not configured/);
      expect(() => env.sessionSecret).toThrow(/SESSION_SECRET/);
      expect(() => env.analyticsApiSecret).toThrow(/ANALYTICS_API_SECRET/);
    });
  }

  it("does not throw at import time even when everything is missing", async () => {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "production";
    await expect(loadEnv()).resolves.toBeDefined();
  });

  it("accepts a complete hosted configuration", async () => {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "production";
    process.env.DATABASE_URL = "postgres://app@db.example.supabase.co:6543/postgres";
    process.env.DATABASE_ADMIN_URL = "postgres://postgres@db.example.supabase.co:5432/postgres";
    process.env.ANALYTICS_URL = "https://analytics.example.vercel.app";
    process.env.APP_BASE_URL = "https://cx.example.ok.dk";
    process.env.SESSION_SECRET = "long-random-secret";
    process.env.ANALYTICS_API_SECRET = "bearer-secret";
    const env = await loadEnv();
    expect(env.databaseUrl).toContain("supabase.co");
    expect(env.analyticsApiSecret).toBe("bearer-secret");
  });
});

describe("loopback targets are rejected on deployed Vercel", () => {
  const loopbacks = [
    "postgres://cx_app@127.0.0.1:54329/cx_platform",
    "postgres://cx_app@localhost:5432/db",
    "postgres://cx_app@[::1]:5432/db",
    "postgres://cx_app@db.localhost:5432/db",
  ];

  for (const url of loopbacks) {
    it(`rejects DATABASE_URL=${new URL(url).hostname}`, async () => {
      process.env.VERCEL = "1";
      process.env.VERCEL_ENV = "preview";
      process.env.DATABASE_URL = url;
      const env = await loadEnv();
      expect(() => env.databaseUrl).toThrow(/loopback address/);
      // The error must name the variable but never leak the value.
      try {
        void env.databaseUrl;
      } catch (error) {
        expect((error as Error).message).toContain("DATABASE_URL");
        expect((error as Error).message).not.toContain("cx_platform");
      }
    });
  }

  it("rejects a loopback ANALYTICS_URL in production", async () => {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "production";
    process.env.ANALYTICS_URL = "http://127.0.0.1:8000";
    const env = await loadEnv();
    expect(() => env.analyticsUrl).toThrow(/ANALYTICS_URL points at a loopback/);
  });

  it("allows loopback targets under `vercel dev` (VERCEL_ENV=development)", async () => {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "development";
    const env = await loadEnv();
    expect(env.databaseUrl).toContain("127.0.0.1");
  });
});

describe("non-Vercel production", () => {
  it("still requires SESSION_SECRET at access time", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const env = await loadEnv();
    expect(() => env.sessionSecret).toThrow(/SESSION_SECRET must be set/);
    // but keeps local database defaults usable for self-hosted smoke runs
    expect(env.databaseUrl).toContain("127.0.0.1");
  });
});

describe("lazy database pools (build safety)", () => {
  it("imports lib/db without constructing pools; first query surfaces the config error", async () => {
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "preview";
    const savedApp = globalThis.__cx_app_sql;
    const savedAdmin = globalThis.__cx_admin_sql;
    globalThis.__cx_app_sql = undefined;
    globalThis.__cx_admin_sql = undefined;
    try {
      vi.resetModules();
      const { appSql, adminSql } = await import("@/lib/db");
      expect(appSql).toBeDefined();
      expect(adminSql).toBeDefined();
      expect(() => appSql`select 1`).toThrow(/DATABASE_URL is not configured/);
      expect(() => adminSql`select 1`).toThrow(/DATABASE_ADMIN_URL is not configured/);
    } finally {
      globalThis.__cx_app_sql = savedApp;
      globalThis.__cx_admin_sql = savedAdmin;
    }
  });
});
