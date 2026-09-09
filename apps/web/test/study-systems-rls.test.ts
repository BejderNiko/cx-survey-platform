/** Runtime-capable RLS metadata checks. Requires unapplied migration 13 to be applied in isolated CI/Preview DB. */
import { afterAll, describe, expect, it } from "vitest";
import { adminDb } from "./helpers/db";

const admin = adminDb();

afterAll(async () => {
  await admin.end();
});

describe("study-systems RLS metadata", () => {
  it("forces RLS and exposes only intended authenticated operations", async () => {
    const tables = ["feature_requests", "feature_request_events", "report_jobs", "prototype_path_labels"];
    const forced = await admin`
      select relname from pg_class
      where relname in ('feature_requests', 'feature_request_events', 'report_jobs', 'prototype_path_labels') and relrowsecurity and relforcerowsecurity`;
    expect(forced.map((row) => String(row.relname)).sort()).toEqual([...tables].sort());

    const policies = await admin`
      select tablename, cmd from pg_policies
      where schemaname = 'public' and tablename in ('feature_requests', 'feature_request_events', 'report_jobs', 'prototype_path_labels')`;
    const commands = (table: string) => policies.filter((row) => row.tablename === table).map((row) => String(row.cmd)).sort();
    expect(commands("feature_request_events")).toEqual(["INSERT", "SELECT"]);
    expect(commands("report_jobs")).toEqual(["INSERT", "SELECT"]);
    expect(commands("prototype_path_labels")).toEqual(["INSERT", "SELECT", "UPDATE"]);
  });

  it("does not grant authenticated lifecycle updates on report jobs", async () => {
    const grants = await admin`
      select privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'report_jobs' and grantee = 'authenticated'`;
    expect(grants.map((row) => String(row.privilege_type)).sort()).toEqual(["INSERT", "SELECT"]);
  });
});
