#!/usr/bin/env node
/**
 * Local development database manager backed by PGlite (PostgreSQL compiled to
 * WebAssembly). Pure Node + WASM: no Docker, no WSL, no psql, no native
 * PostgreSQL binaries, no downloaded executables — it runs on locked-down
 * Windows machines where only Node and signed browsers are available.
 *
 * - Data, status and logs live ONLY under `<repo>/.dev/pglite/` (gitignored,
 *   disposable synthetic data). Reset removes exactly that directory.
 * - The socket server binds ONLY to 127.0.0.1 (default port 54329; override
 *   with CX_DB_PORT — the same variable scripts/dev-db.sh uses).
 * - `@electric-sql/pglite` provides the PostgreSQL WASM runtime;
 *   `@electric-sql/pglite-socket` speaks the PostgreSQL wire protocol so the
 *   existing `postgres.js` clients (app, seed, tests) connect unchanged.
 * - Multiplexing limitation: the socket server accepts multiple concurrent
 *   connections but serializes every query through the single PGlite
 *   instance, and each connection executes as the `postgres` superuser
 *   regardless of the username in the connection URL. Local RLS is therefore
 *   enforced with an explicit `SET LOCAL ROLE cx_app` inside user
 *   transactions (see apps/web/lib/db.ts and docs/hosted-role-and-rls.md).
 * - Native PostgreSQL (scripts/dev-db.sh) remains the authoritative CI gate.
 *
 * Commands: init | start | stop | migrate | reset | status
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Deterministic, validated paths (never derived from user input)
// ---------------------------------------------------------------------------
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(SCRIPT_DIR, "..");
export const PGLITE_DIR = path.join(ROOT, ".dev", "pglite");
export const DATA_DIR = path.join(PGLITE_DIR, "data");
const STATUS_FILE = path.join(PGLITE_DIR, "status.json");
const LEDGER_MIRROR = path.join(PGLITE_DIR, "migrations.json");
const LOG_FILE = path.join(PGLITE_DIR, "server.log");
const SHIM_FILE = path.join(ROOT, "supabase", "local", "auth_shim.sql");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

const HOST = "127.0.0.1";
const DEFAULT_PORT = 54329;

/** Error type for expected operator-facing failures (printed without stack). */
export class CliError extends Error {}

export function resolvePort(raw = process.env.CX_DB_PORT) {
  if (!raw) return DEFAULT_PORT;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || String(port) !== String(raw).trim() || port < 1024 || port > 65535) {
    throw new CliError("CX_DB_PORT must be an integer between 1024 and 65535.");
  }
  return port;
}

/**
 * Safety guard used before any destructive operation: the target must resolve
 * to exactly `<repo>/.dev/pglite`, and the repository root must contain this
 * project's package.json. Broad, relative-escaping or unresolved paths are
 * refused outright — this function is the only gate in front of `rm`.
 */
export async function assertSafePgliteTarget(target) {
  const resolved = path.resolve(target);
  if (resolved !== PGLITE_DIR) {
    throw new CliError("refusing to touch an unexpected path (expected the project's .dev/pglite directory).");
  }
  if (resolved === path.parse(resolved).root || resolved.split(path.sep).filter(Boolean).length < 3) {
    throw new CliError("refusing to operate on a broad filesystem path.");
  }
  let pkg;
  try {
    pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  } catch {
    throw new CliError("repository root validation failed (package.json unreadable).");
  }
  if (pkg.name !== "cx-survey-platform") {
    throw new CliError("repository root validation failed (unexpected package name).");
  }
  return resolved;
}

async function log(line) {
  try {
    await mkdir(PGLITE_DIR, { recursive: true });
    await writeFile(LOG_FILE, `${new Date().toISOString()} ${line}\n`, { flag: "a" });
  } catch {
    /* logging is best-effort */
  }
}

// ---------------------------------------------------------------------------
// Port / process introspection
// ---------------------------------------------------------------------------
export function probePort(port, host = HOST) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 750 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    const closed = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once("error", closed);
    socket.once("timeout", closed);
  });
}

