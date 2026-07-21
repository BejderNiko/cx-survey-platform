/**
 * Focused tests for scripts/dev-db.mjs (run with `pnpm test:db-manager`,
 * i.e. `node --test scripts/dev-db.test.mjs`). Pure Node: ledger behavior is
 * exercised against throwaway in-memory PGlite instances and temp migration
 * directories, so the repository's real migrations and `.dev` data are never
 * touched.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  CliError,
  PGLITE_DIR,
  ROOT,
  assertSafePgliteTarget,
  listMigrationFiles,
  pidAlive,
  probePort,
  resolvePort,
  runMigrations,
  serverState,
  sha256,
} from "./dev-db.mjs";

const cleanups = [];
after(async () => {
  for (const fn of cleanups.reverse()) await fn();
});

async function tempDir(prefix) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function memoryDb() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = await PGlite.create(); // in-memory, discarded after the test
  cleanups.push(() => db.close().catch(() => {}));
  return db;
}

const SHIM = `create schema if not exists testshim;`;

describe("port validation", () => {
  it("defaults to 54329", () => assert.equal(resolvePort(undefined), 54329));
  it("accepts a valid override", () => assert.equal(resolvePort("54330"), 54330));
  for (const bad of ["0", "80", "999999", "abc", "54329x"]) {
    it(`rejects ${JSON.stringify(bad)}`, () => assert.throws(() => resolvePort(bad), CliError));
  }
});

describe("safe path resolution (reset target validation)", () => {
  it("accepts exactly the project's .dev/pglite directory", async () => {
    assert.equal(await assertSafePgliteTarget(PGLITE_DIR), PGLITE_DIR);
  });
  it("accepts an unnormalized spelling of the same directory", async () => {
    assert.equal(await assertSafePgliteTarget(path.join(ROOT, ".dev", "..", ".dev", "pglite")), PGLITE_DIR);
  });
  for (const target of ["/", os.homedir(), path.join(ROOT, ".dev"), path.join(ROOT, ".dev", "pglite", ".."), ROOT, path.join(ROOT, "supabase")]) {
    it(`refuses ${target}`, async () => {
      await assert.rejects(() => assertSafePgliteTarget(target), CliError);
    });
  }
});

describe("server state detection", () => {
  it("reports stopped when nothing listens and no status record exists", async () => {
    const statusFile = path.join(await tempDir("devdb-status-"), "status.json");
    const { state } = await serverState(64329, { statusFile });
    assert.equal(state, "stopped");
  });

  it("refusal case: a foreign process on the port is never treated as ours", async () => {
    const statusFile = path.join(await tempDir("devdb-status-"), "status.json");
    const server = net.createServer(() => {});
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    try {
      const { state } = await serverState(port, { statusFile });
      assert.equal(state, "foreign"); // start/stop/reset all refuse on this
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("duplicate-start case: a live recorded server is detected as running", async () => {
    const dir = await tempDir("devdb-status-");
    const statusFile = path.join(dir, "status.json");
    const server = net.createServer(() => {});
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    await writeFile(statusFile, JSON.stringify({ pid: process.pid, port, startedAt: new Date().toISOString() }));
    try {
      const { state, status } = await serverState(port, { statusFile });
      assert.equal(state, "running"); // `start` refuses in this state
      assert.equal(status.pid, process.pid);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("reports a stale record when the port is closed", async () => {
    const dir = await tempDir("devdb-status-");
    const statusFile = path.join(dir, "status.json");
    await writeFile(statusFile, JSON.stringify({ pid: process.pid, port: 64330 }));
    const { state } = await serverState(64330, { statusFile });
    assert.equal(state, "stale");
  });

  it("pidAlive rejects nonsense pids", () => {
    assert.equal(pidAlive(0), false);
    assert.equal(pidAlive(-5), false);
    assert.equal(pidAlive(2 ** 30), false);
  });

  it("probePort is false on a closed port", async () => {
    assert.equal(await probePort(64331), false);
  });
});

describe("migration ledger", () => {
  async function fixture() {
    const dir = await tempDir("devdb-mig-");
    const shimFile = path.join(dir, "shim.sql");
    const migrationsDir = path.join(dir, "migrations");
    await writeFile(shimFile, SHIM);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(migrationsDir);
    await writeFile(path.join(migrationsDir, "0002_second.sql"), "create table b (id int, a_id int references a(id));");
    await writeFile(path.join(migrationsDir, "0001_first.sql"), "create table a (id int primary key);");
    await writeFile(path.join(migrationsDir, "0010_tenth.sql"), "create table c (id int);");
    return { shimFile, migrationsDir };
  }

  it("lists migrations in lexical filename order", async () => {
    const { migrationsDir } = await fixture();
    assert.deepEqual(await listMigrationFiles(migrationsDir), ["0001_first.sql", "0002_second.sql", "0010_tenth.sql"]);
  });

  it("applies migrations in order, records the ledger, and is idempotent on rerun", async () => {
    const { shimFile, migrationsDir } = await fixture();
    const db = await memoryDb();
    const first = await runMigrations(db, { shimFile, migrationsDir, mirrorFile: null });
    assert.equal(first.appliedNow, 3); // 0002 references 0001 → order mattered
    assert.equal(first.total, 3);
    assert.equal(first.latest, "0010_tenth.sql");
    const { rows } = await db.query("select name, sha256 from _migrations order by name");
    assert.deepEqual(rows.map((r) => r.name), ["0001_first.sql", "0002_second.sql", "0010_tenth.sql"]);
    for (const row of rows) assert.match(row.sha256, /^[0-9a-f]{64}$/);

    const second = await runMigrations(db, { shimFile, migrationsDir, mirrorFile: null });
    assert.equal(second.appliedNow, 0); // second run applies zero
    assert.equal(second.total, 3);
  });

  it("fails loudly when an applied migration's content changes (checksum mismatch)", async () => {
    const { shimFile, migrationsDir } = await fixture();
    const db = await memoryDb();
    await runMigrations(db, { shimFile, migrationsDir, mirrorFile: null });
    await writeFile(path.join(migrationsDir, "0001_first.sql"), "create table a (id bigint primary key); -- edited");
    await assert.rejects(
      () => runMigrations(db, { shimFile, migrationsDir, mirrorFile: null }),
      (error) => error instanceof CliError && /different checksum/.test(error.message),
    );
    // ...and it did not silently re-apply or continue past the failure.
    const { rows } = await db.query("select count(*)::int as n from _migrations");
    assert.equal(rows[0].n, 3);
  });

  it("a new migration is applied transactionally and only recorded on success", async () => {
    const { shimFile, migrationsDir } = await fixture();
    const db = await memoryDb();
    await runMigrations(db, { shimFile, migrationsDir, mirrorFile: null });
    await writeFile(path.join(migrationsDir, "0011_broken.sql"), "create table d (id int); this is not sql;");
    await assert.rejects(() => runMigrations(db, { shimFile, migrationsDir, mirrorFile: null }));
    const { rows } = await db.query("select count(*)::int as n from _migrations where name = '0011_broken.sql'");
    assert.equal(rows[0].n, 0); // not recorded
    const { rows: d } = await db.query("select count(*)::int as n from pg_tables where tablename = 'd'");
    assert.equal(d[0].n, 0); // rolled back with the failed migration
  });

  it("sha256 is a stable content hash", () => {
    assert.equal(sha256(Buffer.from("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
