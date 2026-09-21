import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("AppComponent shell integration", () => {
  const template = () =>
    readFileSync(join(join(process.cwd(), "apps/ssi-portal/src/app"), "app.component.html"), "utf8");
  const component = () =>
    readFileSync(join(join(process.cwd(), "apps/ssi-portal/src/app"), "app.component.ts"), "utf8");

  it("delegates shell intent to the existing navigation and refresh handlers", () => {
    const html = template();
    expect(html).toContain("<ssi-app-shell");
    expect(html).toContain('[view]="loadingSsiDashboard() ? \'dashboard\' : view()"');
    expect(html).toContain('[checkerCount]="checkerCount()"');
    expect(html).toContain('[detailOpen]="!!detail.target()"');
    expect(html).toContain('[auditDetailOpen]="routedAuditDetailOpen()"');
    expect(html).toContain('(navigationRequested)="navigate($event)"');
    expect(html).toContain('(refreshRequested)="refresh()"');
    expect(component()).toContain("AppShellComponent,");
  });

  it("renders the SSI page frame before its lazy Dashboard and data request finish", () => {
    expect(template()).toContain("@if (loadingSsiDashboard())");
    expect(template()).toContain('label="Loading SSI records…" variant="screen"');
    expect(component()).toContain("loadingSsiDashboard(): boolean");
    expect(component()).toContain("this.loadingRouteView = routeViewFromUrl(event.url)");
  });

  it("keeps shared shell content while the SSI deletion overlay belongs to Dashboard", () => {
    const html = template();
    const dashboard = readFileSync(
      join(
        join(process.cwd(), "apps/ssi-portal/src/app"),
        "ssi-maintenance-feature",
        "dashboard-route.component.html",
      ),
      "utf8",
    );
    const start = html.indexOf("<ssi-app-shell");
    const close = html.indexOf("</ssi-app-shell>");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(close).toBeGreaterThan(start);
    expect(html.indexOf("<ssi-alert")).toBeGreaterThan(start);
    expect(html.indexOf("<ssi-alert")).toBeLessThan(close);
    expect(html).not.toContain("<ssi-swift-data-crud");
    expect(html.indexOf("<router-outlet")).toBeGreaterThan(start);
    expect(html.indexOf("<router-outlet")).toBeLessThan(close);
    expect(html).not.toContain("@if (deleteTarget(); as row)");
    expect(dashboard).toContain("@if (index.deleteTarget(); as row)");
  });

  it("reads Dashboard-owned index state and local actions from its feature facade", () => {
    const dashboard = readFileSync(
      join(
        join(process.cwd(), "apps/ssi-portal/src/app"),
        "ssi-maintenance-feature",
        "dashboard-route.component.html",
      ),
      "utf8",
    );
    const route = readFileSync(
      join(
        join(process.cwd(), "apps/ssi-portal/src/app"),
        "ssi-maintenance-feature",
        "dashboard-route.component.ts",
      ),
      "utf8",
    );
    for (const member of [
      "rows",
      "ssiSummary",
      "ownershipTab",
      "ownershipSearch",
      "ownershipStatus",
      "selectedCounterparty",
      "counterpartyDirectoryLoading",
      "filteredCounterpartyInbox",
      "counterpartyPartyType",
      "counterpartyInboxSearch",
      "pagedCounterpartyInbox",
      "counterpartyInboxPage",
      "counterpartyInboxTotalPages",
      "indexPage",
      "ssiIndexLoading",
      "ssiIndexTotalItems",
      "ssiIndexDistinctCurrencyCount",
      "ownershipActionColumns",
      "ownershipOf",
      "deleteTarget",
      "deleteReason",
      "canConfirmDelete",
      "searchCounterpartyInbox",
      "selectCounterpartyPartyType",
      "sortCounterpartyInbox",
      "moveCounterpartyInboxPage",
      "requestDelete",
      "requestDraftRevoke",
      "closeDeleteDialog",
      "counterpartyAriaSort",
      "ownershipAriaSort",
      "counterpartySortIndicator",
      "ownershipSortIndicator",
      "activeCount",
      "archivedCount",
      "indexTotalPages",
      "pagedVisibleRows",
      "isOwnershipActionPresented",
      "ownershipCurrentStatusLabel",
      "requestTypeLabel",
    ]) {
      expect(dashboard).not.toContain(`host.${member}`);
      expect(dashboard).toContain(`index.${member}`);
    }
    expect(route).not.toContain('from "../app.component"');
    expect(route).toContain("inject(SsiMaintenanceSession)");
    expect(route).toContain("readonly index = this.session.index;");
  });

  it("binds the Maker route to its feature facade through a narrow action bridge", () => {
    const maker = readFileSync(
      join(join(process.cwd(), "apps/ssi-portal/src/app"), "ssi-maintenance-feature", "maker-route.component.html"),
      "utf8",
    );
    const route = readFileSync(
      join(join(process.cwd(), "apps/ssi-portal/src/app"), "ssi-maintenance-feature", "maker-route.component.ts"),
      "utf8",
    );
    expect(route).not.toContain('from "../app.component"');
    expect(route).toContain("inject(SSI_MAKER_ROUTE_CONTEXT)");
    expect(route).toContain("inject(SsiMaintenanceSession)");
    expect(maker).not.toContain("host.");
    expect(maker).toContain("maker.form");
    expect(maker).toContain("actions.save()");
    expect(maker).toContain("actions.close()");
  });

  it("keeps the lazy feature outlet mounted while the shared SSI detail is open", () => {
    const html = template();
    expect(html).toMatch(
      /\r?\n {2}}\r?\n {2}<div\s+\[hidden\]="\s+!!detail\.target\(\) \|\|/,
    );
    expect(html).toContain("<router-outlet");
  });

  it("keeps SSI Dashboard and Maker presentation out of the eager root template", () => {
    const html = template();
    expect(html).not.toContain("CURRENT OPERATING RECORDS");
    expect(html).not.toContain("MAKER WORKSPACE · PARAMETER-DRIVEN FORMLY");
  });

  it("does not retain an unreachable legacy FIN screen in the root shell", () => {
    expect(template()).not.toContain('@if (false && (view() === "treasury"');
  });
});
