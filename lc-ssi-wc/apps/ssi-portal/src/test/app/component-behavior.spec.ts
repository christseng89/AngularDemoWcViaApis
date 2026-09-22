import { of, Subject, throwError } from "rxjs";

type TestSignal<T> = (() => T) & {
  set(value: T): void;
  update(updateValue: (current: T) => T): void;
};

function testSignal<T>(initial: T): TestSignal<T> {
  let current = initial;
  const read = (() => current) as TestSignal<T>;
  read.set = (value) => {
    current = value;
  };
  read.update = (updateValue) => {
    current = updateValue(current);
  };
  return read;
}

const documentToken = Symbol("DOCUMENT");
class ChangeDetectorRefToken {}
class HttpClientToken {}
class RouterToken {}
class NavigationStartEvent {
  constructor(
    public id: number,
    public url: string,
  ) {}
}
class NavigationEndEvent {
  constructor(
    public id: number,
    public url: string,
    public urlAfterRedirects: string,
  ) {}
}
class NavigationCancelEvent {
  constructor(public id: number) {}
}
class NavigationErrorEvent {
  constructor(public id: number) {}
}
class NavigationSkippedEvent {
  constructor(public id: number) {}
}
const routeGuardBridgeToken = Symbol("APP_ROUTE_GUARD_BRIDGE");
let routerEvents = new Subject<unknown>();
const fakeRouter = {
  get events() {
    return routerEvents;
  },
  navigateByUrl: jest.fn(async (_url: string) => true),
};
const fakeRouteGuardBridge = {
  register: jest.fn(),
  unregister: jest.fn(),
  consumeReleasedMakerWip: jest.fn((_id: number) => false),
  consumeDenied: jest.fn((_id: number) => false),
  markNavigationTerminated: jest.fn((_id: number) => undefined),
  isGuardPending: jest.fn((_id: number) => false),
};
let rejectHttp = false;
let nextResolutionResponse: unknown;
let nextResolutionError: unknown;
let nextConfirmationResponse: unknown;
let pendingResolutionResponse: Subject<unknown> | undefined;
let pendingSsiResponse: Subject<unknown> | undefined;
const testSsiReadStore = {
  settlementSsis: testSignal<readonly unknown[]>([]),
  counterparties: testSignal<readonly unknown[]>([]),
  publishSettlementSsis(rows: readonly unknown[]) {
    this.settlementSsis.set(rows);
  },
  publishCounterparties(parties: readonly unknown[]) {
    this.counterparties.set(parties);
  },
};
const fakeSsiShellBridge = {
  attach: jest.fn(),
  detach: jest.fn(),
  pendingApprovalCount: testSignal(0),
};

const fakeDocument = {
  defaultView: {
    location: { pathname: "/" },
    localStorage: { getItem: jest.fn(() => null), setItem: jest.fn() },
    matchMedia: jest.fn(() => ({ addEventListener: jest.fn() })),
    URL: {
      createObjectURL: jest.fn(() => "blob:test"),
      revokeObjectURL: jest.fn(),
    },
    setTimeout: jest.fn((callback: () => void) => callback()),
  },
  documentElement: {
    classList: { toggle: jest.fn() },
    dataset: {} as Record<string, string>,
  },
  body: { appendChild: jest.fn() },
  createElement: jest.fn(() => ({
    click: jest.fn(),
    remove: jest.fn(),
    hidden: false,
    href: "",
    download: "",
  })),
};
const fakeTheme = testSignal<"system" | "light" | "dark">("system");
const fakeThemeService = {
  theme: fakeTheme,
  setTheme: jest.fn((mode: "system" | "light" | "dark") => fakeTheme.set(mode)),
};

const fakeHttp = {
  get: jest.fn((url: string) => {
    if (rejectHttp) return throwError(() => new Error("service unavailable"));
    if (url.includes("swift-data-service.v1.json")) {
      return of({
        info: { title: "test", version: "1" },
        "x-standards-baseline": {},
        "x-ui-resources": [],
      });
    }
    if (url.includes("/reference/banks"))
      return of({
        items: [
          {
            bankServiceId: "BANK-SVC-BARC",
            bic: "BARCGB22",
            name: "Barclays",
            country: "GB",
            addressRef: "ADDR-BARC",
            standard: "BIC",
          },
        ],
        page: 1,
        pageSize: 5,
        total: 1,
        totalPages: 2,
      });
    if (url.includes("/reference/customers"))
      return of({ items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 });
    if (url.includes("/reference/counterparties")) return of({ items: [] });
    if (url.includes("/reference/countries"))
      return of({
        items: [
          {
            code: "US",
            name: "United States",
            standard: "ISO",
            status: "ACTIVE",
          },
        ],
      });
    if (url.includes("/reference/booking-branches"))
      return of({
        items: [
          {
            branchCode: "HK01",
            branchName: "Hong Kong",
            legalEntityCode: "HK01",
            legalEntityName: "Hong Kong",
            countryCode: "HK",
            status: "ACTIVE",
            validFrom: "2026-01-01",
            validTo: "9999-12-31",
          },
        ],
      });
    if (url.includes("/reference/clearing-systems"))
      return of({
        items: [
          {
            code: "T2",
            name: "T2",
            supportedCurrency: "EUR",
            settlementCountry: "DE",
            marketScope: "PAN_REGIONAL",
            eligibleCountries: ["DE"],
            settlementMarket: "T2",
            paymentServiceLevel: "HIGH_VALUE",
            schemeType: "RTGS",
            status: "ACTIVE",
            validFrom: "2026-01-01",
            validTo: "9999-12-31",
          },
        ],
      });
    if (url.includes("/reference/currencies"))
      return of([{ code: "USD", decimals: 2, standard: "ISO 4217" }]);
    if (url.includes("/rma-authorisations/message-type-policy"))
      return of({
        supportedMessageTypes: ["MT300", "pacs.009.001.08"],
        categories: [
          {
            categoryId: "SECURITY",
            displayName: "Security",
            displayOrder: 10,
            emptyStateText: "No Security messages",
          },
          {
            categoryId: "TRADE_FINANCE",
            displayName: "Trade Finance",
            displayOrder: 20,
            emptyStateText: "No Trade Finance messages",
          },
          {
            categoryId: "PAYMENT",
            displayName: "Payment",
            displayOrder: 30,
            emptyStateText: "No Payment messages",
          },
        ],
        items: [
          {
            messageType: "MT300",
            description: "Foreign Exchange Confirmation",
            categoryId: "SECURITY",
            directionApplicability: {
              inbound: { applicable: true },
              outbound: { applicable: true },
            },
          },
          {
            messageType: "pacs.009.001.08",
            description: "Financial Institution Credit Transfer",
            categoryId: "PAYMENT",
            directionApplicability: {
              inbound: { applicable: true },
              outbound: { applicable: true },
            },
          },
        ],
      });
    if (url.includes("/rma-authorisations/pair-state"))
      return of({
        ownBic: "DEMOHKHHXXX",
        counterpartyBic: "CHASUS33XXX",
        directions: { INBOUND: null, OUTBOUND: null },
      });
    if (url.includes("/rma-authorisations/message-types"))
      return of(["MT202", "pacs.009.001.08"]);
    if (url.includes("/settlements/message-index")) return of({ items: [] });
    if (url.endsWith("/nostro-accounts"))
      return of([
        {
          id: "NOSTRO-DEBIT",
          version: 4,
          status: "ACTIVE",
          ownLegalEntityId: "HK01",
          allowedBookingEntities: ["HK01"],
          accountServicerBic: "BARCGB22",
          currency: "USD",
          accountReference: "DEBIT-REF",
          maskedAccountRef: "DEMO-DEBIT",
          purpose: "SETTLEMENT",
          validFrom: "2026-01-01",
          validTo: "9999-12-31",
        },
        {
          id: "NOSTRO-CREDIT",
          version: 7,
          status: "ACTIVE",
          ownLegalEntityId: "HK01",
          allowedBookingEntities: ["HK01"],
          accountServicerBic: "BARCGB22",
          currency: "USD",
          accountReference: "CREDIT-REF",
          maskedAccountRef: "DEMO-CREDIT",
          purpose: "SETTLEMENT",
          validFrom: "2026-01-01",
          validTo: "9999-12-31",
        },
        {
          id: "NOSTRO-57A-CREDIT",
          version: 2,
          status: "ACTIVE",
          ownLegalEntityId: "HK01",
          allowedBookingEntities: ["HK01"],
          accountServicerBic: "CITIUS33",
          currency: "USD",
          accountReference: "CREDIT-AT-57A",
          maskedAccountRef: "DEMO-57A-CREDIT",
          purpose: "SETTLEMENT",
          validFrom: "2026-01-01",
          validTo: "9999-12-31",
        },
      ]);
    if (url.includes("/fin-resolution-catalogue")) return of({ items: [] });
    if (url.includes("/fin-controlled-fixtures"))
      return of({
        fixtureFamily: "MT347-SR2026-SSI",
        source: "CANONICAL_DATABASE",
        count: 1,
        candidates: [
          {
            id: "SSI-MT347-CONTROLLED-001",
            version: 1,
            bindingId: "FIX-MT300-001@v1",
            messageType: "MT300",
            businessFunction: "FX_CONFIRMATION",
            sequence: "B1",
            settlementLeg: "Amount Bought",
            counterpartyBic: "DEUTDEFF",
            currency: "USD",
            settlementMarket: "US_DOLLAR",
            bookingEntity: "HK01",
            effectiveFrom: "2026-01-01",
            effectiveTo: "9999-12-31",
            priority: 10,
            routeClass: "PRIMARY",
            demoData: true,
            sourceType: "SYNTHETIC_DEMO",
            accountRelationship: "AUTHENTICATED_RECEIVING_ROUTE",
            roleValues: { RECEIVERS_CORRESPONDENT: "DEUTDEFF" },
            identity: {
              ssi: { id: "SSI-MT347-CONTROLLED-001", version: 1 },
              applicability: { id: "APP-MT347-CONTROLLED-001", version: 1 },
            },
          },
        ],
      });
    if (url.includes("/health/audit-retention"))
      return of({
        status: "UP",
        onlineQueryDays: 7,
        archiveAfterDays: 14,
        archiveRetentionDays: 365,
        scheduleIntervalHours: 12,
      });
    if (url.endsWith("/ssis/summary"))
      return of({ currentOwn: 0, pendingApproval: 0, active: 0, archived: 0 });
    if (url.includes("/ssis/counterparty-coverage")) return of([]);
    if (url.includes("/ssis?")) return pendingSsiResponse ?? of([]);
    if (url.endsWith("/ssis")) return pendingSsiResponse ?? of([]);
    if (url.endsWith("/audit")) return of([]);
    return of([]);
  }),
  post: jest.fn((url: string, _body?: unknown) =>
    rejectHttp
      ? throwError(() => new Error("service unavailable"))
      : pendingResolutionResponse && url.endsWith("/settlements/resolve")
        ? pendingResolutionResponse
        : nextResolutionError !== undefined &&
            url.endsWith("/settlements/resolve")
          ? throwError(() => nextResolutionError)
          : nextResolutionResponse !== undefined &&
              url.endsWith("/settlements/resolve")
            ? of(nextResolutionResponse)
            : url.endsWith("/settlements/clearing-options")
              ? of({
                  items: [
                    {
                      code: "T2",
                      name: "T2",
                      supportedCurrency: "EUR",
                      settlementCountry: "DE",
                      marketScope: "PAN_REGIONAL",
                      eligibleCountries: ["DE"],
                      settlementMarket: "T2",
                      paymentServiceLevel: "HIGH_VALUE",
                      schemeType: "RTGS",
                      status: "ACTIVE",
                      validFrom: "2026-01-01",
                      validTo: "9999-12-31",
                    },
                  ],
                })
              : url.includes("/settlements/") && url.endsWith("/confirm")
                ? of(nextConfirmationResponse ?? {})
                : url.endsWith("/revise")
                  ? of({
                      id: "ROW-REVISION",
                      counterpartyId: "BANK-1",
                      scope: "REUSABLE",
                      status: "DRAFT",
                      maker: "maker.revision",
                      route: { currency: "USD", counterpartyType: "BANK" },
                      version: 2,
                    })
                  : of({ items: [] }),
  ),
  put: jest.fn(() =>
    rejectHttp ? throwError(() => new Error("service unavailable")) : of({}),
  ),
  patch: jest.fn(() =>
    rejectHttp ? throwError(() => new Error("service unavailable")) : of({}),
  ),
  delete: jest.fn(() =>
    rejectHttp ? throwError(() => new Error("service unavailable")) : of({}),
  ),
  request: jest.fn(() =>
    rejectHttp
      ? throwError(() => new Error("service unavailable"))
      : of({ id: "ROW-1" }),
  ),
};

