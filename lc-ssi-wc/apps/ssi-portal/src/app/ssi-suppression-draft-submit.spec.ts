import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createMaintenanceIndexActionAdapter } from "./maintenance-index-action-policy";

describe("SSI SUPPRESSION Draft submit contract", () => {
  const template = readFileSync(
    join(
      __dirname,
      "ssi-maintenance-feature",
      "dashboard-route.component.html",
    ),
    "utf8",
  );
  const tableStart = template.indexOf(
    '<div class="table-scroll">',
    template.indexOf("Search current ownership index"),
  );
  const tableEnd = template.indexOf(
    'aria-label="SSI Index pagination"',
    tableStart,
  );
  const indexTable = template.slice(tableStart, tableEnd);
  const policy = createMaintenanceIndexActionAdapter("ssi");

  it("shows the existing Submit action for every Draft, including SUPPRESSION", () => {
    expect(
      policy.isPresented("SUBMIT", {
        status: "DRAFT",
        changeType: "SUPPRESSION",
      }),
    ).toBe(true);
    expect(indexTable).toContain("host.act(row, 'submit')");
  });

  it("does not expose Submit outside Draft status", () => {
    for (const status of ["PENDING_APPROVAL", "ACTIVE", "SUPPRESSED", "WIP"])
      expect(policy.isPresented("SUBMIT", { status })).toBe(false);
  });
});
