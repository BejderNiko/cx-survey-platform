import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(path.resolve(process.cwd(), "../../supabase/migrations/20260812000013_feature_requests_and_report_jobs.sql"), "utf8");

describe("report workflow migration invariants", () => {
  it("requires immutable version lineage and successful artifact metadata", () => {
    expect(sql).toContain("study_version_id uuid not null");
    expect(sql).toContain("foreign key (org_id, study_id, study_version_id)");
    expect(sql).toContain("output_sha256 is not null");
    expect(sql).toContain("output_byte_size is not null");
    expect(sql).toContain("output_content_type is not null");
  });

  it("forces tenant RLS on report jobs", () => {
    expect(sql).toContain("alter table report_jobs force row level security");
    expect(sql).toContain("create policy report_jobs_tenant");
    expect(sql).toContain("org_id in (select current_org_ids())");
  });
});
