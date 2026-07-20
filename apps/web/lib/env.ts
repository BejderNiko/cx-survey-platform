/** Environment with local-development defaults matching scripts/dev-db.sh. */
export const env = {
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://cx_app@127.0.0.1:54329/cx_platform",
  databaseAdminUrl:
    process.env.DATABASE_ADMIN_URL ?? "postgres://postgres@127.0.0.1:54329/cx_platform",
  sessionSecret: process.env.SESSION_SECRET ?? "local-dev-session-secret-change-me",
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  analyticsUrl: process.env.ANALYTICS_URL ?? "http://127.0.0.1:8000",
  analyticsApiSecret: process.env.ANALYTICS_API_SECRET,
};

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in production");
}