async function readStatusRecord(statusFile) {
  try {
    const parsed = JSON.parse(await readFile(statusFile, "utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM"; // process exists but is not signalable by us
  }
}

/**
 * Classifies the local server state:
 *  - { state: "stopped" }             nothing listens, no status record
 *  - { state: "running", status }     our recorded, live server owns the port
 *  - { state: "foreign" }             the port is open but NOT recorded by us
 *  - { state: "stale", status }       a status record exists but nothing listens
 */
export async function serverState(port, { statusFile = STATUS_FILE } = {}) {
  const open = await probePort(port);
  const status = await readStatusRecord(statusFile);
  const ours = status && status.port === port && pidAlive(status.pid);
  if (open && ours) return { state: "running", status };
  if (open) return { state: "foreign" };
  if (status && status.port === port) return { state: "stale", status };
  return { state: "stopped" };
}

// ---------------------------------------------------------------------------
// PGlite lifecycle
// ---------------------------------------------------------------------------
async function loadPglite() {
  const [{ PGlite }, { pgcrypto }, { citext }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("@electric-sql/pglite/contrib/pgcrypto"),
    import("@electric-sql/pglite/contrib/citext"),
  ]);
  return { PGlite, extensions: { pgcrypto, citext } };
}

async function openDb() {
  const { PGlite, extensions } = await loadPglite();
  await mkdir(DATA_DIR, { recursive: true });
  return PGlite.create(DATA_DIR, { extensions });
}

/** Refuse concurrent access to the single-writer PGlite data directory. */
async function assertNotRunning(port, action) {
  const { state } = await serverState(port);
  if (state === "running") {
    throw new CliError(
      `the local PGlite server is running on ${HOST}:${port}; stop it (Ctrl+C or \`pnpm db:stop\`) ` +
        `before running \`${action}\` — the PGlite data directory supports one writer at a time.`,
    );
  }
  if (state === "foreign") {
    throw new CliError(
      `another process is listening on ${HOST}:${port} and it is not this project's PGlite server. ` +
        `Refusing to continue. Free the port or set CX_DB_PORT.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Migration ledger (idempotent, checksum-verified)
// ---------------------------------------------------------------------------
export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function listMigrationFiles(dir = MIGRATIONS_DIR) {
  const entries = await readdir(dir);
  return entries.filter((name) => name.endsWith(".sql")).sort(); // lexical order
}

/**
 * Applies the local auth shim (idempotent by design; NEVER applied to hosted
 * Supabase — this script has no hosted connectivity at all) and then every
 * pending migration in lexical filename order, exactly once each, inside a
 * transaction, recording filename + SHA-256 + timestamp in `_migrations`.
 * A changed checksum for an already-applied migration fails loudly; a
 * recorded migration is never silently re-applied.
 */
export async function runMigrations(db, { shimFile = SHIM_FILE, migrationsDir = MIGRATIONS_DIR, mirrorFile = LEDGER_MIRROR } = {}) {
  await db.exec(await readFile(shimFile, "utf8"));

  await db.exec(`
    create table if not exists _migrations (
      name text primary key,
      sha256 text,
      applied_at timestamptz not null default now()
    );
    alter table _migrations add column if not exists sha256 text;
  `);

  const files = await listMigrationFiles(migrationsDir);
  const { rows: appliedRows } = await db.query(`select name, sha256 from _migrations order by name`);
  const applied = new Map(appliedRows.map((row) => [row.name, row.sha256]));

  let appliedNow = 0;
  for (const name of files) {
    const buffer = await readFile(path.join(migrationsDir, name));
    const checksum = sha256(buffer);
    if (applied.has(name)) {
      const recorded = applied.get(name);
      if (recorded && recorded !== checksum) {
        throw new CliError(
          `migration ${name} was already applied with a different checksum. Applied migrations are ` +
            `immutable; add a new migration file instead. (Use \`reset\` to rebuild the disposable ` +
            `local database if the change was intentional.)`,
        );
      }
      if (!recorded) {
        // Ledger row from an older format without a checksum: record it now.
        await db.query(`update _migrations set sha256 = $1 where name = $2`, [checksum, name]);
      }
      continue; // never silently re-apply a recorded migration
    }
    console.log(`applying ${name}`);
    await db.transaction(async (tx) => {
      await tx.exec(buffer.toString("utf8"));
      await tx.query(`insert into _migrations (name, sha256) values ($1, $2)`, [name, checksum]);
    });
    appliedNow += 1;
  }

  const { rows: ledger } = await db.query(`select name from _migrations order by name`);
  if (mirrorFile) {
    await mkdir(path.dirname(mirrorFile), { recursive: true });
    await writeFile(
      mirrorFile,
      JSON.stringify({ updatedAt: new Date().toISOString(), migrations: ledger.map((r) => r.name) }, null, 2),
    );
  }
  return { appliedNow, total: ledger.length, latest: ledger.at(-1)?.name ?? null };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
async function cmdInit(port) {
  await assertNotRunning(port, "init");
  await mkdir(PGLITE_DIR, { recursive: true });
  const fresh = !existsSync(DATA_DIR);
  const db = await openDb();
  try {
    await db.exec(`create extension if not exists pgcrypto; create extension if not exists citext;`);
    const result = await runMigrations(db);
    console.log(fresh ? `initialized PGlite data directory at .dev/pglite/data` : `PGlite data directory ready`);
    console.log(`migrations: ${result.appliedNow} applied now, ${result.total} total`);
    await log(`init ok (applied ${result.appliedNow}, total ${result.total})`);
  } finally {
    await db.close(); // clean close so data persists
  }
  console.log(`next: \`pnpm db:start\` (the server stays in the foreground; stop with Ctrl+C)`);
}

async function cmdMigrate(port) {
  await assertNotRunning(port, "migrate");
  if (!existsSync(DATA_DIR)) throw new CliError("no local database found — run `pnpm db:init` first.");
  const db = await openDb();
  try {
    const result = await runMigrations(db);
    console.log(`migrations: ${result.appliedNow} applied now, ${result.total} total`);
    if (result.latest) console.log(`latest: ${result.latest}`);
    await log(`migrate ok (applied ${result.appliedNow}, total ${result.total})`);
  } finally {
    await db.close();
  }
}

async function cmdStart(port) {
  const { state } = await serverState(port);
  if (state === "running") throw new CliError(`the local PGlite server is already running on ${HOST}:${port}.`);
  if (state === "foreign") {
    throw new CliError(`another process is listening on ${HOST}:${port}. Refusing to start. Free the port or set CX_DB_PORT.`);
  }
  if (!existsSync(DATA_DIR)) throw new CliError("no local database found — run `pnpm db:init` first.");

  const db = await openDb();
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  // maxConnections defaults to 1 in pglite-socket, which rejects the second
  // pool (Next.js app pool + admin pool + seed + tests all connect). 25
  // covers the app's max 10 + admin max 5 + seed/tests with headroom. All
  // connections still share ONE PGlite instance: queries are serialized, and
  // a transaction on one connection blocks queued statements from others
  // until it commits (documented multiplexing limitation).
  const server = new PGLiteSocketServer({ db, host: HOST, port, maxConnections: 25 });

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nreceived ${signal}, shutting down ...`);
    try {
      await server.stop();
    } catch {
      /* server may already be closed */
    }
    try {
      await db.close(); // flush + persist
    } catch {
      /* ignore double-close */
    }
    await unlink(STATUS_FILE).catch(() => {});
    await log(`stopped (${signal})`);
    console.log(`server stopped; data persisted under .dev/pglite/data`);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGHUP", () => void shutdown("SIGHUP"));

  await server.start();
  const mirror = await readFile(LEDGER_MIRROR, "utf8").then(JSON.parse).catch(() => ({ migrations: null }));
  await writeFile(
    STATUS_FILE,
    JSON.stringify({ pid: process.pid, host: HOST, port, startedAt: new Date().toISOString() }, null, 2),
  );
  await log(`started on ${HOST}:${port} (pid ${process.pid})`);
  // Prints host/port/engine/migration state only — never credentials or full
  // connection strings.
  console.log(`engine:     PGlite (PostgreSQL WASM) — local development only`);
  console.log(`listening:  ${HOST}:${port}`);
  console.log(`database:   postgres`);
  console.log(`migrations: ${mirror.migrations ? `${mirror.migrations.length} applied` : "unknown (run pnpm db:init)"}`);
  console.log(`data dir:   .dev/pglite/data (disposable synthetic data)`);
  console.log(`note:       all connections share one PGlite instance; queries are serialized`);
  console.log(`stop with Ctrl+C (or \`pnpm db:stop\` from another terminal)`);
  // Foreground by design: safest under restrictive Windows group policy.
}

async function cmdStop(port) {
  const { state, status } = await serverState(port);
  if (state === "foreign") {
    throw new CliError(
      `the process listening on ${HOST}:${port} was not started by this project's dev-db script ` +
        `(no matching status record). Refusing to terminate it.`,
    );
  }
  if (state === "stopped") {
    console.log(`no local PGlite server is running on ${HOST}:${port}.`);
    return;
  }
  if (state === "stale") {
    await unlink(STATUS_FILE).catch(() => {});
    console.log(`removed a stale status record; nothing was listening on ${HOST}:${port}.`);
    return;
  }
  // Validate identity before signalling: recorded pid, recorded port, alive.
  const { pid } = status;
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) {
    throw new CliError("the recorded server PID is invalid; refusing to send signals.");
  }
  process.kill(pid, "SIGTERM"); // the foreground server shuts down cleanly on SIGTERM
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!(await probePort(port))) {
      console.log(`stopped the local PGlite server (pid ${pid}).`);
      await unlink(STATUS_FILE).catch(() => {});
      return;
    }
  }
  throw new CliError(`server (pid ${pid}) did not stop within 10s; stop it with Ctrl+C in its terminal.`);
}

