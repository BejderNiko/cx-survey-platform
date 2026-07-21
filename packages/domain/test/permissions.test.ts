import { describe, expect, it } from "vitest";
import { PermissionError, assertCan, can } from "../src/permissions";

describe("permission policy", () => {
  it("viewer can view but not modify", () => {
    expect(can("viewer", "studies.view")).toBe(true);
    expect(can("viewer", "responses.view")).toBe(true);
    expect(can("viewer", "studies.edit")).toBe(false);
    expect(can("viewer", "studies.publish")).toBe(false);
    expect(can("viewer", "panel.import")).toBe(false);
    expect(can("viewer", "members.invite")).toBe(false);
  });

  it("researcher can run studies but not administer members or import panel data", () => {
    expect(can("researcher", "studies.create")).toBe(true);
    expect(can("researcher", "studies.publish")).toBe(true);
    expect(can("researcher", "distributions.create")).toBe(true);
    expect(can("researcher", "members.invite")).toBe(false);
    expect(can("researcher", "panel.import")).toBe(false);
    expect(can("researcher", "panel.anonymize")).toBe(false);
  });

  it("panel manager owns panel data but not study publication", () => {
    expect(can("panel_manager", "panel.import")).toBe(true);
    expect(can("panel_manager", "panel.anonymize")).toBe(true);
    expect(can("panel_manager", "segments.manage")).toBe(true);
    expect(can("panel_manager", "studies.publish")).toBe(false);
  });

  it("analyst can run analyses and exports but not manage members", () => {
    expect(can("analyst", "analytics.run")).toBe(true);
    expect(can("analyst", "datasets.create")).toBe(true);
    expect(can("analyst", "datasets.export")).toBe(true);
    expect(can("analyst", "members.change_role")).toBe(false);
  });

  it("owner and administrator can do everything", () => {
    expect(can("owner", "members.change_role")).toBe(true);
    expect(can("administrator", "panel.anonymize")).toBe(true);
    expect(can("administrator", "audit.view")).toBe(true);
  });

  it("assertCan throws a typed error", () => {
    expect(() => assertCan("viewer", "studies.edit")).toThrow(PermissionError);
    expect(() => assertCan("owner", "studies.edit")).not.toThrow();
  });
});
