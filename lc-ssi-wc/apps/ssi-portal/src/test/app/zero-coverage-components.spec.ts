import "@angular/compiler";
import { Injector, runInInjectionContext, signal } from "@angular/core";

jest.mock("@ngx-formly/core", () => ({ FormlyForm: class {} }));

import { RESOLUTION_PAGE_SCHEMA_VERSION } from "@ssi/contracts";
import { AuditRouteComponent } from "../../app/audit-feature/audit-route.component";
import { AuditFacade } from "../../app/audit-feature/audit.facade";
import { CheckerRouteComponent } from "../../app/checker-feature/checker-route.component";
import { CheckerFacade } from "../../app/checker-feature/checker.facade";
import { GovernanceIndexTableComponent } from "../../app/governance-index-table.component";
import { GovernedRecordViewComponent } from "../../app/governed-record-view.component";
import { OperationalIssueComponent } from "../../app/operational-issue.component";
import { ResolutionFailureComponent } from "../../app/resolution-workbench/resolution-failure.component";
import { DashboardRouteComponent } from "../../app/ssi-maintenance-feature/dashboard-route.component";
import { MakerRouteComponent } from "../../app/ssi-maintenance-feature/maker-route.component";
import { SSI_MAKER_ROUTE_CONTEXT } from "../../app/ssi-maintenance-feature/ssi-maker-route-context";
import { SsiMaintenanceSession } from "../../app/ssi-maintenance-feature/ssi-maintenance-session";

const create = <T>(type: new () => T, providers: Parameters<typeof Injector.create>[0]["providers"]): T =>
  runInInjectionContext(Injector.create({ providers }), () => new type());

