import { defineConfig } from "vitest/config";
import path from "node:path";

// PGlite serializes all queries through one instance and cannot interleave
// concurrent transactions from parallel test files, so database-backed tests
// run one file at a time in PGlite mode. Native PostgreSQL (CI) keeps full
// parallelism.
const pgliteMode = process.env.LOCAL_DATABASE_ENGINE === "pglite";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 20000,
    fileParallelism: !pgliteMode,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `server-only` is a Next.js build-time virtual module; stub it under vitest.
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
});
