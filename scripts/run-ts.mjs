#!/usr/bin/env node
/**
 * Runs a project TypeScript entry file without native tooling:
 *
 *     node scripts/run-ts.mjs <entry.ts> [args...]
 *
 * Registers scripts/ts-loader-hooks.mjs (pure-JS transpilation via the
 * `typescript` package) and imports the entry. Used by `pnpm seed` so the
 * deterministic seed runs on Windows machines where esbuild-based runners
 * (tsx) are blocked by group policy. Node may print an ExperimentalWarning
 * for the customization-hooks API on some versions; it is informational.
 */
import { register } from "node:module";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const entry = process.argv[2];
if (!entry) {
  console.error("usage: node scripts/run-ts.mjs <entry.ts> [args...]");
  process.exit(1);
}

register(new URL("./ts-loader-hooks.mjs", import.meta.url));

// Shift argv so the entry script sees its own args in the usual positions.
process.argv = [process.argv[0], path.resolve(entry), ...process.argv.slice(3)];

await import(pathToFileURL(path.resolve(entry)).href);