jest.doMock("@angular/core", () => ({
  ChangeDetectionStrategy: { OnPush: "OnPush" },
  ChangeDetectorRef: ChangeDetectorRefToken,
  ElementRef: class {},
  Component:
    () =>
    <T>(target: T): T =>
      target,
  Injectable:
    () =>
    <T>(target: T): T =>
      target,
  InjectionToken: class {
    constructor(
      public description: string,
      _options?: unknown,
    ) {}
  },
  computed: <T>(compute: () => T): (() => T) => compute,
  inject: (token: unknown) => {
    if (token === documentToken) return fakeDocument;
    if (token === ChangeDetectorRefToken) return { detectChanges: jest.fn() };
    if (token === RouterToken) return fakeRouter;
    if (token === routeGuardBridgeToken) return fakeRouteGuardBridge;
    if ((token as { name?: string }).name === "ThemeService")
      return fakeThemeService;
    if ((token as { name?: string }).name === "SsiMaintenanceApiService")
      return new (token as new () => unknown)();
    if ((token as { name?: string }).name === "PaymentSettlementApiService")
      return new (token as new () => unknown)();
    if ((token as { name?: string }).name === "FinResolutionApiService")
      return new (token as new () => unknown)();
    if ((token as { name?: string }).name === "SsiSharedDetailPresenter")
      return new (token as new () => unknown)();
    if ((token as { name?: string }).name === "ReferenceLookupApiService")
      return new (token as new () => unknown)();
    if ((token as { name?: string }).name === "SwiftDataApiService")
      return new (token as new () => unknown)();
    if ((token as { name?: string }).name === "SwiftDataBankPicker")
      return new (token as new () => unknown)();
    if ((token as { name?: string }).name === "SwiftDataRmaSelection")
      return new (token as new () => unknown)();
    if ((token as { name?: string }).name === "SwiftDataRevisionSession")
      return new (token as new () => unknown)();
    if ((token as { name?: string }).name === "SwiftDataExportService")
      return new (token as new () => unknown)();
    if ((token as { name?: string }).name === "SwiftDataFieldMapper")
      return new (token as new () => unknown)();
    if ((token as { name?: string }).name === "SwiftDataIndexStore")
      return new (token as new () => unknown)();
    if ((token as { name?: string }).name === "SwiftDataEditorSession")
      return new (token as new () => unknown)();
    if (
      (token as { description?: string }).description ===
      "SSI_RESOLUTION_READ_PORT"
    )
      return testSsiReadStore;
    if ((token as { name?: string }).name === "SsiMaintenanceShellBridge")
      return fakeSsiShellBridge;
    return fakeHttp;
  },
  signal: testSignal,
  input: Object.assign(<T>(value: T) => testSignal(value), {
    required: <T>() => testSignal<T>(undefined as T),
  }),
  output: () => ({ emit: jest.fn() }),
  viewChild: () => () => undefined,
}));

jest.doMock("@angular/common/http", () => ({ HttpClient: HttpClientToken }));
jest.doMock("@angular/router", () => ({
  Router: RouterToken,
  RouterOutlet: class {},
  NavigationStart: NavigationStartEvent,
  NavigationEnd: NavigationEndEvent,
  NavigationCancel: NavigationCancelEvent,
  NavigationError: NavigationErrorEvent,
  NavigationSkipped: NavigationSkippedEvent,
}));
jest.doMock("../../app/app-route-guard", () => ({
  APP_ROUTE_GUARD_BRIDGE: routeGuardBridgeToken,
}));
jest.doMock("@angular/common", () => ({
  DOCUMENT: documentToken,
  JsonPipe: class {},
}));
jest.doMock("@angular/forms", () => ({
  AbstractControl: class {},
  FormGroup: class {
    reset = jest.fn();
    markAllAsTouched = jest.fn();
    get = jest.fn(() => undefined);
    valid = true;
  },
  ReactiveFormsModule: class {},
}));
jest.doMock("@ngx-formly/core", () => ({
  FieldType: class {
    props: Record<string, unknown> = {};
    field: { props?: Record<string, unknown> } = {};
  },
  FormlyAttributes: class {},
  FormlyForm: class {},
}));
jest.doMock(
  "../../app/resolution-workbench/page-definition-index-workspace.component",
  () => ({ PageDefinitionIndexWorkspaceComponent: class {} }),
);

// Preserve the legacy characterization assertions against the route-owned
// Session. This adapter exists only in tests; AppComponent has no SSI facade.
jest.doMock("../../app/app.component", () => {
  const actual = jest.requireActual("../../app/app.component");
  const { SsiMaintenanceSession } = jest.requireActual(
    "../../app/ssi-maintenance-feature/ssi-maintenance-session",
  );
  const { SsiMaintenanceApiService } = jest.requireActual(
    "../../app/ssi-maintenance-api.service",
  );
  const { ReferenceLookupApiService } = jest.requireActual(
    "../../app/reference-lookup-api.service",
  );
  const { projectSettlementSsis, projectResolutionCounterparties } =
    jest.requireActual(
      "../../app/ssi-maintenance-feature/ssi-resolution-read-projection",
    );
  return {
    ...actual,
    AppComponent: class AppComponent extends actual.AppComponent {
      constructor() {
        super();
        fakeSsiShellBridge.pendingApprovalCount.set(0);
        testSsiReadStore.settlementSsis.set([]);
        testSsiReadStore.counterparties.set([]);
        const shellPort = this.maintenanceShellPort();
        shellPort.acceptPendingApprovalCount = (count: number) =>
          fakeSsiShellBridge.pendingApprovalCount.set(count);
        const session = new SsiMaintenanceSession(
          new SsiMaintenanceApiService(),
          (notice: unknown) => this.notice.set(notice),
          shellPort,
          new ReferenceLookupApiService(),
          testSsiReadStore,
        );
        const originalRowsSet = session.index.rows.set.bind(session.index.rows);
        session.index.rows.set = (rows: unknown) => {
          originalRowsSet(rows);
          testSsiReadStore.publishSettlementSsis(projectSettlementSsis(rows));
        };
        const originalDirectorySet =
          session.index.counterpartyDirectory.set.bind(
            session.index.counterpartyDirectory,
          );
        session.index.counterpartyDirectory.set = (parties: unknown) => {
          originalDirectorySet(parties);
          testSsiReadStore.publishCounterparties(
            projectResolutionCounterparties(parties),
          );
        };
        const originalViewSet = this.view.set.bind(this.view);
        this.view.set = (view: string) => {
          originalViewSet(view);
          if (view === "dashboard" || view === "maker") session.activate(view);
        };
        this.onSettingsActivated({
          maintenanceWipPort: session,
          refresh: () => session.refreshIndex(),
        });
        const aliases: Record<string, unknown> = {
          maintenanceSession: session,
          maintenanceIndex: session.index,
          makerState: session.maker,
          model: undefined,
          loadMaintenanceRoute: (view: "dashboard" | "maker") =>
            session.load(view),
          create: () => session.save(),
          refreshMaintenanceIndex: () => session.refreshIndex(),
          onLateMakerWipRelease: (id: number) => {
            fakeRouteGuardBridge.consumeReleasedMakerWip(id);
            session.onLateMakerWipRelease();
          },
        };
        const proxy = new Proxy(this, {
          get(target, key, receiver) {
            if (key === "model") return session.maker.model;
            if (typeof key === "string" && key in aliases) return aliases[key];
            if (typeof key === "string" && !(key in target)) {
              const owner =
                key in session
                  ? session
                  : key in session.index
                    ? session.index
                    : session.maker;
              const value = owner[key];
              return typeof value === "function" && !value.set
                ? value.bind(owner)
                : value;
            }
            return Reflect.get(target, key, receiver);
          },
          set(target, key, value, receiver) {
            if (key === "model") {
              session.maker.model = value;
              return true;
            }
            return Reflect.set(target, key, value, receiver);
          },
        });
        return proxy;
      }
    },
  };
});

