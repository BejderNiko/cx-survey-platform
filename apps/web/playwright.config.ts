import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

// Some environments pre-install Chromium outside Playwright's registry.
const chromiumPath = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    ...(existsSync(chromiumPath) ? { launchOptions: { executablePath: chromiumPath } } : {}),
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: "pnpm next dev --port 3000",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
