import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(path.resolve(process.cwd(), "../../supabase/migrations/20260812000013_feature_requests_and_report_jobs.sql"), "utf8");

describe("study-systems migration invariants", () => {
  it("requires immutable version lineage, leases, retries and successful artifact metadata", () => {
    expect(sql).toContain("study_version_id uuid not null");
    expect(sql).toContain("foreign key (org_id, study_id, study_version_id)");
    expect(sql).toContain("attempt_count integer not null default 0");
    expect(sql).toContain("lease_expires_at timestamptz");
    expect(sql).toContain("output_sha256 is not null");
    expect(sql).toContain("output_byte_size is not null");
    expect(sql).toContain("output_content_type is not null");
  });

  it("uses forced, operation-specific RLS instead of tenant-wide FOR ALL", () => {
    for (const table of ["feature_requests", "feature_request_events", "report_jobs", "prototype_path_labels"]) {
      expect(sql).toContain(`alter table ${table} force row level security`);
    }
    expect(sql).not.toContain("create policy feature_requests_tenant");
    expect(sql).not.toContain("create policy feature_request_events_tenant");
    expect(sql).not.toContain("create policy report_jobs_tenant");
    expect(sql).toContain("create policy feature_request_events_insert");
    expect(sql).not.toContain("feature_request_events for update");
    expect(sql).not.toContain("feature_request_events for delete");
    expect(sql).toContain("grant select, insert on feature_request_events");
    expect(sql).toContain("grant select, insert on report_jobs");
    expect(sql).not.toContain("grant select, insert, update, delete on feature_requests");
  });

  it("binds persisted path labels to tenant, study version, question and signature", () => {
    expect(sql).toContain("create table prototype_path_labels");
    expect(sql).toContain("path_signature text not null");
    expect(sql).toContain("prototype_path_labels_signature_idx");
    expect(sql).toContain("foreign key (org_id, study_id, study_version_id)");
    expect(sql).toContain("updated_by = auth.uid()");
  });
});
