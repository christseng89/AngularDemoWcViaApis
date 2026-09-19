import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("SSI Index approved visibility contract", () => {
  const template = readFileSync(
    join(
      __dirname,
      "ssi-maintenance-feature",
      "dashboard-route.component.html",
    ),
    "utf8",
  );
  const start = template.indexOf(
    '<div class="table-scroll">',
    template.indexOf("Search current ownership index"),
  );
  const end = template.indexOf('aria-label="SSI Index pagination"', start);
  const indexTable = template.slice(start, end);

  it("shows the business SSI name without the technical record id", () => {
    expect(indexTable).toContain("{{ row.counterpartyId }}");
    expect(indexTable).not.toContain("<small>{{ row.id }}</small>");
  });

  it("labels the existing booking/legal value as Account Owner without changing its binding or sort identity", () => {
    expect(indexTable).toContain("Account Owner");
    expect(indexTable).not.toContain("Booking／Legal Entity");
    expect(indexTable).toContain("index.ownershipAriaSort('BOOKING_ENTITY')");
    expect(indexTable).toContain(
      'row.route["bookingEntity"] || row.ownerParty',
    );
    expect(indexTable).not.toContain("<small>{{ row.ownerParty }}</small>");
  });

  it("labels the existing servicer column as Servicer and renders only the servicer value", () => {
    expect(indexTable).toContain("Servicer");
    expect(indexTable).not.toContain("Account Owner／Servicer");
    expect(indexTable).toContain("index.ownershipAriaSort('ACCOUNT_SERVICER')");
    expect(indexTable).toContain('{{ row.route["accountWithBic"] }}');
    expect(indexTable).not.toContain(
      'row.route["accountOwner"] || row.ownerParty',
    );
  });

  it("does not render Account Ref or Route Class / Priority columns", () => {
    expect(indexTable).not.toContain("Account Ref");
    expect(indexTable).not.toContain("index.ownershipAriaSort('ACCOUNT_REF')");
    expect(indexTable).not.toContain('row.route["accountId"]');
    expect(indexTable).not.toContain("Route Class／Priority");
    expect(indexTable).not.toContain(
      "index.ownershipAriaSort('ROUTE_PRIORITY')",
    );
    expect(indexTable).not.toContain('row.route["routePreference"]');
  });

  it("labels and renders the effective end date while preserving the public sort identity", () => {
    expect(indexTable).toContain("Effective Date");
    expect(indexTable).not.toContain("Effective Period");
    expect(indexTable).toContain("index.ownershipAriaSort('EFFECTIVE_PERIOD')");
    expect(indexTable).toContain('row.route["validTo"] || "—"');
    expect(indexTable).not.toContain('row.route["validFrom"]');
  });

  it("preserves every other business column and action contract", () => {
    for (const heading of [
      "SSI ID",
      "Account Owner",
      "Servicer",
      "Currency",
      "Effective Date",
      "Status",
      "Version",
      "Request Type",
      "Current Status",
      "Submit",
      "Edit",
      "Suppress",
      "Revoke Draft",
    ]) {
      expect(indexTable).toContain(heading);
    }

    for (const behavior of [
      "host.reviewForChecker(row)",
      "host.act(row, 'submit')",
      "host.edit(row)",
      "host.revise(row)",
      "index.requestDelete(row)",
      "index.requestDraftRevoke(row)",
      "index.ownershipCurrentStatusLabel(row)",
    ]) {
      expect(indexTable).toContain(behavior);
    }
  });
});