describe("portal component behavior", () => {
  it("routes Maker to Dashboard through the WIP guard before committing view state", async () => {
    routerEvents = new Subject<unknown>();
    fakeRouter.navigateByUrl.mockClear();
    fakeDocument.defaultView.localStorage.setItem.mockClear();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    component.view.set("maker");
    component.editingId.set("SSI-WIP-DASHBOARD");
    component.revisionSource.set({ id: "SSI-WIP-DASHBOARD" } as never);

    component.navigate("dashboard");
    expect(fakeRouter.navigateByUrl).toHaveBeenCalledWith("/dashboard");
    expect(component.view()).toBe("maker");
    expect(
      fakeDocument.defaultView.localStorage.setItem,
    ).not.toHaveBeenCalled();

    routerEvents.next(new NavigationStartEvent(401, "/dashboard"));
    fakeRouteGuardBridge.consumeDenied.mockReturnValueOnce(true);
    routerEvents.next(new NavigationCancelEvent(401));
    expect(component.view()).toBe("maker");
    expect(component.editingId()).toBe("SSI-WIP-DASHBOARD");
    component.ngOnDestroy();
  });

  it.each([
    ["/dashboard", "dashboard"],
    ["/audit", "audit"],
    ["/checker", "checker"],
  ] as const)(
    "takes direct %s URL as authoritative without shell business preloads",
    async (path, target) => {
      routerEvents = new Subject<unknown>();
      fakeDocument.defaultView.location.pathname = path;
      fakeHttp.get.mockClear();
      const { AppComponent } = await import("../../app/app.component");
      const component = new AppComponent();
      expect(component.view()).toBe(target);
      component.ngOnInit();
      expect(fakeHttp.get).not.toHaveBeenCalled();
      component.ngOnDestroy();
      fakeDocument.defaultView.location.pathname = "/";
    },
  );

  it("canonicalizes a saved Dashboard on the legacy root before feature loading", async () => {
    routerEvents = new Subject<unknown>();
    fakeDocument.defaultView.location.pathname = "/";
    fakeDocument.defaultView.localStorage.getItem.mockImplementation(
      (key: string) => (key === "ssi-active-view" ? "dashboard" : null),
    );
    fakeRouter.navigateByUrl.mockClear();
    fakeHttp.get.mockClear();
    try {
      const { AppComponent } = await import("../../app/app.component");
      const component = new AppComponent();
      expect(component.view()).toBe("dashboard");
      component.ngOnInit();
      expect(fakeRouter.navigateByUrl).toHaveBeenCalledWith("/dashboard");
      expect(fakeHttp.get).not.toHaveBeenCalled();
      component.ngOnDestroy();
    } finally {
      fakeDocument.defaultView.localStorage.getItem.mockImplementation(
        () => null,
      );
    }
  });

  it("does not commit Settings until Router succeeds and preserves Maker WIP on guard denial", async () => {
    routerEvents = new Subject<unknown>();
    fakeRouter.navigateByUrl.mockClear();
    fakeDocument.defaultView.localStorage.setItem.mockClear();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    component.view.set("maker");
    component.editingId.set("SSI-WIP-1");
    component.revisionSource.set({ id: "SSI-WIP-1" } as never);
    component.navigate("settings");
    expect(fakeRouter.navigateByUrl).toHaveBeenCalledWith("/settings");
    expect(component.view()).toBe("maker");
    expect(
      fakeDocument.defaultView.localStorage.setItem,
    ).not.toHaveBeenCalled();
    routerEvents.next(new NavigationStartEvent(101, "/settings"));
    fakeRouteGuardBridge.consumeDenied.mockReturnValueOnce(true);
    routerEvents.next(new NavigationCancelEvent(101));
    expect(component.view()).toBe("maker");
    expect(component.editingId()).toBe("SSI-WIP-1");
    expect(component.routeLoading()).toBe(false);
    component.ngOnDestroy();
  });

  it("does not bypass a pending route guard through a second sidebar click", async () => {
    routerEvents = new Subject<unknown>();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    component.view.set("maker");
    component.navigate("settings");
    component.navigate("swiftdata");
    expect(component.view()).toBe("maker");
    component.ngOnDestroy();
  });

  it("takes direct Settings URL as authoritative and avoids eager business API load", async () => {
    routerEvents = new Subject<unknown>();
    fakeDocument.defaultView.location.pathname = "/settings";
    fakeHttp.get.mockClear();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    expect(component.view()).toBe("settings");
    component.ngOnInit();
    expect(fakeHttp.get).not.toHaveBeenCalled();
    routerEvents.next(new NavigationStartEvent(103, "/"));
    routerEvents.next(new NavigationEndEvent(103, "/", "/"));
    expect(component.view()).toBe("swiftdata");
    component.ngOnDestroy();
    fakeDocument.defaultView.location.pathname = "/";
  });

  it.each([
    ["/resolution/payment", "resolver"],
    ["/resolution/treasury", "treasury"],
    ["/resolution/trade-finance", "tradefinance"],
  ] as const)(
    "takes direct %s URL as authoritative without parent business preloads",
    async (path, target) => {
      routerEvents = new Subject<unknown>();
      fakeDocument.defaultView.location.pathname = path;
      fakeHttp.get.mockClear();
      const { AppComponent } = await import("../../app/app.component");
      const component = new AppComponent();
      expect(component.view()).toBe(target);
      component.ngOnInit();
      expect(fakeHttp.get).not.toHaveBeenCalled();
      component.ngOnDestroy();
      fakeDocument.defaultView.location.pathname = "/";
    },
  );

  it("waits for the guard before committing Audit navigation", async () => {
    routerEvents = new Subject<unknown>();
    fakeRouter.navigateByUrl.mockClear();
    fakeDocument.defaultView.localStorage.setItem.mockClear();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    component.view.set("maker");
    component.navigate("audit");
    expect(fakeRouter.navigateByUrl).toHaveBeenCalledWith("/audit");
    expect(component.view()).toBe("maker");
    expect(
      fakeDocument.defaultView.localStorage.setItem,
    ).not.toHaveBeenCalled();
    routerEvents.next(new NavigationStartEvent(315, "/audit"));
    fakeRouteGuardBridge.consumeDenied.mockReturnValueOnce(true);
    routerEvents.next(new NavigationCancelEvent(315));
    expect(component.view()).toBe("maker");
    component.ngOnDestroy();
  });

  it("waits for the existing guard before committing Checker navigation", async () => {
    routerEvents = new Subject<unknown>();
    fakeRouter.navigateByUrl.mockClear();
    fakeDocument.defaultView.localStorage.setItem.mockClear();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    component.view.set("maker");
    component.navigate("checker");
    expect(fakeRouter.navigateByUrl).toHaveBeenCalledWith("/checker");
    expect(component.view()).toBe("maker");
    expect(
      fakeDocument.defaultView.localStorage.setItem,
    ).not.toHaveBeenCalled();
    routerEvents.next(new NavigationStartEvent(316, "/checker"));
    fakeRouteGuardBridge.consumeDenied.mockReturnValueOnce(true);
    routerEvents.next(new NavigationCancelEvent(316));
    expect(component.view()).toBe("maker");
    component.ngOnDestroy();
  });

  it("waits for the existing guard before committing a Resolution route and restores the legacy view on history back", async () => {
    routerEvents = new Subject<unknown>();
    fakeRouter.navigateByUrl.mockClear();
    fakeDocument.defaultView.localStorage.setItem.mockClear();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    component.view.set("maker");
    component.navigate("treasury");
    expect(fakeRouter.navigateByUrl).toHaveBeenCalledWith(
      "/resolution/treasury",
    );
    expect(component.view()).toBe("maker");
    expect(
      fakeDocument.defaultView.localStorage.setItem,
    ).not.toHaveBeenCalled();
    routerEvents.next(new NavigationStartEvent(301, "/resolution/treasury"));
    routerEvents.next(
      new NavigationEndEvent(
        301,
        "/resolution/treasury",
        "/resolution/treasury",
      ),
    );
    expect(component.view()).toBe("treasury");
    routerEvents.next(new NavigationStartEvent(302, "/"));
    routerEvents.next(new NavigationEndEvent(302, "/", "/"));
    expect(component.view()).toBe("maker");
    component.ngOnDestroy();
  });

  it("keeps Maker WIP when the guarded Resolution route is denied", async () => {
    routerEvents = new Subject<unknown>();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    component.view.set("maker");
    component.editingId.set("SSI-WIP-RESOLUTION");
    component.revisionSource.set({ id: "SSI-WIP-RESOLUTION" } as never);
    component.navigate("resolver");
    expect(component.view()).toBe("maker");
    routerEvents.next(new NavigationStartEvent(303, "/resolution/payment"));
    fakeRouteGuardBridge.consumeDenied.mockReturnValueOnce(true);
    routerEvents.next(new NavigationCancelEvent(303));
    expect(component.view()).toBe("maker");
    expect(component.editingId()).toBe("SSI-WIP-RESOLUTION");
    expect(component.routeLoading()).toBe(false);
    component.ngOnDestroy();
  });

  it("closes an invalid Maker editor if the route fails after WIP release", async () => {
    routerEvents = new Subject<unknown>();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    component.view.set("maker");
    component.navigate("settings");
    routerEvents.next(new NavigationStartEvent(102, "/settings"));
    fakeRouteGuardBridge.consumeReleasedMakerWip.mockReturnValueOnce(true);
    routerEvents.next(new NavigationErrorEvent(102));
    expect(component.view()).toBe("dashboard");
    expect(component.form.reset).toHaveBeenCalled();
    expect(component.notice()?.text).toContain("WIP 已釋放");
    component.ngOnDestroy();
  });

  it("clears route loading on NavigationSkipped", async () => {
    routerEvents = new Subject<unknown>();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    routerEvents.next(new NavigationStartEvent(105, "/settings"));
    routerEvents.next(new NavigationSkippedEvent(105));
    expect(component.routeLoading()).toBe(false);
    component.ngOnDestroy();
  });

  it("returns to the actual source workbench after Settings history navigation", async () => {
    routerEvents = new Subject<unknown>();
    fakeRouter.navigateByUrl.mockClear();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    component.view.set("maker");
    component.navigate("settings");
    routerEvents.next(new NavigationStartEvent(106, "/settings"));
    routerEvents.next(new NavigationEndEvent(106, "/settings", "/settings"));
    expect(component.view()).toBe("settings");
    routerEvents.next(new NavigationStartEvent(107, "/"));
    routerEvents.next(new NavigationEndEvent(107, "/", "/"));
    expect(component.view()).toBe("maker");
    expect(fakeRouter.navigateByUrl).toHaveBeenCalledWith("/maker", {
      replaceUrl: true,
    });
    component.ngOnDestroy();
  });

  it("converges safely when WIP release finishes after NavigationCancel", async () => {
    routerEvents = new Subject<unknown>();
    fakeRouter.navigateByUrl.mockClear();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    component.view.set("maker");
    component.editingId.set("SSI-WIP-LATE");
    component.revisionSource.set({ id: "SSI-WIP-LATE" } as never);
    component.navigate("settings");
    routerEvents.next(new NavigationStartEvent(104, "/settings"));
    fakeRouteGuardBridge.isGuardPending.mockReturnValueOnce(true);
    routerEvents.next(new NavigationCancelEvent(104));
    expect(component.view()).toBe("maker");
    component.revisionSource.set(null);
    component.editingId.set(null);
    component.onLateMakerWipRelease(104);
    expect(component.view()).toBe("dashboard");
    expect(fakeRouter.navigateByUrl).toHaveBeenCalledWith("/dashboard", {
      replaceUrl: true,
    });
    expect(component.form.reset).toHaveBeenCalled();
    expect(component.notice()?.text).toContain("WIP 隨後釋放");
    component.ngOnDestroy();
  });

  it("couples delayed HTTP WIP cleanup to cancellation without stale editor", async () => {
    routerEvents = new Subject<unknown>();
    let navigationId = 204;
    const { AppRouteGuardBridge } = jest.requireActual<
      typeof import("./app-route-guard")
    >("../../app/app-route-guard");
    const bridge = new AppRouteGuardBridge(() => navigationId);
    fakeRouteGuardBridge.register.mockImplementation((host) =>
      bridge.register(host),
    );
    fakeRouteGuardBridge.unregister.mockImplementation((host) =>
      bridge.unregister(host),
    );
    fakeRouteGuardBridge.consumeReleasedMakerWip.mockImplementation((id) =>
      bridge.consumeReleasedMakerWip(id),
    );
    fakeRouteGuardBridge.consumeDenied.mockImplementation((id) =>
      bridge.consumeDenied(id),
    );
    fakeRouteGuardBridge.isGuardPending.mockImplementation((id) =>
      bridge.isGuardPending(id),
    );
    fakeRouteGuardBridge.markNavigationTerminated.mockImplementation((id) =>
      bridge.markNavigationTerminated(id),
    );
    const cleanup = new Subject<unknown>();
    fakeHttp.post.mockImplementationOnce(() => cleanup);
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    try {
      component.view.set("maker");
      component.editingId.set("SSI-WIP-RACE");
      component.revisionSource.set({ id: "SSI-WIP-RACE" } as never);
      routerEvents.next(new NavigationStartEvent(204, "/settings"));
      const activation = bridge.canActivate();
      routerEvents.next(new NavigationCancelEvent(204));
      navigationId = 205;
      cleanup.next({});
      cleanup.complete();
      expect(await activation).toBe(true);
      expect(component.view()).toBe("dashboard");
      expect(component.notice()?.text).toContain("WIP 隨後釋放");
      expect(bridge.consumeReleasedMakerWip(205)).toBe(false);
    } finally {
      // Consume an unused one-shot HTTP override on the RED baseline so it
      // cannot bleed into an unrelated pre-existing test.
      fakeHttp.post("test");
      fakeHttp.post.mockClear();
      component.ngOnDestroy?.();
      fakeRouteGuardBridge.register.mockImplementation(() => undefined);
      fakeRouteGuardBridge.unregister.mockImplementation(() => undefined);
      fakeRouteGuardBridge.consumeReleasedMakerWip.mockImplementation(
        () => false,
      );
      fakeRouteGuardBridge.consumeDenied.mockImplementation(() => false);
      fakeRouteGuardBridge.isGuardPending.mockImplementation(() => false);
      fakeRouteGuardBridge.markNavigationTerminated.mockImplementation(
        () => undefined,
      );
    }
  });

  it("keeps Maker WIP and form when deferred server cleanup rejects", async () => {
    routerEvents = new Subject<unknown>();
    const { AppRouteGuardBridge } = jest.requireActual<
      typeof import("./app-route-guard")
    >("../../app/app-route-guard");
    const bridge = new AppRouteGuardBridge(() => 211);
    fakeRouteGuardBridge.register.mockImplementation((host) =>
      bridge.register(host),
    );
    fakeRouteGuardBridge.unregister.mockImplementation((host) =>
      bridge.unregister(host),
    );
    fakeRouteGuardBridge.consumeReleasedMakerWip.mockImplementation((id) =>
      bridge.consumeReleasedMakerWip(id),
    );
    fakeRouteGuardBridge.consumeDenied.mockImplementation((id) =>
      bridge.consumeDenied(id),
    );
    fakeRouteGuardBridge.isGuardPending.mockImplementation((id) =>
      bridge.isGuardPending(id),
    );
    fakeRouteGuardBridge.markNavigationTerminated.mockImplementation((id) =>
      bridge.markNavigationTerminated(id),
    );
    const cleanup = new Subject<unknown>();
    fakeHttp.post.mockImplementationOnce(() => cleanup);
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    try {
      component.view.set("maker");
      component.editingId.set("SSI-WIP-REJECT");
      component.revisionSource.set({ id: "SSI-WIP-REJECT" } as never);
      routerEvents.next(new NavigationStartEvent(211, "/settings"));
      const activation = bridge.canActivate();
      cleanup.error(new Error("server rejected"));
      expect(await activation).toBe(false);
      routerEvents.next(new NavigationCancelEvent(211));
      expect(component.view()).toBe("maker");
      expect(component.editingId()).toBe("SSI-WIP-REJECT");
      expect(component.form.reset).not.toHaveBeenCalled();
      expect(bridge.consumeReleasedMakerWip(211)).toBe(false);
    } finally {
      fakeHttp.post("test");
      fakeHttp.post.mockClear();
      component.ngOnDestroy();
      fakeRouteGuardBridge.register.mockImplementation(() => undefined);
      fakeRouteGuardBridge.unregister.mockImplementation(() => undefined);
      fakeRouteGuardBridge.consumeReleasedMakerWip.mockImplementation(
        () => false,
      );
      fakeRouteGuardBridge.consumeDenied.mockImplementation(() => false);
      fakeRouteGuardBridge.isGuardPending.mockImplementation(() => false);
      fakeRouteGuardBridge.markNavigationTerminated.mockImplementation(
        () => undefined,
      );
    }
  });

  it("tears down the Settings reload output subscription on deactivation", async () => {
    routerEvents = new Subject<unknown>();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    const reload = new Subject<void>();
    const reloadSpy = jest
      .spyOn(component, "refreshAfterDevelopmentReload")
      .mockResolvedValue();
    component.onSettingsActivated({ dataReloaded: reload });
    reload.next();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    component.onSettingsDeactivated();
    reload.next();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    component.ngOnDestroy();
  });

  it("keeps Settings reload notification without preloading unentered workspaces", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    component.view.set("settings");
    fakeHttp.get.mockClear();
    fakeHttp.post.mockClear();

    await component.refreshAfterDevelopmentReload();

    expect(component.notice()?.text).toBe(
      "Development Test Data 已重新載入；所有工作區資料已更新。",
    );
    expect(fakeHttp.get).not.toHaveBeenCalled();
    expect(fakeHttp.post).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it("keeps an active Audit route's Currency options in sync with parent refresh", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    const setCurrencyOptions = jest.fn();
    component.onSettingsActivated({ setCurrencyOptions });
    expect(setCurrencyOptions).toHaveBeenCalledWith([]);
    await component.detail.loadCurrencies();
    expect(setCurrencyOptions).toHaveBeenLastCalledWith([
      { code: "USD", decimals: 2, standard: "ISO 4217" },
    ]);
    component.onSettingsDeactivated();
    setCurrencyOptions.mockClear();
    await component.detail.loadCurrencies();
    expect(setCurrencyOptions).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it("forwards Maintenance Currency updates to an active Audit route", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    const setCurrencyOptions = jest.fn();
    component.onSettingsActivated({ setCurrencyOptions });
    setCurrencyOptions.mockClear();

    component
      .maintenanceShellPort()
      .acceptCurrencies([{ code: "USD", decimals: 2, standard: "ISO 4217" }]);

    expect(setCurrencyOptions).toHaveBeenCalledWith([
      { code: "USD", decimals: 2, standard: "ISO 4217" },
    ]);
    component.ngOnDestroy();
  });

  it("opens Audit SSI snapshots synchronously and does not reopen them after tab close", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    const ssiDetailRequested = new Subject<unknown>();
    const tabChanged = new Subject<void>();
    const row = {
      id: "SSI-AUDIT-1",
      counterpartyId: "BANK-1",
      scope: "STANDING",
      status: "ACTIVE",
      maker: "maker.demo",
      route: { currency: "USD" },
      version: 1,
    };
    fakeHttp.get.mockClear();
    component.onSettingsActivated({ ssiDetailRequested, tabChanged });

    ssiDetailRequested.next(row);
    expect(component.detail.target()).toBe(row);
    tabChanged.next();
    await Promise.resolve();
    expect(component.detail.target()).toBeNull();
    expect(fakeHttp.get).not.toHaveBeenCalled();
    component.onSettingsDeactivated();
    ssiDetailRequested.next(row);
    expect(component.detail.target()).toBeNull();
    component.ngOnDestroy();
  });

  it("keeps Checker decisions behind the active route port and closes the shared detail only on success", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    const row = {
      id: "SSI-PENDING-1",
      counterpartyId: "BANK-1",
      scope: "STANDING",
      status: "PENDING_APPROVAL",
      maker: "maker.demo",
      route: { currency: "USD" },
      version: 1,
    };
    const checkerRoute = {
      canDeactivate: async () => true,
      refresh: async () => undefined,
      decisionCount: 0,
      async decide() {
        this.decisionCount += 1;
        return true;
      },
    };
    const decide = jest.spyOn(checkerRoute, "decide");
    component.onSettingsActivated(checkerRoute);
    component.detail.target.set(row);
    component.detail.checkerRejectReason.set("bad");

    await component.detail.decide(row, "reject");
    expect(decide).not.toHaveBeenCalled();
    expect(component.detail.target()).toBe(row);
    expect(component.notice()?.kind).toBe("warning");

    component.detail.checkerRejectReason.set("wrong account");
    await component.detail.decide(row, "reject");
    expect(decide).toHaveBeenCalledWith(row, "reject", "wrong account");
    expect(checkerRoute.decisionCount).toBe(1);
    expect(component.detail.target()).toBeNull();
    expect(component.notice()?.kind).toBe("info");
    component.ngOnDestroy();
  });

  it("does not eagerly request parent workspace data or submit settlement POSTs during application startup", async () => {
    fakeHttp.get.mockClear();
    fakeHttp.post.mockClear();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();

    component.ngOnInit();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(fakeHttp.get).not.toHaveBeenCalled();
    expect(
      fakeHttp.post.mock.calls.filter(([url]) =>
        String(url).includes("/settlements/"),
      ),
    ).toEqual([]);
  });

  it("does not download the full SSI register when opening resolution indexes", async () => {
    routerEvents = new Subject<unknown>();
    fakeHttp.get.mockClear();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();

    component.navigate("resolver");
    routerEvents.next(new NavigationStartEvent(311, "/resolution/payment"));
    routerEvents.next(
      new NavigationEndEvent(311, "/resolution/payment", "/resolution/payment"),
    );
    component.navigate("tradefinance");
    routerEvents.next(
      new NavigationStartEvent(312, "/resolution/trade-finance"),
    );
    routerEvents.next(
      new NavigationEndEvent(
        312,
        "/resolution/trade-finance",
        "/resolution/trade-finance",
      ),
    );

    expect(
      fakeHttp.get.mock.calls.filter(([url]) =>
        String(url).includes("/api/ssis?"),
      ),
    ).toHaveLength(0);

    component.navigate("dashboard");
    routerEvents.next(new NavigationStartEvent(313, "/dashboard"));
    routerEvents.next(new NavigationEndEvent(313, "/dashboard", "/dashboard"));
    await component.loadMaintenanceRoute("dashboard");

    expect(
      fakeHttp.get.mock.calls.filter(([url]) =>
        String(url).includes("/api/ssis?"),
      ),
    ).toHaveLength(1);
    component.ngOnDestroy();
  });

  it.each([
    "resolver",
    "treasury",
    "tradefinance",
    "settings",
    "audit",
  ] as const)(
    "delegates %s shell refresh to its lazy route without loading SSI Maintenance",
    async (view) => {
      const { AppComponent } = await import("../../app/app.component");
      const component = new AppComponent();
      const routeRefresh = jest.fn().mockResolvedValue(undefined);
      component.view.set(view);
      component.onSettingsActivated({ refresh: routeRefresh });
      fakeHttp.get.mockClear();

      await component.refresh();

      expect(routeRefresh).toHaveBeenCalledTimes(1);
      expect(fakeHttp.get).not.toHaveBeenCalled();
      component.onSettingsDeactivated();
      component.ngOnDestroy();
    },
  );

  it("revalidates SSI rows after visiting the lazy Checker route", async () => {
    routerEvents = new Subject<unknown>();
    fakeHttp.get.mockClear();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();

    component.navigate("dashboard");
    routerEvents.next(new NavigationStartEvent(317, "/dashboard"));
    routerEvents.next(new NavigationEndEvent(317, "/dashboard", "/dashboard"));
    await component.loadMaintenanceRoute("dashboard");
    component.navigate("checker");
    expect(fakeRouter.navigateByUrl).toHaveBeenCalledWith("/checker");
    routerEvents.next(new NavigationStartEvent(318, "/checker"));
    routerEvents.next(new NavigationEndEvent(318, "/checker", "/checker"));
    component.navigate("dashboard");
    routerEvents.next(new NavigationStartEvent(319, "/dashboard"));
    routerEvents.next(new NavigationEndEvent(319, "/dashboard", "/dashboard"));
    await component.loadMaintenanceRoute("dashboard");

    expect(
      fakeHttp.get.mock.calls.filter(([url]) =>
        String(url).includes("/api/ssis?"),
      ),
    ).toHaveLength(2);
  });

  it("asks routed Checker maintenance to release WIP before navigation", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    const canDeactivate = jest.fn().mockResolvedValue(false);
    component.onSettingsActivated({
      canDeactivate,
      refresh: jest.fn().mockResolvedValue(undefined),
      decide: jest.fn().mockResolvedValue(true),
    });

    expect(await component.canDeactivate()).toBe(false);
    expect(canDeactivate).toHaveBeenCalledTimes(1);
    component.onSettingsDeactivated();
    component.ngOnDestroy();
  });

  it("asks the lazy SWIFT Data route to release WIP and denies navigation when it fails", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    const canDeactivate = jest.fn().mockResolvedValue(false);
    component.onSettingsActivated({
      canDeactivate,
      refresh: jest.fn().mockResolvedValue(undefined),
    });

    expect(await component.canDeactivate("/settings")).toBe(false);
    expect(canDeactivate).toHaveBeenCalledTimes(1);
    component.onSettingsDeactivated();
    component.ngOnDestroy();
  });

  it("releases SSI WIP before route navigation and fails closed on release error", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const revision = {
      id: "SSI-WIP-1",
      counterpartyId: "BANK-1",
      scope: "STANDING",
      status: "ACTIVE",
      maker: "maker.revision",
      route: { currency: "USD" },
      version: 1,
    } as const;

    const successful = new AppComponent();
    successful.view.set("maker");
    successful.editingId.set(revision.id);
    successful.revisionSource.set(revision);
    const successfulPosts = fakeHttp.post.mock.calls.length;
    const [firstSuccess, secondSuccess] = await Promise.all([
      successful.canDeactivate(),
      successful.canDeactivate(),
    ]);
    expect([firstSuccess, secondSuccess]).toEqual([true, true]);
    expect(fakeHttp.post.mock.calls.length - successfulPosts).toBe(1);
    expect(successful.editingId()).toBeNull();

    const blocked = new AppComponent();
    blocked.view.set("maker");
    blocked.editingId.set(revision.id);
    blocked.revisionSource.set(revision);
    rejectHttp = true;
    try {
      const failedPosts = fakeHttp.post.mock.calls.length;
      const [firstFailure, secondFailure] = await Promise.all([
        blocked.canDeactivate(),
        blocked.canDeactivate(),
      ]);
      expect([firstFailure, secondFailure]).toEqual([false, false]);
      expect(fakeHttp.post.mock.calls.length - failedPosts).toBe(1);
      expect(blocked.editingId()).toBe(revision.id);
      expect(blocked.notice()?.text).toContain("In Progress");
    } finally {
      rejectHttp = false;
    }
  });

  it("deduplicates concurrent SWIFT Data WIP release attempts", async () => {
    const { SwiftDataCrudComponent } =
      await import("../../app/swift-data-crud.component");
    const component = new SwiftDataCrudComponent();
    component.contract.set({
      info: { title: "test", version: "1" },
      "x-standards-baseline": {},
      "x-ui-resources": [
        {
          id: "rma",
          label: "RMA",
          endpoint: "rma-authorisations",
          description: "RMA",
          columns: [],
          fields: [],
          "x-lifecycle": [],
        },
      ],
    } as never);
    component.revision.reservationId.set("RMA-WIP-1");
    const deletes = fakeHttp.delete.mock.calls.length;
    const [first, second] = await Promise.all([
      component.canDeactivate(),
      component.canDeactivate(),
    ]);
    expect([first, second]).toEqual([true, true]);
    expect(fakeHttp.delete.mock.calls.length - deletes).toBe(1);
  });

  it("keeps the SWIFT Data editor and reservation open when close cannot release WIP", async () => {
    const { SwiftDataCrudComponent } =
      await import("../../app/swift-data-crud.component");
    const component = new SwiftDataCrudComponent();
    component.contract.set({
      info: { title: "test", version: "1" },
      "x-standards-baseline": {},
      "x-ui-resources": [
        {
          id: "rma",
          label: "RMA",
          endpoint: "rma-authorisations",
          description: "RMA",
          columns: [],
          fields: [],
          "x-lifecycle": [],
        },
      ],
    } as never);
    component.revision.reservationId.set("RMA-WIP-1");
    component.formVisible.set(true);
    rejectHttp = true;
    try {
      await component.cancelWork();
      expect(component.formVisible()).toBe(true);
      expect(component.revision.reservationId()).toBe("RMA-WIP-1");
      expect(component.notice()?.kind).toBe("error");
    } finally {
      rejectHttp = false;
    }
  });

  it("releases the original SWIFT Data WIP before switching resource tabs and stays put on failure", async () => {
    const { SwiftDataCrudComponent } =
      await import("../../app/swift-data-crud.component");
    const component = new SwiftDataCrudComponent();
    component.contract.set({
      info: { title: "test", version: "1" },
      "x-standards-baseline": {},
      "x-ui-resources": [
        {
          id: "rma",
          label: "RMA",
          endpoint: "rma-authorisations",
          description: "RMA",
          columns: [],
          fields: [],
          "x-lifecycle": [],
        },
        {
          id: "entity",
          label: "Entity",
          endpoint: "entities",
          description: "Entity",
          columns: [],
          fields: [],
          "x-lifecycle": [],
        },
      ],
    } as never);
    component.revision.reservationId.set("RMA-WIP-1");
    component.formVisible.set(true);
    const deletes = fakeHttp.delete.mock.calls.length;
    rejectHttp = true;
    try {
      await component.chooseResource("entity");
      expect(component.resourceId()).toBe("rma");
      expect(component.formVisible()).toBe(true);
      expect(component.revision.reservationId()).toBe("RMA-WIP-1");
      expect(fakeHttp.delete.mock.calls.length - deletes).toBe(1);
      expect(fakeHttp.delete.mock.calls[deletes][0]).toContain(
        "/rma-authorisations/RMA-WIP-1",
      );
    } finally {
      rejectHttp = false;
    }
    await component.chooseResource("entity");
    expect(component.resourceId()).toBe("entity");
    expect(component.revision.reservationId()).toBeNull();
    expect(fakeHttp.delete.mock.calls[deletes + 1][0]).toContain(
      "/rma-authorisations/RMA-WIP-1",
    );
  });

  it("clears a stale global notice when navigation provides its own page-level status", async () => {
    routerEvents = new Subject<unknown>();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    component.notice.set({ kind: "warning", text: "stale dependency warning" });

    component.navigate("resolver");
    expect(component.notice()?.text).toBe("stale dependency warning");
    routerEvents.next(new NavigationStartEvent(314, "/resolution/payment"));
    routerEvents.next(
      new NavigationEndEvent(314, "/resolution/payment", "/resolution/payment"),
    );
    expect(component.notice()).toBeNull();
    component.ngOnDestroy();
  });

  it("loads Currency options when New or Edit enters Maker without navigation", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    const loadCurrencies = jest
      .spyOn(component.maintenanceSession as never, "loadCurrencies" as never)
      .mockResolvedValue(undefined as never);

    component.startNew();
    expect(loadCurrencies).toHaveBeenCalledTimes(1);

    loadCurrencies.mockClear();
    component.edit({
      id: "SSI-DRAFT",
      counterpartyId: "ANY",
      scope: "STANDING",
      status: "DRAFT",
      maker: "maker.revision",
      route: { currency: "USD" },
      version: 2,
    });
    expect(loadCurrencies).toHaveBeenCalledTimes(1);
  });

  it("loads Currency options before opening SSI detail and exposes the revision source identity", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    const loadCurrencies = jest
      .spyOn(component.detail, "loadCurrencies")
      .mockImplementation(async () => {
        component.detail.currencies.set([
          { code: "SGD", decimals: 2, standard: "ISO 4217" },
        ]);
      });
    const activeRow = {
      id: "SSI-ACTIVE",
      counterpartyId: "CP-ANY-SGD",
      scope: "STANDING",
      status: "ACTIVE",
      maker: "maker.original",
      ownershipType: "OWN" as const,
      route: { currency: "SGD", counterpartyBic: "ANY" },
      version: 9,
    };

    await component.detail.open(activeRow);
    expect(loadCurrencies).toHaveBeenCalledTimes(1);
    expect(component.detail.model()).toMatchObject({
      route: { currency: "SGD" },
    });

    await component.revise(activeRow);
    expect(component.revisionSourceIdentity()).toBe("CP-ANY-SGD · v9");
  });

  it("reserves WIP on Revise and lets X or Escape cancel it on the server", async () => {
    routerEvents = new Subject<unknown>();
    const originalNavigate = fakeRouter.navigateByUrl.getMockImplementation();
    let navigationId = 500;
    fakeRouter.navigateByUrl.mockImplementation(async (url: string) => {
      const id = navigationId++;
      routerEvents.next(new NavigationStartEvent(id, url));
      routerEvents.next(new NavigationEndEvent(id, url, url));
      return true;
    });
    try {
      const { AppComponent } = await import("../../app/app.component");
      const component = new AppComponent();
      const activeRow = {
        id: "SSI-ACTIVE",
        counterpartyId: "BANK-1",
        scope: "STANDING",
        status: "ACTIVE",
        maker: "maker.original",
        ownershipType: "OWN" as const,
        ownerParty: "HK01",
        publisherParty: "HK01",
        route: { currency: "USD", counterpartyType: "BANK" },
        version: 9,
      };

      fakeHttp.post.mockClear();
      component.notice.set({ kind: "error", text: "stale conflict" });
      await component.revise(activeRow);

      expect(component.view()).toBe("maker");
      expect(component.notice()).toBeNull();
      expect(component.editingId()).toBe("ROW-REVISION");
      expect(component.revisionSource()?.id).toBe("SSI-ACTIVE");
      expect(fakeHttp.post).toHaveBeenCalledWith(
        expect.stringContaining("/ssis/SSI-ACTIVE/revise"),
        { maker: "maker.revision" },
      );

      await component.closeMaker();
      expect(component.view()).toBe("dashboard");
      expect(component.revisionSource()).toBeNull();
      expect(fakeHttp.post).toHaveBeenCalledWith(
        expect.stringContaining("/ssis/ROW-REVISION/cancel-revision"),
        { actor: "maker.revision" },
      );

      fakeHttp.post.mockClear();
      await component.revise(activeRow);
      await component.closeOverlayOnEscape();
      expect(component.view()).toBe("dashboard");
      expect(component.revisionSource()).toBeNull();
      expect(fakeHttp.post).toHaveBeenCalledWith(
        expect.stringContaining("/ssis/ROW-REVISION/cancel-revision"),
        { actor: "maker.revision" },
      );

      fakeHttp.post.mockClear();
      fakeHttp.put.mockClear();
      await component.revise(activeRow);
      await component.create();
      expect(fakeHttp.post).toHaveBeenCalledWith(
        expect.stringContaining("/ssis/SSI-ACTIVE/revise"),
        { maker: "maker.revision" },
      );
      expect(fakeHttp.put).toHaveBeenCalledWith(
        expect.stringContaining("/ssis/ROW-REVISION"),
        expect.objectContaining({ maker: "maker.revision" }),
      );
    } finally {
      fakeRouter.navigateByUrl.mockImplementation(
        originalNavigate ?? (async (_url: string) => true),
      );
    }
  });

  it("reserves before opening Maker and releases the reservation when navigation is denied", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    component.view.set("dashboard");
    fakeRouter.navigateByUrl.mockClear();
    fakeHttp.post.mockClear();
    fakeRouter.navigateByUrl.mockResolvedValueOnce(false);
    await component.revise({
      id: "SSI-ACTIVE",
      counterpartyId: "BANK-1",
      scope: "STANDING",
      status: "ACTIVE",
      maker: "maker.original",
      ownershipType: "OWN",
      route: { currency: "USD", counterpartyType: "BANK" },
      version: 9,
    });
    expect(fakeHttp.post).toHaveBeenCalledWith(
      expect.stringContaining("/ssis/SSI-ACTIVE/revise"),
      { maker: "maker.revision" },
    );
    expect(fakeRouter.navigateByUrl).toHaveBeenCalledWith("/maker");
    expect(fakeHttp.post.mock.invocationCallOrder[0]).toBeLessThan(
      fakeRouter.navigateByUrl.mock.invocationCallOrder[0]!,
    );
    expect(fakeHttp.post).toHaveBeenCalledWith(
      expect.stringContaining("/ssis/ROW-REVISION/cancel-revision"),
      { actor: "maker.revision" },
    );
    expect(component.view()).toBe("dashboard");
    expect(component.editingId()).toBeNull();
    component.ngOnDestroy();
  });

  it("keeps a failed cancellation protected until the server confirms release", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    component.view.set("dashboard");
    const post = fakeHttp.post.getMockImplementation()!;
    fakeHttp.post
      .mockImplementationOnce(post)
      .mockImplementationOnce(() =>
        throwError(() => new Error("cancel unavailable")),
      );
    fakeRouter.navigateByUrl.mockResolvedValueOnce(false);
    await component.revise({
      id: "SSI-ACTIVE",
      counterpartyId: "BANK-1",
      scope: "STANDING",
      status: "ACTIVE",
      maker: "maker.original",
      ownershipType: "OWN",
      route: { currency: "USD", counterpartyType: "BANK" },
      version: 9,
    });
    expect(component.hasActiveMakerRevision()).toBe(true);
    expect(component.notice()?.text).toContain("無法取消 In Progress 鎖定");
    expect(await component.canDeactivate()).toBe(true);
    expect(component.hasActiveMakerRevision()).toBe(false);
    component.ngOnDestroy();
  });

  it("protects a newly reserved WIP against a competing browser navigation", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    component.view.set("dashboard");
    let finishMakerNavigation!: (allowed: boolean) => void;
    fakeRouter.navigateByUrl.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishMakerNavigation = resolve;
        }),
    );
    fakeHttp.post.mockClear();
    const revising = component.revise({
      id: "SSI-ACTIVE",
      counterpartyId: "BANK-1",
      scope: "STANDING",
      status: "ACTIVE",
      maker: "maker.original",
      ownershipType: "OWN",
      route: { currency: "USD", counterpartyType: "BANK" },
      version: 9,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(component.editingId()).toBe("ROW-REVISION");
    expect(await component.canDeactivate("/maker")).toBe(true);
    expect(component.editingId()).toBe("ROW-REVISION");
    expect(await component.canDeactivate("/settings")).toBe(true);
    expect(component.editingId()).toBeNull();
    finishMakerNavigation(false);
    await revising;
    expect(
      fakeHttp.post.mock.calls.filter(([url]) =>
        String(url).endsWith("/cancel-revision"),
      ),
    ).toHaveLength(1);
    component.ngOnDestroy();
  });

  it("uses Escape as the common cancel action for the SSI picker", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();

    component.bicPickerTarget.set("accountWithBic");
    await component.closeOverlayOnEscape();
    expect(component.bicPickerTarget()).toBeNull();
  });

  it("initialises the main workbench and handles local index interactions", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    await Promise.resolve();

    expect(component.view()).toBe("swiftdata");
    fakeHttp.get.mockClear();
    component.selectOwnershipTab("COUNTERPARTY");
    await Promise.resolve();
    expect(component.ownershipTab()).toBe("COUNTERPARTY");
    expect(fakeHttp.get).toHaveBeenCalledWith(
      expect.stringContaining("/reference/counterparties"),
    );
    component.searchCounterpartyInbox("bank");
    expect(component.counterpartyInboxSearch()).toBe("bank");
    component.selectCounterpartyPartyType("BANK_NO_SSI");
    expect(component.counterpartyPartyType()).toBe("BANK_NO_SSI");
    component.selectCounterpartyPartyType("CUSTOMER");
    expect(component.counterpartyPartyType()).toBe("CUSTOMER");
    component.sortCounterpartyInbox("COUNTRY");
    expect(component.maintenanceIndex.counterpartyAriaSort("COUNTRY")).toBe(
      "ascending",
    );
    component.sortCounterpartyInbox("COUNTRY");
    expect(
      component.maintenanceIndex.counterpartySortIndicator("COUNTRY"),
    ).toBe("↓");
    expect(component.maintenanceIndex.counterpartyAriaSort("BIC_NAME")).toBe(
      "none",
    );
    component.sortOwnershipIndex("STATUS");
    expect(component.maintenanceIndex.ownershipAriaSort("STATUS")).toBe(
      "ascending",
    );
    component.sortOwnershipIndex("STATUS");
    expect(component.maintenanceIndex.ownershipSortIndicator("STATUS")).toBe(
      "↓",
    );
    expect(component.maintenanceIndex.ownershipAriaSort("CURRENCY")).toBe(
      "none",
    );
    component.moveIndexPage(1);
    component.moveCounterpartyInboxPage(1);
    fakeHttp.get.mockClear();
    component.openCounterpartySsi("BANK-1");
    await Promise.resolve();
    expect(component.selectedCounterpartyId()).toBe("BANK-1");
    expect(fakeHttp.get).toHaveBeenCalledWith(
      expect.stringMatching(/\/ssis\?.*counterpartyId=BANK-1/),
    );
    fakeHttp.get.mockClear();
    component.closeCounterpartySsi();
    await Promise.resolve();
    expect(component.selectedCounterpartyId()).toBe("");
    const listRequest = fakeHttp.get.mock.calls.find(([url]) =>
      url.includes("/ssis?"),
    )?.[0];
    expect(listRequest).toBeDefined();
    expect(listRequest).not.toContain("counterpartyId=");
    fakeThemeService.setTheme.mockClear();
    fakeTheme.set("system");
    component.setTheme("dark");
    expect(fakeThemeService.setTheme).toHaveBeenCalledWith("dark");
    expect(component.theme()).toBe("dark");
  });

  it("routes SSI Maintenance list and WIP transport through the HTTP-only service", async () => {
    const { SsiMaintenanceApiService } =
      await import("../../app/ssi-maintenance-api.service");
    const list = jest.spyOn(SsiMaintenanceApiService.prototype, "list");
    const cancelRevision = jest.spyOn(
      SsiMaintenanceApiService.prototype,
      "cancelRevision",
    );
    try {
      const { AppComponent } = await import("../../app/app.component");
      const component = new AppComponent();
      await component.refresh();
      expect(list).toHaveBeenCalledTimes(1);
      component.view.set("maker");
      component.editingId.set("SSI-REV-1");
      component.revisionSource.set({ id: "SSI-1" } as never);
      await component.canDeactivate();
      expect(cancelRevision).toHaveBeenCalledWith("SSI-REV-1", "maker.demo");
      component.ngOnDestroy();
    } finally {
      list.mockRestore();
      cancelRevision.mockRestore();
    }
  });

  it("splits bank SSI coverage into two tabs without opening an empty SSI detail", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    await Promise.resolve();
    component.counterpartyDirectory.set([
      {
        counterpartyId: "BANK-COVERED",
        name: "Covered Bank",
        country: "US",
        partyType: "BANK",
      },
      {
        counterpartyId: "BANK-EMPTY",
        name: "Uncovered Bank",
        country: "GB",
        partyType: "BANK",
      },
      {
        counterpartyId: "CUST-1",
        name: "Customer One",
        country: "HK",
        partyType: "CUSTOMER",
      },
    ]);
    component.counterpartyCoverage.set([
      {
        counterpartyId: "BANK-COVERED",
        ssiCount: 12,
        currencyCount: 2,
        statuses: ["ACTIVE"],
        lastVerified: "2026-09-18T00:00:00.000Z",
      },
    ]);

    expect(
      component.counterpartyInbox().map((party) => party.counterpartyId),
    ).toEqual(["BANK-COVERED"]);
    expect(component.counterpartyInbox()[0]).toMatchObject({
      ssiCount: 12,
      currencyCount: 2,
    });
    component.selectCounterpartyPartyType("BANK_NO_SSI");
    expect(
      component.counterpartyInbox().map((party) => party.counterpartyId),
    ).toEqual(["BANK-EMPTY"]);
    component.openCounterpartySsi("BANK-EMPTY");
    expect(component.selectedCounterpartyId()).toBe("");
    component.selectCounterpartyPartyType("CUSTOMER");
    expect(
      component.counterpartyInbox().map((party) => party.counterpartyId),
    ).toEqual(["CUST-1"]);
  });

  it("drives SSI maintenance state", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    const row = {
      id: "SSI-1",
      counterpartyId: "BANK-1",
      scope: "REUSABLE",
      status: "DRAFT",
      maker: "maker",
      route: { currency: "USD", counterpartyType: "BANK" },
      version: 1,
    };

    component.startNew();
    component.edit(row);
    component.requestDelete(row);
    expect(component.deleteTarget()).toEqual(row);
    component.deleteReason.set("duplicate record");
    await component.confirmDelete();
    component.closeDeleteDialog();
    await component.create();
    await component.act(row, "submit");
    await component.act(row, "approve");
    component.startNew();
    await component.create();
  });

  it("derives governed SSI dashboard state", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    await Promise.resolve();
    component.rows.set([]);
    component.counterpartyDirectory.set([]);

    expect(component.visibleRows()).toEqual([]);
    expect(component.counterpartyInbox()).toEqual([]);
    expect(component.filteredCounterpartyInbox()).toEqual([]);
    expect(component.counterpartyInboxTotalPages()).toBe(1);
    expect(component.pagedCounterpartyInbox()).toEqual([]);
    expect(component.selectedCounterparty()).toBeNull();
    expect(component.maintenanceIndex.indexTotalPages()).toBe(1);
    expect(component.maintenanceIndex.pagedVisibleRows()).toEqual([]);
    expect(component.maintenanceIndex.activeRows()).toEqual([]);
    expect(component.maintenanceIndex.archivedCount()).toBe(0);
    expect(component.maintenanceIndex.activeCount()).toBe(0);
    expect(component.hasPreviousBankPage()).toBe(false);
    expect(component.hasNextBankPage()).toBe(false);
    expect(component.hasPreviousCustomerPage()).toBe(false);
    expect(component.hasNextCustomerPage()).toBe(false);
  });

  it("validates dynamic identity form rules for banks and customers", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    const counterparty = component
      .fields()
      .find((field) => field.key === "counterpartyId")!;
    const counterpartyType = component
      .fields()
      .find((field) => field.key === "route.counterpartyType")!;
    expect(counterpartyType.props?.options).toEqual([
      { label: "Bank／銀行", value: "BANK" },
      {
        label: "Any approved bank／任何已核准銀行",
        value: "ANY_BANK",
      },
    ]);
    const expressions = counterparty.expressions!;
    const evaluate = (
      key: string,
      counterpartyType: "BANK" | "ANY_BANK" | "CUSTOMER",
    ) =>
      (expressions[key] as (field: unknown) => unknown)({
        model: { route: { counterpartyType } },
      });

    expect(evaluate("props.minLength", "BANK")).toBe(3);
    expect(evaluate("props.minLength", "CUSTOMER")).toBe(3);
    expect(evaluate("props.minLength", "ANY_BANK")).toBe(3);
    expect(evaluate("props.maxLength", "BANK")).toBe(35);
    expect(evaluate("props.maxLength", "CUSTOMER")).toBe(35);
    expect(evaluate("props.maxLength", "ANY_BANK")).toBe(3);
    expect(typeof evaluate("props.pattern", "BANK")).toBe("string");
    expect(evaluate("props.pattern", "CUSTOMER")).toBeInstanceOf(RegExp);
    expect(String(evaluate("props.pattern", "ANY_BANK"))).toContain("ANY");
    expect(String(evaluate("props.validationMessage", "BANK"))).toContain(
      "Counterparty ID",
    );
    expect(String(evaluate("props.validationMessage", "CUSTOMER"))).toContain(
      "Customer ID",
    );
    expect(String(evaluate("props.validationMessage", "ANY_BANK"))).toContain(
      "ANY",
    );
    expect(evaluate("props.readonly", "ANY_BANK")).toBe(true);
    expect(evaluate("props.showPicker", "ANY_BANK")).toBe(false);
    expect(String(evaluate("props.description", "ANY_BANK"))).toContain(
      "交易資料",
    );
    expect(evaluate("props.pickerLabel", "BANK")).toBe("從 Bank Service 選擇");
    expect(evaluate("props.pickerLabel", "CUSTOMER")).toBe(
      "從 Customer Service 選擇",
    );
    for (const key of [
      "counterpartyId",
      "route.beneficiaryBic",
      "route.accountWithBic",
      "route.intermediaryBic",
    ]) {
      const picker = component.fields().find((field) => field.key === key)
        ?.props?.pickerAction as (() => void) | undefined;
      picker?.();
    }

    const accountReference = component
      .fields()
      .find((field) => field.key === "route.accountId")!;
    const accountExpressions = accountReference.expressions!;
    const accountField = {
      model: { ownershipType: "OWN", route: { counterpartyType: "BANK" } },
    };
    expect(
      (accountExpressions["props.label"] as (field: unknown) => string)(
        accountField,
      ),
    ).toBeTruthy();
    expect(
      (accountExpressions["props.description"] as (field: unknown) => string)(
        accountField,
      ),
    ).toBeTruthy();
    expect(
      (accountExpressions["props.placeholder"] as (field: unknown) => string)(
        accountField,
      ),
    ).toBeTruthy();
  });

  it("derives populated SSI ownership and Maker state", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    await Promise.resolve();
    const applicability = {
      id: "APP-1",
      ssiId: "SSI-OWN",
      consumer: "ANY",
      product: "ANY",
      businessFunction: "ANY",
      paymentLeg: "ANY",
      direction: "ANY",
      status: "ACTIVE",
      validFrom: "2026-01-01",
      validTo: "9999-12-31",
      version: 1,
    };
    const workspaceRows = [
      {
        id: "SSI-OWN",
        counterpartyId: "BARCGB22",
        scope: "REUSABLE",
        status: "ACTIVE",
        maker: "maker",
        ownershipType: "OWN",
        ownerParty: "HK01",
        route: {
          currency: "USD",
          counterpartyBic: "BARCGB22",
          counterpartyType: "BANK",
          messageTypes: "pacs.009.001.08",
          accountWithBic: "CHASUS33",
        },
        applicability: [applicability],
        version: 1,
      },
      {
        id: "SSI-CP",
        counterpartyId: "CUST-1",
        scope: "TRANSACTION_ONLY",
        status: "PENDING_APPROVAL",
        maker: "maker",
        ownershipType: "COUNTERPARTY",
        ownerParty: "CUST-1",
        route: { currency: "EUR", counterpartyBic: "CUST-1" },
        version: 2,
      },
      {
        id: "SSI-OLD",
        counterpartyId: "OLD",
        scope: "REUSABLE",
        status: "REVOKED",
        maker: "maker",
        route: { currency: "USD", counterpartyBic: "ANY" },
        version: 1,
      },
    ];
    // Simulate the ACTIVE/OWN page already filtered by the authoritative API.
    component.rows.set([workspaceRows[0]!]);
    component.counterpartyDirectory.set([
      {
        counterpartyId: "CUST-1",
        name: "Customer One",
        country: "US",
        partyType: "CUSTOMER",
        beneficiaryAccountReference: "ACCT-1",
        address: "New York",
      },
    ]);

    expect(component.visibleRows().map((row) => row.id)).toEqual(["SSI-OWN"]);

    component.ownershipSearch.set("chas");
    expect(component.visibleRows()).toHaveLength(1);
    component.selectOwnershipTab("COUNTERPARTY");
    component.selectCounterpartyPartyType("CUSTOMER");
    component.selectedCounterpartyId.set("CUST-1");
    expect(component.counterpartyInbox()).toHaveLength(1);
    expect(component.selectedCounterparty()?.counterpartyId).toBe("CUST-1");
    // Restore non-Index workspace records for the remaining derived-state checks.
    component.rows.set(workspaceRows);
    component.ssiSummary.set({
      currentOwn: 1,
      pendingApproval: 1,
      active: 1,
      archived: 1,
    });
    expect(component.maintenanceIndex.activeCount()).toBe(1);
    expect(component.maintenanceIndex.archivedCount()).toBe(1);
    component.deleteReason.set("valid reason");
    expect(component.canConfirmDelete()).toBe(true);

    const setValue = jest.fn();
    jest.mocked(component.form.get).mockReturnValue({
      value: "CUSTOMER",
      setValue,
    } as never);
    await component.openBicPicker("counterpartyId", "Counterparty");
    component.selectCustomer({
      customerId: "CUST-1",
      name: "Customer",
      country: "US",
    });
    await component.openBicPicker("counterpartyId", "Counterparty");
    component.selectBank({
      bankServiceId: "BANK-1",
      bic: "CHASUS33",
      name: "Bank",
      country: "US",
      addressRef: "ADDR-1",
      standard: "BIC",
    });
    expect(setValue).toHaveBeenCalled();
    expect(component.model).toMatchObject({
      counterpartyId: "CP-CHASUS33",
      route: { counterpartyBic: "CHASUS33" },
    });
    expect(component.selectedBic("counterpartyId")).toBe("CUSTOMER");

    component.model = {
      maker: "maker",
      counterpartyId: " CUST-1 ",
      route: { counterpartyType: "CUSTOMER" },
    };
    await component.create();
    expect(component.model).toMatchObject({
      counterpartyId: "CUST-1",
      route: { counterpartyType: "CUSTOMER" },
    });
    Object.defineProperty(component.form, "invalid", {
      configurable: true,
      value: true,
    });
    await component.create();
    expect(component.notice()?.kind).toBe("warning");
  });

  it("fails closed when maintenance and reference services are offline", async () => {
    rejectHttp = true;
    try {
      const { AppComponent } = await import("../../app/app.component");
      const component = new AppComponent();
      component.ngOnInit();

      component.model = {
        maker: "maker",
        counterpartyId: "BANK-1",
        route: { counterpartyType: "BANK" },
      };
      await component.create();
      const row = {
        id: "SSI-1",
        counterpartyId: "BANK-1",
        scope: "REUSABLE",
        status: "ACTIVE",
        maker: "maker",
        route: { currency: "USD" },
        version: 1,
      };
      await component.act({ ...row, status: "PENDING_APPROVAL" }, "approve");
      await component.revise(row);
      component.requestDelete(row);
      component.deleteReason.set("duplicate record");
      await component.confirmDelete();

      await component.openBicPicker("beneficiaryBic", "Beneficiary bank");
      await component.searchBanks("bank");
      await component.moveBankPage(1);
      await component.searchCustomers("customer");
      await component.moveCustomerPage(1);
      expect(fakeHttp.post).toHaveBeenCalled();
    } finally {
      rejectHttp = false;
    }
  });

  it("keeps the SSI index in a loading state until Draft rows arrive", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    component.ownershipStatus.set("DRAFT");
    pendingSsiResponse = new Subject<unknown>();

    const refresh = component.refresh();
    expect(component.ssiIndexLoading()).toBe(true);

    pendingSsiResponse.next([
      {
        id: "SSI-EUR-DRAFT",
        counterpartyId: "ANY",
        scope: "STANDING",
        maker: "maker.revision",
        ownershipType: "OWN",
        ownerParty: "HK01",
        publisherParty: "HK01",
        route: { currency: "EUR", accountWithBic: "DEUTDEFF" },
        status: "DRAFT",
        version: 11,
      },
      {
        id: "SSI-JPY-DRAFT",
        counterpartyId: "ANY",
        scope: "STANDING",
        maker: "maker.revision",
        ownershipType: "OWN",
        ownerParty: "HK01",
        publisherParty: "HK01",
        route: { currency: "JPY", accountWithBic: "BOTKJPJT" },
        status: "DRAFT",
        version: 20,
      },
    ]);
    pendingSsiResponse.complete();
    await refresh;
    expect(component.ssiIndexLoading()).toBe(false);
    expect(component.visibleRows().map((row) => row.id)).toEqual([
      "SSI-EUR-DRAFT",
      "SSI-JPY-DRAFT",
    ]);
    pendingSsiResponse = undefined;
  });

  it("clears stale global pagination and uses scoped counterparty totals", async () => {
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    component.counterpartyDirectory.set([
      {
        counterpartyId: "BOFAUS3N",
        bic: "BOFAUS3N",
        name: "Bank of America",
        country: "US",
        partyType: "BANK",
      },
    ]);
    component.counterpartyCoverage.set([
      {
        counterpartyId: "BOFAUS3N",
        ssiCount: 3418,
        currencyCount: 5,
        statuses: ["ACTIVE"],
        lastVerified: "2026-09-18T00:00:00.000Z",
      },
    ]);
    component.ssiIndexTotalItems.set(10318);
    component.ssiIndexTotalPages.set(1032);
    pendingSsiResponse = new Subject<unknown>();

    component.openCounterpartySsi("BOFAUS3N");
    expect(component.ssiIndexLoading()).toBe(true);
    expect(component.rows()).toEqual([]);
    expect(component.ssiIndexTotalItems()).toBe(0);
    expect(component.ssiIndexTotalPages()).toBe(1);

    pendingSsiResponse.next({
      items: [],
      page: 1,
      pageSize: 10,
      totalItems: 3418,
      totalPages: 342,
      hasPrevious: false,
      hasNext: true,
      distinctCurrencyCount: 5,
    });
    pendingSsiResponse.complete();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.ssiIndexLoading()).toBe(false);
    expect(component.ssiIndexTotalItems()).toBe(3418);
    expect(component.ssiIndexTotalPages()).toBe(342);
    expect(component.ssiIndexDistinctCurrencyCount()).toBe(5);
    pendingSsiResponse = undefined;
  });

  it("initialises SWIFT Data CRUD and applies local filtering and sorting", async () => {
    const { SwiftDataCrudComponent } =
      await import("../../app/swift-data-crud.component");
    const component = new SwiftDataCrudComponent();
    await component.initialise();

    expect(component.resourceId()).toBe("rma");
    component.searchIndex("active");
    expect(component.indexSearch()).toBe("active");
    component.setStatusFilter("ALL");
    expect(component.statusFilter()).toBe("ALL");
    component.toggleSort("id");
    expect(component.sortIndicator("id")).toBe("▲");
    component.toggleSort("id");
    expect(component.sortIndicator("id")).toBe("▼");
    component.cancelWork();
    expect(component.formVisible()).toBe(false);
  });

  it("executes SWIFT Data resource workflows and presentation helpers", async () => {
    const { SwiftDataCrudComponent } =
      await import("../../app/swift-data-crud.component");
    const component = new SwiftDataCrudComponent();
    await component.initialise();
    const resource = {
      id: "rma",
      label: "RMA",
      endpoint: "rmas",
      importType: "RMA" as const,
      description: "Relationship management",
      columns: [
        { path: "id", label: "ID" },
        { path: "messageTypes", label: "Messages" },
        {
          paths: ["route.currency", "status"],
          separator: " / ",
          label: "Route",
        },
      ],
      fields: [
        { key: "id", label: "ID", type: "input", defaultValue: "ROW-1" },
        { key: "route.currency", label: "Currency", type: "input" },
        {
          key: "messageTypes",
          label: "Message types",
          type: "multicheckbox",
          required: true,
          options: ["MT202"],
          description: "Allowed message types",
        },
        {
          key: "amount",
          label: "Amount",
          type: "input",
          inputType: "number",
          pattern: "^[0-9]+$",
          minLength: 1,
          maxLength: 10,
          minimum: 0,
          maximum: 999,
          optionsSource: "currencies",
        },
        {
          key: "route.beneficiaryBic",
          label: "Beneficiary BIC",
          type: "input",
          "x-required-when": {
            path: "route.beneficiarySource",
            equals: "SSI",
          },
          "x-disabled-when": {
            path: "route.beneficiarySource",
            equals: "TRANSACTION",
          },
        },
      ],
      "x-lifecycle": ["submit", "approve", "activate"],
    };
    component.contract.set({
      info: { title: "test", version: "1" },
      "x-standards-baseline": {},
      "x-ui-resources": [resource],
    });
    await component.chooseResource("rma");
    component.startCreate();
    expect(component.model).toMatchObject({ id: "ROW-1" });
    const addMessageTypeField = component
      .fields()
      .find((field) => field.key === "messageTypes")!;
    const messageTypeOperation = addMessageTypeField.props?.[
      "messageTypeOperation"
    ] as () => "ADD" | "EDIT";
    expect(messageTypeOperation()).toBe("ADD");
    const row = {
      id: "ROW-1",
      status: "DRAFT",
      version: 1,
      maker: "maker",
      route: { currency: "USD" },
    };
    component.rows.set([row]);
    await component.view(row);
    const preventDefault = jest.fn();
    await component.openRowFromKeyboard(
      { key: "Enter", preventDefault } as KeyboardEvent,
      row,
    );
    expect(preventDefault).toHaveBeenCalled();
    await component.openRowFromKeyboard(
      { key: "Escape", preventDefault } as KeyboardEvent,
      row,
    );
    expect(component.rowLabel(row)).toContain("ROW-1");
    expect(component.detailModel()).toMatchObject({
      id: "ROW-1",
      route: { currency: "USD" },
    });
    const messageTypeField = component
      .fields()
      .find((field) => field.key === "messageTypes")!;
    const validateMessageTypes = messageTypeField.validators?.["messageTypes"]
      ?.expression as (control: { value: string }) => boolean;
    expect(validateMessageTypes({ value: "MT202, pacs.009.001.08" })).toBe(
      true,
    );
    expect(validateMessageTypes({ value: "javascript:alert(1)" })).toBe(false);
    const beneficiaryField = component
      .fields()
      .find((field) => field.key === "route.beneficiaryBic")!;
    const requiredExpression = beneficiaryField.expressions?.[
      "props.required"
    ] as (field: { model: unknown }) => boolean;
    const disabledExpression = beneficiaryField.expressions?.[
      "props.disabled"
    ] as (field: { model: unknown }) => boolean;
    expect(
      requiredExpression({ model: { route: { beneficiarySource: "SSI" } } }),
    ).toBe(true);
    expect(
      disabledExpression({
        model: { route: { beneficiarySource: "TRANSACTION" } },
      }),
    ).toBe(true);
    await component.edit(row);
    expect(messageTypeOperation()).toBe("EDIT");
    component.model = {
      id: "ROW-1",
      route: { currency: "USD" },
      messageTypes: "MT202, MT202COV",
      amount: "25",
    };
    fakeHttp.get.mockClear();
    await component.save();
    expect(component.formVisible()).toBe(false);
    expect(component.statusFilter()).toBe("DRAFT");
    expect(component.editingId()).toBeNull();
    expect(component.savedDraftId()).toBe("ROW-1");
    expect(
      fakeHttp.get.mock.calls.some(([url]) =>
        String(url).includes("status=DRAFT"),
      ),
    ).toBe(true);
    expect(component.canAct(row, "submit")).toBe(true);
    expect(component.canAct(row, "approve")).toBe(false);
    expect(
      component.canAct({ ...row, status: "PENDING_APPROVAL" }, "approve"),
    ).toBe(true);
    await component.act(row, "submit");
    await component.revise({ ...row, status: "ACTIVE" });
    component.requestSuppress({ ...row, status: "ACTIVE" });
    component.revokeReason.set("duplicate record");
    await component.confirmSuppression();

    expect(component.value({ ...row, scope: "REUSABLE" }, "scope")).toBe(
      "STANDING",
    );
    expect(
      component.value({ ...row, scope: "TRANSACTION_ONLY" }, "scope"),
    ).toBe("TRANSACTION_SPECIFIC");
    expect(component.value({ ...row, list: ["A", "B"] }, "list")).toBe("A, B");
    expect(
      component.rmaMessagePreview({
        ...row,
        messageTypes: ["MT103", "MT202", "pacs.008.001.08"],
      }),
    ).toEqual(["MT103", "MT202", "..."]);
    expect(
      component.rmaMessagePreview({ ...row, messageTypes: ["MT103", "MT202"] }),
    ).toEqual(["MT103", "MT202"]);
    expect(component.isRmaMessageColumn(resource.columns[1]!)).toBe(true);
    expect(component.columnValue(row, resource.columns[1]!)).toBe("—");
    expect(component.columnValue(row, resource.columns[2]!)).toBe(
      "USD / DRAFT",
    );
    expect(component.columnPath(resource.columns[2]!)).toBe("route.currency");
    component.movePage(5);
    component.rows.set([row, { ...row, id: "ROW-2", version: 2 }]);
    component.setStatusFilter("ALL");
    component.searchIndex("USD");
    component.toggleSort("version");
    expect(component.filteredRows()).toHaveLength(2);
    expect(component.sortedRows()).toHaveLength(2);
    expect(component.pagedRows()).toHaveLength(2);
    component.exportJson();
    expect(component.notice()?.kind).toBe("info");
    await component.exportExcel();
    expect(component.notice()?.kind).toBe("info");
    const originalDefaultView = fakeDocument.defaultView;
    Object.defineProperty(fakeDocument, "defaultView", {
      configurable: true,
      value: null,
    });
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    component.exportJson();
    expect(component.notice()?.kind).toBe("error");
    consoleError.mockRestore();
    Object.defineProperty(fakeDocument, "defaultView", {
      configurable: true,
      value: originalDefaultView,
    });

    const uploadTarget = {
      files: [
        {
          name: "rma.json",
          lastModified: 1,
          text: async () => JSON.stringify({ records: [row] }),
        },
      ],
      value: "selected",
    };
    await component.upload({ target: uploadTarget } as unknown as Event, true);
    expect(uploadTarget.value).toBe("");
  }, 30_000);

  it("provides native Formly select and BIC behaviors", async () => {
    const { BicInputType, MessageTypeTagsType, NativeSelectType } =
      await import("../../app/formly-types");
    const select = new NativeSelectType();
    Object.defineProperty(select, "props", {
      value: { options: [{ label: "USD", value: "USD" }] },
    });
    expect(select.selectOptions).toEqual([{ label: "USD", value: "USD" }]);
    Object.defineProperty(select, "props", { value: { options: "invalid" } });
    expect(select.selectOptions).toEqual([]);

    const bic = new BicInputType();
    expect(bic.pickerLabel).toBe("從 Bank Service 選擇");
    expect(bic.validationMessage).toContain("ISO 9362");
    const pickerAction = jest.fn();
    Object.defineProperty(bic, "field", {
      value: {
        props: {
          pickerLabel: "Pick bank",
          validationMessage: "Invalid bank",
          pickerAction,
        },
      },
    });
    expect(bic.pickerLabel).toBe("Pick bank");
    expect(bic.validationMessage).toBe("Invalid bank");
    bic.openPicker();
    expect(pickerAction).toHaveBeenCalled();

    const tags = new MessageTypeTagsType();
    let messageTypeValue = "MT300";
    const messageTypeControl = {
      get value() {
        return messageTypeValue;
      },
      setValue: (value: string) => {
        messageTypeValue = value;
      },
      markAsDirty: jest.fn(),
      markAsTouched: jest.fn(),
    };
    Object.defineProperty(tags, "formControl", {
      value: messageTypeControl,
    });
    Object.defineProperty(tags, "props", {
      value: {
        options: [
          { label: "MT300", value: "MT300" },
          { label: "pacs.009.001.08", value: "pacs.009.001.08" },
        ],
        messageTypeCategories: [
          {
            categoryId: "SECURITY",
            displayName: "Security",
            displayOrder: 10,
            emptyStateText: "No Security messages",
          },
          {
            categoryId: "PAYMENT",
            displayName: "Payment",
            displayOrder: 30,
            emptyStateText: "No Payment messages",
          },
        ],
        messageTypeItems: [
          {
            messageType: "MT300",
            description: "Foreign Exchange Confirmation",
            categoryId: "SECURITY",
            directionApplicability: {
              inbound: { applicable: true },
              outbound: { applicable: true },
            },
          },
          {
            messageType: "pacs.009.001.08",
            description: "Financial Institution Credit Transfer",
            categoryId: "PAYMENT",
            directionApplicability: {
              inbound: { applicable: true },
              outbound: { applicable: true },
            },
          },
        ],
        messageTypeSelectionForDirection: (
          _model: Record<string, unknown>,
          direction: "INBOUND" | "OUTBOUND",
        ) => (direction === "INBOUND" ? ["pacs.009.001.08"] : []),
      },
    });
    Object.defineProperty(tags, "field", {
      value: { model: { direction: "OUTBOUND" } },
    });
    expect(tags.operationButtonLabel).toBe("Edit");
    expect(tags.isSelected("MT300")).toBe(true);
    tags.query.set("pacs");
    expect(tags.visibleOptions.map(({ value }) => value)).toEqual([
      "pacs.009.001.08",
    ]);
    tags.toggle("pacs.009.001.08");
    expect(messageTypeValue).toBe("MT300, pacs.009.001.08");
    tags.openPicker();
    expect(tags.categories.map(({ displayName }) => displayName)).toEqual([
      "Security",
      "Payment",
    ]);
    expect(tags.categoryItems.map(({ messageType }) => messageType)).toEqual([
      "MT300",
    ]);
    expect(tags.directionEditable("OUTBOUND")).toBe(true);
    expect(tags.directionEditable("INBOUND")).toBe(false);
    expect(tags.directionAccessLabel("INBOUND")).toContain("Locked");
    tags.toggleDirection("INBOUND", "MT300");
    expect(tags.isDirectionSelected("INBOUND", "pacs.009.001.08")).toBe(true);
    expect(tags.isDirectionSelected("INBOUND", "MT300")).toBe(false);
    expect(tags.isDirectionSelected("OUTBOUND", "MT300")).toBe(true);
    tags.toggleDirection("OUTBOUND", "MT300");
    expect(tags.isDirectionSelected("OUTBOUND", "MT300")).toBe(false);
    tags.resetPicker();
    expect(tags.isDirectionSelected("OUTBOUND", "MT300")).toBe(true);
  });

  it("fails closed for SWIFT Data service errors and malformed imports", async () => {
    rejectHttp = true;
    try {
      const { SwiftDataCrudComponent } =
        await import("../../app/swift-data-crud.component");
      const component = new SwiftDataCrudComponent();
      await component.initialise();
      expect(component.notice()?.kind).toBe("error");
      component.contract.set({
        info: { title: "test", version: "1" },
        "x-standards-baseline": {},
        "x-ui-resources": [
          {
            id: "rma",
            label: "RMA",
            endpoint: "rmas",
            importType: "RMA",
            description: "Relationship management",
            columns: [{ path: "id", label: "ID" }],
            fields: [{ key: "id", label: "ID", type: "input" }],
            "x-lifecycle": ["submit", "approve", "activate"],
          },
        ],
      });
      const row = {
        id: "ROW-1",
        status: "DRAFT",
        version: 1,
        maker: "maker",
      };
      await component.refresh();
      component.model = { id: "ROW-1" };
      await component.save();
      await component.act(row, "submit");
      await component.revise(row);
      component.requestSuppress({ ...row, status: "ACTIVE" });
      component.revokeReason.set("duplicate record");
      await component.confirmSuppression();
      const uploadTarget = {
        files: [
          {
            name: "invalid.json",
            lastModified: 1,
            text: async () => "not JSON",
          },
        ],
        value: "selected",
      };
      await component.upload(
        { target: uploadTarget } as unknown as Event,
        false,
      );
      expect(uploadTarget.value).toBe("");
      expect(component.notice()?.kind).toBe("error");
      expect(component.busy()).toBe(false);
    } finally {
      rejectHttp = false;
    }
  });

  it("exposes shell notifications, detail actions, and notice presentation", async () => {
    routerEvents = new Subject<unknown>();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    const shell = component.maintenanceShellPort();
    const openDetail = jest.spyOn(component.detail, "open");
    const row = {
      id: "SSI-SHELL-1",
      counterpartyId: "BANK-1",
      scope: "STANDING",
      status: "ACTIVE",
      maker: "maker.demo",
      route: { currency: "USD" },
      version: 1,
    };

    expect(component.noticeAlert()).toBeNull();
    for (const [kind, title] of [
      ["info", "操作完成"],
      ["warning", "請注意"],
      ["error", "操作未完成"],
    ] as const) {
      shell.notify({ kind, text: kind });
      expect(component.noticeAlert()).toEqual({
        severity: kind,
        title,
        message: kind,
      });
    }

    shell.openDetail(row);
    expect(openDetail).toHaveBeenCalledWith(row);
    shell.closeDetail();
    expect(component.detail.target()).toBeNull();
    expect(shell.checkerCount()).toBe(0);
    expect(shell.acceptPendingApprovalCount(3)).toBeUndefined();
    component.ngOnDestroy();
  });

  it("binds and tears down every routed feature output", async () => {
    routerEvents = new Subject<unknown>();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    const reviewRequested = new Subject<{
      id: string;
      counterpartyId: string;
      scope: string;
      status: string;
      maker: string;
      route: { currency: string };
      version: number;
    }>();
    const countChanged = new Subject<number>();
    const noticeRaised = new Subject<{ kind: "warning"; text: string }>();
    const detailOpenChange = new Subject<boolean>();
    const dataReloaded = new Subject<void>();
    const refresh = jest.fn(async () => undefined);
    const decide = jest.fn(async () => true);
    const refreshReload = jest
      .spyOn(component, "refreshAfterDevelopmentReload")
      .mockResolvedValue();

    component.onSettingsActivated({
      reviewRequested,
      countChanged,
      noticeRaised,
      detailOpenChange,
      dataReloaded,
      refresh,
      decide,
    });
    const reviewRow = {
      id: "SSI-REVIEW-1",
      counterpartyId: "BANK-1",
      scope: "STANDING",
      status: "PENDING_APPROVAL",
      maker: "maker.demo",
      route: { currency: "USD" },
      version: 1,
    };
    const openDetail = jest.spyOn(component.detail, "open");
    reviewRequested.next(reviewRow);
    countChanged.next(7);
    noticeRaised.next({ kind: "warning", text: "review warning" });
    detailOpenChange.next(true);
    dataReloaded.next();

    expect(component.checkerCount()).toBe(7);
    expect(openDetail).toHaveBeenCalledWith(reviewRow);
    expect(component.notice()?.text).toBe("review warning");
    expect(component.routedAuditDetailOpen()).toBe(true);
    expect(refreshReload).toHaveBeenCalledTimes(1);
    component.view.set("checker");
    await component.refresh();
    expect(refresh).toHaveBeenCalledTimes(1);

    component.onSettingsDeactivated();
    countChanged.next(8);
    noticeRaised.next({ kind: "warning", text: "stale warning" });
    detailOpenChange.next(true);
    dataReloaded.next();
    expect(component.checkerCount()).toBe(7);
    expect(component.notice()?.text).toBe("review warning");
    expect(component.routedAuditDetailOpen()).toBe(false);
    expect(refreshReload).toHaveBeenCalledTimes(1);
    component.ngOnDestroy();
  });

  it("exposes router loading and ordinary navigation-failure state", async () => {
    routerEvents = new Subject<unknown>();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();

    expect(await component.navigate(component.view())).toBe(true);
    expect(component.loadingSsiDashboard()).toBe(false);
    routerEvents.next(new NavigationStartEvent(601, "/dashboard"));
    expect(component.loadingSsiDashboard()).toBe(true);
    routerEvents.next(new NavigationSkippedEvent(601));
    expect(component.loadingSsiDashboard()).toBe(false);

    routerEvents.next(new NavigationStartEvent(602, "/settings"));
    expect(component.loadingSsiDashboard()).toBe(false);
    routerEvents.next(new NavigationCancelEvent(602));
    expect(component.notice()?.text).toContain("目前畫面與未儲存內容保持不變");
    component.ngOnDestroy();
  });

  it("delegates route-guard and overlay behavior to an activated maintenance port", async () => {
    routerEvents = new Subject<unknown>();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    const maintenanceWipPort = {
      canDeactivate: jest.fn(async () => true),
      hasActiveMakerRevision: jest.fn(() => true),
      onLateMakerWipRelease: jest.fn(),
      clearReleasedMakerForm: jest.fn(),
      closeOverlayOnEscape: jest.fn(async () => false),
    };
    const guardHost = fakeRouteGuardBridge.register.mock.calls.at(-1)?.[0] as {
      hasActiveMakerRevision(): boolean;
      onLateMakerWipRelease(navigationId: number): void;
    };

    expect(guardHost.hasActiveMakerRevision()).toBe(false);
    component.onSettingsActivated({ maintenanceWipPort });
    expect(guardHost.hasActiveMakerRevision()).toBe(true);
    guardHost.onLateMakerWipRelease(603);
    expect(fakeRouteGuardBridge.consumeReleasedMakerWip).toHaveBeenCalledWith(
      603,
    );
    expect(maintenanceWipPort.onLateMakerWipRelease).toHaveBeenCalledTimes(1);

    const row = {
      id: "SSI-DETAIL-1",
      counterpartyId: "BANK-1",
      scope: "STANDING",
      status: "ACTIVE",
      maker: "maker.demo",
      route: { currency: "USD" },
      version: 1,
    };
    component.detail.target.set(row);
    const closeDetail = jest.spyOn(component.detail, "close");
    await component.closeOverlayOnEscape();
    expect(maintenanceWipPort.closeOverlayOnEscape).toHaveBeenCalledTimes(1);
    expect(closeDetail).toHaveBeenCalledTimes(1);
    component.ngOnDestroy();
  });

  it("ignores stale router completion and preserves a late released-WIP signal", async () => {
    routerEvents = new Subject<unknown>();
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();

    routerEvents.next(new NavigationStartEvent(501, "/settings"));
    routerEvents.next(new NavigationSkippedEvent(500));
    expect(component.routeLoading()).toBe(true);

    fakeRouteGuardBridge.consumeReleasedMakerWip.mockImplementation(
      (id: number) => id === 500,
    );
    try {
      routerEvents.next(new NavigationCancelEvent(500));
      expect(component.routeLoading()).toBe(true);
      routerEvents.next(new NavigationEndEvent(501, "/settings", "/settings"));
      expect(component.view()).toBe("settings");
      routerEvents.next(new NavigationStartEvent(503, "/"));
      routerEvents.next(new NavigationEndEvent(503, "/", "/"));
      expect(component.view()).toBe("dashboard");
      expect(component.routeLoading()).toBe(false);
    } finally {
      fakeRouteGuardBridge.consumeReleasedMakerWip.mockImplementation(
        () => false,
      );
      component.ngOnDestroy();
    }
  });

  it("reports a failed legacy root canonicalization without leaving navigation pending", async () => {
    routerEvents = new Subject<unknown>();
    fakeRouter.navigateByUrl.mockRejectedValueOnce(new Error("route failed"));
    const { AppComponent } = await import("../../app/app.component");
    const component = new AppComponent();
    component.view.set("maker");

    routerEvents.next(new NavigationStartEvent(502, "/"));
    routerEvents.next(new NavigationEndEvent(502, "/", "/"));
    await Promise.resolve();

    expect(component.notice()?.text).toContain("無法返回 SSI 工作區");
    expect(await component.navigate("settings")).toBe(true);
    component.ngOnDestroy();
  });
});
