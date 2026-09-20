import { readFileSync } from "node:fs";
import { join } from "node:path";

const shared = readFileSync(
  join(__dirname, "swift-data-crud.component.html"),
  "utf8",
);
const ssi = readFileSync(
  join(__dirname, "ssi-maintenance-feature", "dashboard-route.component.html"),
  "utf8",
);
const sharedTs = readFileSync(
  join(__dirname, "swift-data-crud.component.ts"),
  "utf8",
);
const ssiTs = readFileSync(
  join(__dirname, "ssi-maintenance-feature", "ssi-index.facade.ts"),
  "utf8",
);

describe("maintenance index action host adapters", () => {
  it("wires RMA Entity and Nostro through the shared action columns", () => {
    expect(shared).toContain("actionColumns()");
    expect(sharedTs).toContain("createMaintenanceIndexActionAdapter");
    expect(sharedTs).toContain(
      "createMaintenanceIndexActionAdapter(this.resourceId())",
    );
  });
  it("wires SSI through the same policy registry", () => {
    expect(ssi).toContain("index.ownershipActionColumns()");
    expect(ssiTs).toContain('createMaintenanceIndexActionAdapter("ssi")');
  });
  it("keeps Request Type and server-derived Current Status informational columns", () => {
    for (const template of [shared, ssi]) {
      expect(template).toContain("Request Type");
      expect(template).toContain("Current Status");
    }
  });
  it("removes Request Type header and cells only for Draft and adjusts empty rows", () => {
    expect(shared).toContain("@if (showRequestTypeColumn()) {");
    expect(ssi).toContain("@if (index.showRequestTypeColumn()) {");
    expect(shared).toContain("showRequestTypeColumn() ? 1 : 0");
    expect(ssi).toContain("index.showRequestTypeColumn() ? 1 : 0");
  });
  it("uses the generic Revoke label for the existing Draft action", () => {
    expect(shared).not.toContain("Revoke Draft");
    expect(ssi).not.toContain("Revoke Draft");
    expect(shared).toContain("requestDraftRevoke(row)");
    expect(ssi).toContain("index.requestDraftRevoke(row)");
  });
  it("derives empty-state colspan from visible action columns", () => {
    expect(shared).toContain("actionColumns().length");
    expect(ssi).toContain("index.ownershipActionColumns().length");
    expect(ssi).not.toContain('colspan="13"');
  });
  it("preserves row click Enter and Space View activation", () => {
    expect(shared).toContain('(click)="view(row)"');
    expect(shared).toContain('(keydown)="openRowFromKeyboard($event, row)"');
    expect(ssi).toContain('(click)="host.reviewForChecker(row)"');
    expect(ssi).toContain('(keydown.enter)="host.reviewForChecker(row)"');
    expect(ssi).toContain(
      "$event.preventDefault(); host.reviewForChecker(row)",
    );
  });
  it("stops action-button propagation and retains existing handlers", () => {
    for (const handler of ["act(row, 'submit')", "edit(row)", "revise(row)"]) {
      expect(shared).toContain(handler);
      expect(ssi).toContain(`host.${handler}`);
    }
    expect(shared).toContain("requestSuppress(row)");
    expect(ssi).toContain("index.requestDelete(row)");
    expect(shared).toContain("requestDraftRevoke(row)");
    expect(ssi).toContain("index.requestDraftRevoke(row)");
    expect(
      (shared.match(/\$event\.stopPropagation\(\)/g) ?? []).length,
    ).toBeGreaterThanOrEqual(5);
    expect(
      (ssi.match(/\$event\.stopPropagation\(\)/g) ?? []).length,
    ).toBeGreaterThanOrEqual(5);
  });
  it("resets hidden action sorts to each host existing default", () => {
    expect(sharedTs).toContain("this.sortPath.set(null)");
    expect(ssiTs).toContain(
      'this.ownershipTab() === "OWN" ? "BOOKING_ENTITY" : "CURRENCY"',
    );
    expect(ssiTs).toContain('this.ownershipSortDirection.set("ASC")');
  });
});