async function cmdReset(port) {
  const { state } = await serverState(port);
  if (state === "foreign") {
    throw new CliError(`another process owns ${HOST}:${port}; refusing to reset. Free the port or set CX_DB_PORT.`);
  }
  if (state === "running") {
    console.log(`stopping the running local server first ...`);
    await cmdStop(port);
  }
  const target = await assertSafePgliteTarget(PGLITE_DIR);
  // Removes ONLY the project's .dev/pglite directory (disposable synthetic
  // local data). Hosted Supabase is never touched — this script cannot reach it.
  await rm(target, { recursive: true, force: true });
  console.log(`removed .dev/pglite (local disposable data only; hosted Supabase untouched)`);
  await cmdInit(port);
}

async function cmdStatus(port) {
  const { state, status } = await serverState(port);
  const running = state === "running";
  console.log(`state:      ${running ? "running" : "stopped"}`);
  console.log(`engine:     PGlite (PostgreSQL WASM) — local development only`);
  console.log(`host:       ${HOST}`);
  console.log(`port:       ${port}`);
  if (running) console.log(`pid:        ${status.pid}`);
  if (state === "foreign") console.log(`warning:    port ${port} is in use by a process this project did not start`);
  console.log(`data dir:   ${path.relative(ROOT, DATA_DIR)}${existsSync(DATA_DIR) ? "" : " (not initialized)"}`);

  let migrations = null;
  if (!running && existsSync(DATA_DIR)) {
    // Authoritative when stopped: read the ledger from the database itself.
    try {
      const db = await openDb();
      try {
        const { rows } = await db.query(`select name from _migrations order by name`);
        migrations = rows.map((r) => r.name);
      } finally {
        await db.close();
      }
    } catch {
      /* fall through to the mirror below */
    }
  }
  if (!migrations) {
    migrations = await readFile(LEDGER_MIRROR, "utf8")
      .then((raw) => JSON.parse(raw).migrations ?? null)
      .catch(() => null);
  }
  if (migrations) {
    console.log(`migrations: ${migrations.length} applied`);
    if (migrations.length) console.log(`latest:     ${migrations.at(-1)}`);
  } else {
    console.log(`migrations: unknown (run \`pnpm db:init\`)`);
  }
}

// ---------------------------------------------------------------------------
// CLI entry (only when executed directly; the module is import-safe for tests)
// ---------------------------------------------------------------------------
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  const COMMANDS = { init: cmdInit, start: cmdStart, stop: cmdStop, migrate: cmdMigrate, reset: cmdReset, status: cmdStatus };
  const command = process.argv[2];
  if (!COMMANDS[command]) {
    console.error("usage: node scripts/dev-db.mjs {init|start|stop|migrate|reset|status}");
    process.exit(1);
  }
  try {
    await COMMANDS[command](resolvePort());
  } catch (error) {
    await log(`${command} failed: ${error.message}`);
    console.error(`error: ${error.message}`);
    if (!(error instanceof CliError)) console.error(error.stack);
    process.exit(1);
  }
}
