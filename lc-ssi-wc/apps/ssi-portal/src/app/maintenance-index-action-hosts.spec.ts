import { readFileSync } from "node:fs";
import { join } from "node:path";

const shared = readFileSync(
  join(__dirname, "swift-data-crud.component.html"),
  "utf8",
);
const ssi = readFileSync(join(__dirname, "app.component.html"), "utf8");
const sharedTs = readFileSync(
  join(__dirname, "swift-data-crud.component.ts"),
  "utf8",
);
const ssiTs = readFileSync(join(__dirname, "app.component.ts"), "utf8");

describe("maintenance index action host adapters", () => {
  it("wires RMA Entity and Nostro through the shared action columns", () => {
    expect(shared).toContain("actionColumns()");
    expect(sharedTs).toContain("createMaintenanceIndexActionAdapter");
    expect(sharedTs).toContain(
      "createMaintenanceIndexActionAdapter(this.resourceId())",
    );
  });
  it("wires SSI through the same policy registry", () => {
    expect(ssi).toContain("ownershipActionColumns()");
    expect(ssiTs).toContain('createMaintenanceIndexActionAdapter("ssi")');
  });
  it("keeps Request Type and server-derived Current Status informational columns", () => {
    for (const template of [shared, ssi]) {
      expect(template).toContain("Request Type");
      expect(template).toContain("Current Status");
    }
  });
  it("derives empty-state colspan from visible action columns", () => {
    expect(shared).toContain("actionColumns().length");
    expect(ssi).toContain("ownershipActionColumns().length");
    expect(ssi).not.toContain('colspan="13"');
  });
  it("preserves row click Enter and Space View activation", () => {
    expect(shared).toContain('(click)="view(row)"');
    expect(shared).toContain('(keydown)="openRowFromKeyboard($event, row)"');
    expect(ssi).toContain('(click)="reviewForChecker(row)"');
    expect(ssi).toContain('(keydown.enter)="reviewForChecker(row)"');
    expect(ssi).toContain("$event.preventDefault(); reviewForChecker(row)");
  });
  it("stops action-button propagation and retains existing handlers", () => {
    for (const handler of ["act(row, 'submit')", "edit(row)", "revise(row)"]) {
      expect(shared).toContain(handler);
      expect(ssi).toContain(handler);
    }
    expect(shared).toContain("requestSuppress(row)");
    expect(ssi).toContain("requestDelete(row)");
    expect(shared).toContain("requestDraftRevoke(row)");
    expect(ssi).toContain("requestDraftRevoke(row)");
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
