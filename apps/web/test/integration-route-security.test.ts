import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(path.resolve(process.cwd(), relative), "utf8");

describe("new integration route security", () => {
  it("protects Figma REST routes with session and study edit permission", () => {
    for (const route of ["app/api/figma/connect/route.ts", "app/api/figma/frames/route.ts"]) {
      const source = read(route);
      expect(source).toContain("getSession");
      expect(source).toContain('assertCan(session.role, "studies.edit")');
    }
    expect(read("app/api/figma/callback/route.ts")).toContain("verified.userId !== session.userId");
  });

  it("protects worker with CRON_SECRET and atomic skip-locked claim", () => {
    expect(read("app/api/internal/report-worker/route.ts")).toContain("timingSafeEqual");
    expect(read("lib/report-worker.ts")).toContain("for update skip locked");
    expect(read("lib/report-worker.ts")).toContain("and status = 'queued'");
  });
});