describe("direct coverage for route and presentation components", () => {
  it("executes audit route loading, tabs, SSI/detail outputs and close guards", async () => {
    const snapshot = { id: "SSI-1" };
    const audit = {
      load: jest.fn().mockResolvedValue(undefined),
      currencyOptions: signal<unknown[]>([]),
      selectTab: jest.fn().mockResolvedValue(undefined),
      openDetail: jest.fn(),
      detail: signal<unknown>(null),
    };
    const component = create(AuditRouteComponent, [
      { provide: AuditFacade, useValue: audit },
    ]);
    const tabChanged = jest.spyOn(component.tabChanged, "emit");
    const detailOpen = jest.spyOn(component.detailOpenChange, "emit");
    const ssiRequested = jest.spyOn(component.ssiDetailRequested, "emit");
    component.ngOnInit();
    await component.refresh();
    component.setCurrencyOptions([{ code: "USD", decimals: 2 }]);
    component.selectTab("rma");
    expect(audit.load).toHaveBeenCalledTimes(2);
    expect(audit.currencyOptions()).toEqual([{ code: "USD", decimals: 2 }]);
    expect(tabChanged).toHaveBeenCalled();
    component.closeDetail();
    expect(detailOpen).not.toHaveBeenCalled();
    audit.openDetail.mockReturnValueOnce(snapshot);
    component.openDetail({} as never);
    expect(ssiRequested).toHaveBeenCalledWith(snapshot);
    audit.openDetail.mockReturnValueOnce(null);
    component.openDetail({} as never);
    expect(detailOpen).toHaveBeenCalledWith(true);
    audit.detail.set({ id: "detail" });
    component.closeDetail();
    expect(audit.detail()).toBeNull();
    expect(detailOpen).toHaveBeenLastCalledWith(false);
  });

  it("executes checker loading, warning, tab, review, decision and deactivation paths", async () => {
    const checker = {
      load: jest.fn().mockResolvedValue(undefined),
      count: signal(3),
      warning: signal<string | null>(null),
      selectTab: jest.fn(),
      decide: jest.fn().mockResolvedValue(true),
    };
    const component = create(CheckerRouteComponent, [
      { provide: CheckerFacade, useValue: checker },
    ]);
    const countChanged = jest.spyOn(component.countChanged, "emit");
    const noticeRaised = jest.spyOn(component.noticeRaised, "emit");
    const tabChanged = jest.spyOn(component.tabChanged, "emit");
    const reviewRequested = jest.spyOn(component.reviewRequested, "emit");
    component.ngOnInit();
    await component.refresh();
    expect(countChanged).toHaveBeenCalledWith(3);
    checker.warning.set("partial data");
    await component.refresh();
    expect(noticeRaised).toHaveBeenCalledWith({ kind: "warning", text: "partial data" });
    component.selectTab("entity");
    expect(tabChanged).toHaveBeenCalled();
    const row = { id: "SSI-1" } as never;
    component.openReview(row);
    expect(reviewRequested).toHaveBeenCalledWith(row);
    expect(await component.decide(row, "approve", "valid reason")).toBe(true);
    checker.decide.mockResolvedValueOnce(false);
    expect(await component.decide(row, "reject", "invalid evidence")).toBe(false);
    expect(await component.canDeactivate()).toBe(true);
    Object.defineProperty(component, "swiftDataCrud", {
      value: () => ({ canDeactivate: jest.fn().mockResolvedValue(false) }),
    });
    expect(await component.canDeactivate()).toBe(false);
  });

  it("loads and refreshes dashboard through its shared session", async () => {
    const session = {
      index: { rows: signal([]) },
      load: jest.fn().mockResolvedValue(undefined),
      refreshIndex: jest.fn().mockResolvedValue(undefined),
    };
    const component = create(DashboardRouteComponent, [
      { provide: SsiMaintenanceSession, useValue: session },
    ]);
    component.ngOnInit();
    await component.refresh();
    expect(session.load).toHaveBeenCalledWith("dashboard");
    expect(session.refreshIndex).toHaveBeenCalled();
    expect(component.host).toBe(session);
    expect(component.maintenanceWipPort).toBe(session);
  });

  it("loads and refreshes maker through governed route context", async () => {
    const session = { load: jest.fn().mockResolvedValue(undefined) };
    const actions = { maker: { id: "maker" }, load: jest.fn().mockResolvedValue(undefined) };
    const component = create(MakerRouteComponent, [
      { provide: SsiMaintenanceSession, useValue: session },
      { provide: SSI_MAKER_ROUTE_CONTEXT, useValue: actions },
    ]);
    component.ngOnInit();
    await component.refresh();
    expect(actions.load).toHaveBeenCalled();
    expect(session.load).toHaveBeenCalledWith("maker");
    expect(component.maker).toBe(actions.maker);
  });

  it("constructs the shared governance table input/output contract", () => {
    const component = create(GovernanceIndexTableComponent, []);
    Object.defineProperties(component, {
      ariaLabel: { value: signal("Governance records") },
      kicker: { value: signal("INDEX") },
      instruction: { value: signal("Open a row") },
      emptyText: { value: signal("No records") },
      columns: { value: signal([{ label: "ID", path: "id" }]) },
      trailingColumns: { value: signal([]) },
      rows: { value: signal([]) },
      currentPage: { value: signal(1) },
      totalPages: { value: signal(1) },
      totalRecords: { value: signal(0) },
      pageSize: { value: signal(10) },
    });
    expect(component.ariaLabel()).toBe("Governance records");
    expect(component.recordLabel()).toBe("records");
    expect(component.sortPath()).toBeNull();
    expect(component.sortDirection()).toBe("asc");
    expect(component.interactiveRows()).toBe(true);
    expect(component.appearance()).toBe("audit");
    expect(jest.spyOn(component.sortRequested, "emit")).toBeDefined();
    expect(jest.spyOn(component.rowOpened, "emit")).toBeDefined();
    expect(jest.spyOn(component.pageRequested, "emit")).toBeDefined();
  });

  it("projects operational issue inputs and retry output", () => {
    const component = create(OperationalIssueComponent, []);
    Object.defineProperty(component, "issue", {
      value: signal({
        title: "Unavailable",
        eyebrow: "SERVICE",
        reason: "Timeout",
        impact: "No data",
        code: "SERVICE_TIMEOUT",
        retryLabel: "Retry",
      }),
    });
    expect(component.model()).toEqual({
      severity: "error",
      title: "Unavailable",
      message: "SERVICE · Timeout",
      impact: "No data",
      code: "SERVICE_TIMEOUT",
    });
    expect(component.busy()).toBe(false);
    expect(jest.spyOn(component.retry, "emit")).toBeDefined();
  });

  it("projects governed record values and read-only fields", () => {
    const component = create(GovernedRecordViewComponent, []);
    Object.defineProperties(component, {
      status: { value: signal("PENDING_APPROVAL") },
      fields: { value: signal([{ key: "currency" }]) },
    });
    expect(component.displayStatus()).toBe("SUBMITTED");
    expect(component.readonlyFields()[0]?.props).toMatchObject({
      disabled: true,
      readonly: true,
      showPicker: false,
    });
    Object.defineProperty(component, "status", { value: signal("ACTIVE") });
    expect(component.displayStatus()).toBe("ACTIVE");
    expect(jest.spyOn(component.closed, "emit")).toBeDefined();
  });

  it("projects resolution failure inputs and retry output", () => {
    const component = create(ResolutionFailureComponent, []);
    Object.defineProperty(component, "failure", {
      value: signal({
        title: "Resolution failed",
        message: "No route",
        code: "NO_ROUTE",
        retryable: true,
      }),
    });
    expect(component.model()).toEqual({
      severity: "error",
      title: "Resolution failed",
      message: "No route",
      code: "NO_ROUTE",
    });
    expect(jest.spyOn(component.retry, "emit")).toBeDefined();
  });

  it("loads the runtime page-parameter schema constant", () => {
    expect(RESOLUTION_PAGE_SCHEMA_VERSION).toBe("1.0");
  });
});
