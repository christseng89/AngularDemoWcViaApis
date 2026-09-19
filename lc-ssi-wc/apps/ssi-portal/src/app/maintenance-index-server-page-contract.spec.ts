import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createMaintenanceIndexActionAdapter } from "./maintenance-index-action-policy";
import { assertMaintenanceServerPage } from "./maintenance-index-server-page";

describe("maintenance index server-page contract", () => {
  it.each(["rma", "entity", "nostro", "ssi"] as const)(
    "%s ALL exposes zero mutation columns",
    (resource) => {
      expect(
        createMaintenanceIndexActionAdapter(resource).columnsFor("ALL"),
      ).toEqual([]);
    },
  );

  it("renders SSI server page items without post-pagination lifecycle filtering", () => {
    const source = readFileSync(
      join(__dirname, "ssi-maintenance-feature", "ssi-index.facade.ts"),
      "utf8",
    );
    const visibleRows = source.slice(
      source.indexOf("readonly visibleRows"),
      source.indexOf("readonly indexTotalPages", source.indexOf("readonly visibleRows")),
    );
    expect(visibleRows).toContain("this.rows(),");
    expect(visibleRows).not.toContain(".filter(");
  });

  it("renders shared maintenance server page items without post-pagination filtering", () => {
    const source = readFileSync(
      join(__dirname, "swift-data-feature", "swift-data-index.store.ts"),
      "utf8",
    );
    const sorting = source.slice(source.indexOf("readonly sortedRows"), source.indexOf("readonly pagedRows"));
    expect(sorting).toContain("if (!path) return this.rows();");
    expect(sorting).not.toContain(".filter(");
    expect(source).toContain("assertMaintenanceServerPage(result.items, this.statusFilter());");
  });

  it("fails closed when a server page leaks a forbidden lifecycle status", () => {
    expect(() =>
      assertMaintenanceServerPage(
        [{ status: "ACTIVE" }, { status: "REVOKED" }],
        "ALL",
      ),
    ).toThrow("MAINTENANCE_INDEX_SERVER_PAGE_STATUS_MISMATCH");
    expect(() =>
      assertMaintenanceServerPage([{ status: "SUPPRESSED" }], "ACTIVE"),
    ).toThrow("MAINTENANCE_INDEX_SERVER_PAGE_STATUS_MISMATCH");
  });
});
