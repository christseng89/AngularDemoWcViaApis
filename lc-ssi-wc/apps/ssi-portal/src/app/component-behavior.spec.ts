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
let rejectHttp = false;
let nextResolutionResponse: unknown;
let nextResolutionError: unknown;
let nextConfirmationResponse: unknown;
let pendingResolutionResponse: Subject<unknown> | undefined;

const fakeDocument = {
  defaultView: {
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

function legacyResolutionResponse(
  currency: string,
  hasRecommendedRoute = true,
) {
  return {
    useCase: "PAYMENT_SSI",
    usage: "EXECUTABLE_SETTLEMENT",
    paymentExecutable: false,
    preSettlement: true,
    attemptId: `ATTEMPT-${currency}`,
    requestHash: `hash-${currency}`,
    decision: hasRecommendedRoute ? "RESOLVED" : "NO_SSI_FOUND",
    recommendedRoute: hasRecommendedRoute
      ? {
          ssiId: `SSI-${currency}`,
          ssiVersion: 1,
          counterpartyId: "BANK-1",
          route: { currency },
          applicability: {
            id: "APP-1",
            ssiId: `SSI-${currency}`,
            consumer: "ANY",
            product: "ANY",
            businessFunction: "ANY",
            paymentLeg: "ANY",
            direction: "ANY",
            status: "ACTIVE",
            validFrom: "2026-01-01",
            validTo: "9999-12-31",
            version: 1,
          },
          fallbackTier: 0,
          rank: [1],
          evidence: [],
        }
      : null,
    alternatives: [],
    excludedRoutes: [],
    explanation: hasRecommendedRoute ? "Exact match" : "No SSI found",
  };
}

function governedResolutionResponse(currency: string) {
  return {
    resolutionDecision: "RESOLVED",
    chosenRoute: {
      ssiId: `SSI-${currency}`,
      ssiCode: `SSI-DEMO-${currency}`,
      ssiVersion: 4,
      currency,
      accountId: `NOSTRO-${currency}`,
    },
    alternatives: [
      {
        ssiId: `SSI-${currency}-ALT`,
        ssiCode: `SSI-DEMO-${currency}-ALT`,
        ssiVersion: 2,
        currency,
        accountId: `NOSTRO-${currency}-ALT`,
      },
    ],
    resolutionToken: `ATTEMPT-${currency}`,
    snapshotHash: `HASH-${currency}`,
    mx: { httpStatus: 200, decision: "RESOLVED" },
    mt: { tags: { "58A": "BARCGB22" } },
  };
}

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
  computed: <T>(compute: () => T): (() => T) => compute,
  inject: (token: unknown) => {
    if (token === documentToken) return fakeDocument;
    if (token === ChangeDetectorRefToken) return { detectChanges: jest.fn() };
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
  "./resolution-workbench/page-definition-index-workspace.component",
  () => ({ PageDefinitionIndexWorkspaceComponent: class {} }),
);

describe("portal component behavior", () => {
  it("does not download the full SSI register when opening resolution indexes", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    const refresh = jest.spyOn(component, "refresh").mockResolvedValue();

    component.navigate("resolver");
    component.navigate("tradefinance");

    expect(refresh).not.toHaveBeenCalled();

    component.navigate("dashboard");

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not let background MT347 candidates overwrite the MT2 bank identity", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    component.resolutionCounterpartyBic.set("BARCGB22");
    const scenario = component.tagScenarios.find(
      (item) => item.descriptor.messageType === "MT300",
    )!;

    component.chooseTagScenario(scenario.id);
    await Promise.resolve();
    await Promise.resolve();

    expect(component.resolutionCounterpartyBic()).toBe("BARCGB22");
  });

  it("submits only business context to the controlled MT347 resolver", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    await Promise.resolve();
    await Promise.resolve();
    const scenario = component.tagScenarios.find(
      (item) => item.descriptor.messageType === "MT300",
    )!;
    component.chooseTagScenario(scenario.id);
    await Promise.resolve();
    await Promise.resolve();
    component.chooseTagSsi("SSI-MT347-CONTROLLED-001");

    await component.generateTags();

    const call = [...fakeHttp.post.mock.calls]
      .reverse()
      .find(([url]) => url.endsWith("/reference/fin-controlled-resolutions"));
    expect(call?.[1]).toMatchObject({
      messageType: "MT300",
      sequence: "B1",
      currency: "USD",
      bookingEntity: "HK01",
      bindingId: "FIX-MT300-001@v1",
    });
    expect(call?.[1]).not.toHaveProperty("roles");
    expect(call?.[1]).not.toHaveProperty("roleSources");
    expect(call?.[1]).not.toHaveProperty("roleEvidence");
  });

  it("shows and opens only executable Counterparty SSI profiles", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    await Promise.resolve();
    const item = (messageType: string, selectable: boolean) => ({
      order: 1,
      messageType,
      description: `${messageType} profile`,
      processingMode: "SINGLE" as const,
      profileStatus: selectable ? "PROFILE_VERIFIED" : "OUT_OF_SCOPE",
      targetMessage: "pacs.009.001.08",
      businessService: "swift.cbprplus.04",
      selectable,
    });
    component.paymentMessageIndex.set([
      item("MT200", false),
      item("MT201", false),
      item("MT202", true),
      item("MT202COV", true),
      item("MT203", false),
      item("MT204", false),
      item("MT205", true),
      item("MT205COV", true),
      item("MT210", false),
    ]);

    expect(
      component.filteredPaymentMessageIndex().map((row) => row.messageType),
    ).toEqual(["MT202", "MT202COV", "MT205", "MT205COV"]);

    for (const profile of component
      .filteredPaymentMessageIndex()
      .filter((row) => row.selectable)) {
      component.openPaymentMessage(profile);
      expect(component.paymentTransactionOpen()).toBe(true);
      expect(component.selectedPaymentMessage()?.messageType).toBe(
        profile.messageType,
      );
      expect(component.resolutionMessageType()).toBe(profile.targetMessage);
      component.closePaymentTransaction();
    }
  });

  it("presents governed MT2 dual-format contracts returned by resolution endpoints", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    await Promise.resolve();
    await Promise.resolve();
    component.resolutionBanksError.set("");
    component.resolutionCounterpartyBankServiceId.set("BANK-SVC-BARC");
    nextResolutionResponse = {
      mx: { httpStatus: 200, decision: "RESOLVED" },
      mt: { tags: { "58A": "BARCGB22" } },
    };

    try {
      await component.resolve();
      const resolveCall = fakeHttp.post.mock.calls.find(([url]) =>
        url.endsWith("/settlements/resolve"),
      );
      expect(resolveCall?.[1]).toMatchObject({
        counterpartyBankServiceId: "BANK-SVC-BARC",
        messagingService: "FINPLUS",
        paymentBeneficiaryInstitutionInput: "BARCGB22",
      });
      expect(resolveCall?.[1]).not.toHaveProperty("counterpartyBic");
      expect(resolveCall?.[1]).not.toHaveProperty("counterpartyId");
      expect(component.resolutionContractDecision()).toBe("RESOLVED");
      component.resolutionOutputFormat.set("MT");
      expect(component.renderedSettlementOutput()).toEqual({
        tags: { "58A": "BARCGB22" },
      });
      component.resolutionOutputFormat.set("MX");
      expect(component.renderedSettlementOutput()).toEqual({
        httpStatus: 200,
        decision: "RESOLVED",
      });
      expect(component.resolutionResult()).toBeNull();
      component.clearResolution();
      expect(component.resolutionContractResult()).toBeNull();
    } finally {
      nextResolutionResponse = undefined;
    }
  });

  it("binds scenario and pinned own-account identities into the resolution request", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    await Promise.resolve();
    await Promise.resolve();
    component.resolutionBanksError.set("");
    component.resolutionBanks.set([
      {
        bankServiceId: "BANK-SVC-BARC",
        bic: "BARCGB22",
        name: "Barclays",
        country: "GB",
        addressRef: "ADDR-BARC",
        standard: "BIC",
      },
    ]);
    component.ownNostroAccounts.set(
      (await new Promise((resolve) => {
        fakeHttp.get("/nostro-accounts").subscribe(resolve);
      })) as never,
    );
    component.paymentMessageIndex.set([
      {
        order: 1,
        messageType: "MT202",
        description: "MT202",
        processingMode: "SINGLE",
        profileStatus: "PROFILE_VERIFIED",
        targetMessage: "pacs.009.001.08",
        businessService: "swift.cbprplus.04",
        selectable: true,
      },
    ]);
    const scenario = component
      .paymentMessageScenarios()
      .find((item) => item.code === "BOOK_TRANSFER_SAME_RECEIVER")!;
    component.openPaymentScenario(scenario);
    expect(component.paymentResolutionDomain()).toBe("OWN_SSI_NOSTRO");
    component.selectPaymentScenarioControl("ownDebitAccountId", "NOSTRO-DEBIT");
    component.selectPaymentScenarioControl(
      "ownCreditAccountId",
      "NOSTRO-CREDIT",
    );
    component.selectPaymentScenarioControl(
      "receiverBankServiceId",
      "BANK-SVC-BARC",
    );
    nextResolutionResponse = { mx: { httpStatus: 200 }, mt: {} };
    await component.resolve();
    const call = [...fakeHttp.post.mock.calls]
      .reverse()
      .find(([url]) => url.endsWith("/settlements/resolve"));
    expect(call?.[1]).toMatchObject({
      scenarioCode: "BOOK_TRANSFER_SAME_RECEIVER",
      ownDebitAccountId: "NOSTRO-DEBIT",
      ownDebitAccountVersion: 4,
      ownCreditAccountId: "NOSTRO-CREDIT",
      ownCreditAccountVersion: 7,
      receiverBankServiceId: "BANK-SVC-BARC",
      bookingEntity: "HK01",
    });
    nextResolutionResponse = undefined;
  });

  it("defaults the 57A scenario to distinct Receiver-debit and 57A-credit accounts", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    await Promise.resolve();
    await Promise.resolve();
    component.resolutionBanksError.set("");
    component.resolutionBanks.set([
      {
        bankServiceId: "BANK-SVC-BARC",
        bic: "BARCGB22",
        name: "Barclays",
        country: "GB",
        addressRef: "ADDR-BARC",
        standard: "BIC",
      },
    ]);
    component.ownNostroAccounts.set(
      (await new Promise((resolve) => {
        fakeHttp.get("/nostro-accounts").subscribe(resolve);
      })) as never,
    );
    component.paymentMessageIndex.set([
      {
        order: 1,
        messageType: "MT202",
        description: "MT202",
        processingMode: "SINGLE",
        profileStatus: "PROFILE_VERIFIED",
        targetMessage: "pacs.009.001.08",
        businessService: "swift.cbprplus.04",
        selectable: true,
      },
    ]);
    const scenario = component
      .paymentMessageScenarios()
      .find((item) => item.code === "CREDIT_ONE_OF_SEVERAL_AT_57A")!;
    component.openPaymentScenario(scenario);
    expect(component.paymentScenarioValues()).toMatchObject({
      ownDebitAccountId: "NOSTRO-DEBIT",
      ownCreditAccountId: "NOSTRO-57A-CREDIT",
      receiverBankServiceId: "BANK-SVC-BARC",
    });
  });

  it("clears a resolved USD route immediately when SGD is selected", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    await Promise.resolve();
    await Promise.resolve();
    component.resolutionBanksError.set("");
    component.resolutionCounterpartyBankServiceId.set("BANK-SVC-BARC");
    nextResolutionResponse = legacyResolutionResponse("USD");

    try {
      await component.resolve();
      expect(component.resolutionResult()?.recommendedRoute?.route).toEqual({
        currency: "USD",
      });

      component.selectResolutionCurrency("SGD");

      expect(component.resolutionCurrency()).toBe("SGD");
      expect(component.resolutionResult()).toBeNull();
      expect(component.resolutionContractResult()).toBeNull();
      expect(component.resolutionConfirmation()).toBeNull();
      expect(component.resolutionRequestError()).toBe("");
      expect(component.resolutionLoading()).toBe(false);
    } finally {
      nextResolutionResponse = undefined;
    }
  });

  it("ignores a delayed USD response after the currency changes to SGD", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    await Promise.resolve();
    component.resolutionBanksError.set("");
    component.resolutionCounterpartyBankServiceId.set("BANK-SVC-BARC");
    pendingResolutionResponse = new Subject<unknown>();

    try {
      const pendingResolve = component.resolve();
      expect(component.resolutionLoading()).toBe(true);

      component.selectResolutionCurrency("SGD");
      expect(component.resolutionResult()).toBeNull();
      expect(component.resolutionLoading()).toBe(false);

      pendingResolutionResponse.next(legacyResolutionResponse("USD"));
      pendingResolutionResponse.complete();
      await pendingResolve;

      expect(component.resolutionCurrency()).toBe("SGD");
      expect(component.resolutionResult()).toBeNull();
      expect(component.resolutionContractResult()).toBeNull();
      expect(component.resolutionConfirmation()).toBeNull();
    } finally {
      pendingResolutionResponse = undefined;
    }
  });

  it("ignores a delayed governed contract after the routing inputs change", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    await Promise.resolve();
    component.resolutionBanksError.set("");
    component.resolutionCounterpartyBankServiceId.set("BANK-SVC-BARC");
    pendingResolutionResponse = new Subject<unknown>();

    try {
      const pendingResolve = component.resolve();
      component.selectResolutionCurrency("SGD");

      pendingResolutionResponse.next(governedResolutionResponse("USD"));
      pendingResolutionResponse.complete();
      await pendingResolve;

      expect(component.resolutionCurrency()).toBe("SGD");
      expect(component.resolutionContractResult()).toBeNull();
      expect(component.resolutionContractEvidence()).toBeNull();
      expect(component.resolutionContractAlternatives()).toEqual([]);
      expect(component.resolutionConfirmation()).toBeNull();
    } finally {
      pendingResolutionResponse = undefined;
    }
  });

  it("confirms a governed preview using its preserved resolution token", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    await Promise.resolve();
    component.resolutionBanksError.set("");
    component.resolutionCounterpartyBankServiceId.set("BANK-SVC-BARC");
    nextResolutionResponse = governedResolutionResponse("USD");
    nextConfirmationResponse = {
      decision: "CONFIRMED",
      resolutionToken: "CONFIRMED-TOKEN",
      snapshotHash: "CONFIRMED-HASH",
    };

    try {
      await component.resolve();

      expect(component.resolutionContractEvidence()).toEqual({
        resolutionToken: "ATTEMPT-USD",
        snapshotHash: "HASH-USD",
      });
      expect(component.resolutionContractAlternatives()).toHaveLength(1);
      expect(component.resolutionSelectedSsiId()).toBe("SSI-USD");

      await component.confirmResolution();

      expect(fakeHttp.post).toHaveBeenCalledWith(
        expect.stringContaining("/settlements/ATTEMPT-USD/confirm"),
        { selectedSsiId: "SSI-USD", actor: "maker.demo" },
      );
      expect(component.resolutionConfirmation()).toMatchObject({
        decision: "CONFIRMED",
        resolutionToken: "CONFIRMED-TOKEN",
        snapshotHash: "CONFIRMED-HASH",
      });
      expect(component.resolutionContractEvidence()).toEqual({
        resolutionToken: "ATTEMPT-USD",
        snapshotHash: "HASH-USD",
      });
    } finally {
      nextResolutionResponse = undefined;
      nextConfirmationResponse = undefined;
    }
  });

  it("retains unordered ambiguous candidates and never offers a route to confirm", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    await Promise.resolve();
    component.resolutionBanksError.set("");
    component.resolutionCounterpartyBankServiceId.set("BANK-SVC-BARC");
    nextResolutionError = {
      status: 422,
      error: {
        resolutionDecision: "SSI_AMBIGUOUS",
        chosenRoute: null,
        candidates: [
          { ssiId: "SSI-003", ssiCode: "SSI-DEMO-003" },
          { ssiId: "SSI-022", ssiCode: "SSI-DEMO-022" },
        ],
        resolutionToken: "ATTEMPT-GBP",
        snapshotHash: "HASH-GBP",
        mx: {
          httpStatus: 422,
          code: "SSI_AMBIGUOUS",
          payloadGenerated: false,
        },
        mt: {
          validation: "FAIL",
          code: "SSI_AMBIGUOUS",
          payloadGenerated: false,
        },
      },
    };

    try {
      await component.resolve();
      const confirmCallsBefore = fakeHttp.post.mock.calls.filter(([url]) =>
        url.endsWith("/confirm"),
      ).length;

      expect(component.resolutionContractDecision()).toBe("SSI_AMBIGUOUS");
      expect(component.resolutionContractChosenRoute()).toBeNull();
      expect(component.resolutionContractCandidates()).toEqual([
        expect.objectContaining({ ssiCode: "SSI-DEMO-003" }),
        expect.objectContaining({ ssiCode: "SSI-DEMO-022" }),
      ]);
      expect(component.resolutionRequestError()).toContain("SSI_AMBIGUOUS");

      await component.confirmResolution();
      expect(
        fakeHttp.post.mock.calls.filter(([url]) => url.endsWith("/confirm")),
      ).toHaveLength(confirmCallsBefore);
      expect(component.resolutionConfirmation()).toBeNull();
    } finally {
      nextResolutionError = undefined;
    }
  });

  it("previews SGD with the current parameters and never displays the USD route", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    await Promise.resolve();
    component.resolutionBanksError.set("");
    component.resolutionCounterpartyBankServiceId.set("BANK-SVC-BARC");
    nextResolutionResponse = legacyResolutionResponse("USD");

    try {
      await component.resolve();
      component.selectResolutionCurrency("SGD");
      nextResolutionResponse = undefined;
      nextResolutionError = {
        status: 422,
        error: {
          mx: {
            httpStatus: 422,
            code: "SSI_NOT_FOUND",
            payloadGenerated: false,
            detail: "No active SGD SSI route",
          },
          mt: { routeEligibilityCreated: false },
        },
      };
      await component.resolve();

      const resolveCalls = fakeHttp.post.mock.calls.filter(([url]) =>
        url.endsWith("/settlements/resolve"),
      );
      expect(resolveCalls.at(-1)?.[1]).toMatchObject({ currency: "SGD" });
      expect(component.resolutionResult()).toBeNull();
      expect(component.resolutionContractResult()).toBeNull();
      expect(component.resolutionRequestError()).toContain("SSI_NOT_FOUND");
      expect(component.resolutionRequestError()).toContain("HTTP 422");
    } finally {
      nextResolutionResponse = undefined;
      nextResolutionError = undefined;
    }
  });

  it("removes an authoritative GBP result immediately on USD selection and previews only USD", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    await Promise.resolve();
    await Promise.resolve();
    component.resolutionBanksError.set("");
    component.resolutionCounterpartyBankServiceId.set("BANK-SVC-BARCGB22");
    component.selectResolutionCurrency("GBP");
    component.resolutionContractResult.set({
      resolutionDecision: "RESOLVED",
      mx: {
        httpStatus: 200,
        decision: "RESOLVED",
        chosenRoute: {
          ssiCode: "SSI-DEMO-003",
          ssiVersion: 39,
          currency: "GBP",
        },
        canonicalRoles: {
          instructedAgent: "BARCGB22",
          creditorAgent: "BARCGB22",
        },
      },
      mt: { tags: { "58A": "BARCGB22" }, omitted: ["57a"] },
    });

    try {
      expect(JSON.stringify(component.renderedSettlementOutput())).toContain(
        "BARCGB22",
      );

      component.selectResolutionCurrency("USD");

      expect(component.resolutionContractResult()).toBeNull();
      expect(component.resolutionResult()).toBeNull();
      expect(component.resolutionConfirmation()).toBeNull();
      expect(component.resolutionContractDecision()).toBe("");
      expect(component.renderedSettlementOutput()).toBeNull();
      await component.loadResolutionBanks();
      await component.refreshResolutionClearingOptions();
      nextResolutionResponse = {
        resolutionDecision: "RESOLVED",
        mx: {
          httpStatus: 200,
          decision: "RESOLVED",
          chosenRoute: {
            ssiCode: "SSI-DEMO-024",
            ssiVersion: 14,
            currency: "USD",
          },
          canonicalRoles: {
            instructedAgent: "CITIUS33",
            creditorAgent: "CITIUS33",
            creditor: "BARCGB22",
          },
        },
        mt: { tags: { "58A": "BARCGB22" }, omitted: ["57a"] },
      };
      component.resolutionBanksError.set("");
      component.resolutionCounterpartyBankServiceId.set("BANK-SVC-BARCGB22");

      await component.resolve();

      const resolveCalls = fakeHttp.post.mock.calls.filter(([url]) =>
        url.endsWith("/settlements/resolve"),
      );
      expect(resolveCalls.at(-1)?.[1]).toMatchObject({ currency: "USD" });
      expect(component.resolutionContractResult()).toMatchObject({
        mx: {
          chosenRoute: { ssiCode: "SSI-DEMO-024", currency: "USD" },
          canonicalRoles: {
            instructedAgent: "CITIUS33",
            creditorAgent: "CITIUS33",
          },
        },
      });
      expect(component.resolutionContractDecision()).toBe("RESOLVED");
      expect(
        JSON.stringify(component.resolutionContractResult()),
      ).not.toContain("SSI-DEMO-003");
    } finally {
      nextResolutionResponse = undefined;
    }
  });

  it("invalidates every resolution-derived panel when a routing input changes", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    await Promise.resolve();
    component.resolutionBanks.set([
      {
        bankServiceId: "BANK-SVC-NEW",
        bic: "DEUTDEFF",
        name: "Deutsche Bank",
        country: "DE",
        addressRef: "ADDR-DEUT",
        standard: "BIC",
      },
    ]);
    component.resolutionBanksError.set("");

    const seedAuthoritativeResult = () => {
      component.resolutionContractResult.set({
        mx: { httpStatus: 200, decision: "RESOLVED" },
        mt: { tags: { "58A": "BARCGB22" } },
      });
      component.resolutionConfirmation.set({} as never);
      component.resolutionRequestError.set("stale error");
    };
    const expectInvalidated = () => {
      expect(component.resolutionContractResult()).toBeNull();
      expect(component.resolutionResult()).toBeNull();
      expect(component.resolutionConfirmation()).toBeNull();
      expect(component.resolutionRequestError()).toBe("");
      expect(component.renderedSettlementOutput()).toBeNull();
    };
    const routingChanges: readonly (() => void)[] = [
      () => component.selectResolutionCounterpartyBankService("BANK-SVC-NEW"),
      () => component.selectResolutionCurrency("EUR"),
      () => component.selectResolutionSettlementCountry("DE"),
      () => component.selectResolutionBookingEntity("DE01"),
      () => component.selectResolutionValueDate("2026-09-12"),
      () => component.selectResolutionSettlementMarket("T2"),
      () => component.selectResolutionClearingSystem("TGT"),
      () => component.selectResolutionAmount("2000000"),
      () => component.selectResolutionReference("MT2XX-CHANGED"),
    ];

    for (const change of routingChanges) {
      seedAuthoritativeResult();
      change();
      expectInvalidated();
    }

    seedAuthoritativeResult();
    component.openPaymentMessage({
      order: 1,
      messageType: "MT202",
      description: "General Financial Institution Transfer",
      processingMode: "SINGLE",
      profileStatus: "PROFILE_VERIFIED",
      targetMessage: "pacs.009.001.08",
      businessService: "swift.cbprplus.04",
      selectable: true,
    });
    expectInvalidated();
  });

  it("switches response format without rerunning resolution", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    await Promise.resolve();
    component.resolutionBanksError.set("");
    component.resolutionCounterpartyBankServiceId.set("BANK-SVC-BARC");
    nextResolutionResponse = {
      mx: { httpStatus: 200, decision: "RESOLVED" },
      mt: { tags: { "58A": "BARCGB22" } },
    };

    try {
      await component.resolve();
      const resolveCount = fakeHttp.post.mock.calls.filter(([url]) =>
        url.endsWith("/settlements/resolve"),
      ).length;

      component.resolutionOutputFormat.set("MT");
      expect(component.renderedSettlementOutput()).toEqual({
        tags: { "58A": "BARCGB22" },
      });
      component.resolutionOutputFormat.set("MX");

      expect(
        fakeHttp.post.mock.calls.filter(([url]) =>
          url.endsWith("/settlements/resolve"),
        ),
      ).toHaveLength(resolveCount);
      expect(component.resolutionContractDecision()).toBe("RESOLVED");
    } finally {
      nextResolutionResponse = undefined;
    }
  });

  it("initialises the main workbench and handles local index interactions", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    await Promise.resolve();

    expect(component.view()).toBe("swiftdata");
    component.searchPaymentMessageIndex("MT202");
    expect(component.paymentMessageIndexSearch()).toBe("MT202");
    component.sortPaymentMessageIndexBy("description");
    expect(component.paymentMessageIndexSortKey()).toBe("description");
    component.sortPaymentMessageIndexBy("description");
    expect(component.paymentMessageIndexSortDirection()).toBe("desc");
    component.selectOwnershipTab("COUNTERPARTY");
    expect(component.ownershipTab()).toBe("COUNTERPARTY");
    component.searchCounterpartyInbox("bank");
    expect(component.counterpartyInboxSearch()).toBe("bank");
    component.selectCounterpartyPartyType("BANK_NO_SSI");
    expect(component.counterpartyPartyType()).toBe("BANK_NO_SSI");
    component.selectCounterpartyPartyType("CUSTOMER");
    expect(component.counterpartyPartyType()).toBe("CUSTOMER");
    component.sortCounterpartyInbox("COUNTRY");
    expect(component.counterpartyAriaSort("COUNTRY")).toBe("ascending");
    component.sortCounterpartyInbox("COUNTRY");
    expect(component.counterpartySortIndicator("COUNTRY")).toBe("↓");
    expect(component.counterpartyAriaSort("BIC_NAME")).toBe("none");
    component.sortOwnershipIndex("STATUS");
    expect(component.ownershipAriaSort("STATUS")).toBe("ascending");
    component.sortOwnershipIndex("STATUS");
    expect(component.ownershipSortIndicator("STATUS")).toBe("↓");
    expect(component.ownershipAriaSort("CURRENCY")).toBe("none");
    component.moveIndexPage(1);
    component.moveCounterpartyInboxPage(1);
    component.openCounterpartySsi("BANK-1");
    expect(component.selectedCounterpartyId()).toBe("BANK-1");
    component.closeCounterpartySsi();
    expect(component.selectedCounterpartyId()).toBe("");
    component.setTheme("dark");
    expect(component.theme()).toBe("dark");
  });

  it("splits bank SSI coverage into two tabs without opening an empty SSI detail", async () => {
    const { AppComponent } = await import("./app.component");
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
    component.rows.set([
      {
        id: "SSI-BANK",
        counterpartyId: "BANK-COVERED",
        scope: "REUSABLE",
        status: "ACTIVE",
        maker: "maker",
        ownershipType: "COUNTERPARTY",
        ownerParty: "BANK-COVERED",
        route: { currency: "USD", counterpartyBic: "BANK-COVERED" },
        version: 1,
      },
    ]);

    expect(
      component.counterpartyInbox().map((party) => party.counterpartyId),
    ).toEqual(["BANK-COVERED"]);
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

  it("sorts, paginates and opens API-backed audit evidence", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    await Promise.resolve();
    component.auditRows.set(
      Array.from({ length: 11 }, (_, index) => ({
        id: index + 1,
        ssi_id: `SSI-${index + 1}`,
        action: index % 2 === 0 ? "UPDATED" : "ACTIVATE",
        actor: `operator.${index + 1}`,
        occurred_at: `2026-09-10T00:${String(index).padStart(2, "0")}:00Z`,
        payload: JSON.stringify({ ssiCode: `SSI-DEMO-${index + 1}` }),
      })),
    );

    expect(component.auditTotalPages()).toBe(2);
    component.sortAuditBy("actor");
    expect(component.auditAriaSort("actor")).toBe("ascending");
    component.moveAuditPage(1);
    expect(component.auditCurrentPage()).toBe(2);
    const detail = component.pagedAuditRows()[0]!;
    component.openAuditDetail(detail);
    expect(component.selectedAuditDetail()?.eventId).toBe(detail.eventId);
    component.closeOverlayOnEscape();
    expect(component.selectedAuditDetail()).toBeNull();
  });

  it("drives payment, SSI maintenance, resolution, and tag-selection state", async () => {
    const { AppComponent } = await import("./app.component");
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

    component.paymentMessageIndex.set([
      {
        order: 1,
        messageType: "MT202",
        description: "General Financial Institution Transfer",
        processingMode: "SINGLE",
        profileStatus: "PROFILE_VERIFIED",
        targetMessage: "pacs.009.001.08",
        businessService: "swift.cbprplus.04",
        selectable: true,
      },
    ]);
    const scenario = component.paymentMessageScenarios()[0]!;
    component.openPaymentScenario(scenario);
    expect(component.paymentTransactionOpen()).toBe(true);
    component.togglePaymentScenarioSort();
    component.closePaymentTransaction();
    expect(component.paymentTransactionOpen()).toBe(false);

    component.navigate("resolver");
    component.navigate("treasury");
    component.navigate("tradefinance");
    component.navigate("audit");
    component.resolutionBanks.set([
      {
        bankServiceId: "BANK-SVC-1",
        bic: "CHASUS33",
        name: "Bank",
        country: "US",
        addressRef: "ADDR-1",
        standard: "BIC",
      },
    ]);
    component.selectResolutionCounterpartyBankService("BANK-SVC-1");
    component.selectResolutionCustomerId("CUSTOMER-1");
    component.selectResolutionCurrency("EUR");
    component.selectResolutionSettlementCountry("DE");
    component.selectResolutionBookingEntity("DE01");
    component.selectResolutionValueDate("2026-09-10");
    component.selectResolutionSettlementMarket("T2");
    await component.refreshResolutionClearingOptions();
    await component.resolve();
    component.selectResolutionRoute("SSI-1");
    component.clearResolution();
    component.resolutionResult.set({
      useCase: "PAYMENT_SSI",
      usage: "EXECUTABLE_SETTLEMENT",
      paymentExecutable: false,
      preSettlement: true,
      attemptId: "ATTEMPT-1",
      requestHash: "hash",
      decision: "RESOLVED",
      recommendedRoute: {
        ssiId: "SSI-1",
        ssiVersion: 1,
        counterpartyId: "BANK-1",
        route: { currency: "USD" },
        applicability: {
          id: "APP-1",
          ssiId: "SSI-1",
          consumer: "ANY",
          product: "ANY",
          businessFunction: "ANY",
          paymentLeg: "ANY",
          direction: "ANY",
          status: "ACTIVE",
          validFrom: "2026-01-01",
          validTo: "9999-12-31",
          version: 1,
        },
        fallbackTier: 0,
        rank: [1],
        evidence: [],
      },
      alternatives: [],
      excludedRoutes: [],
      explanation: "Exact match",
    });
    component.resolutionSelectedSsiId.set("SSI-1");
    await component.confirmResolution();

    const tagScenario = component.tagScenarios[0]!;
    component.chooseTagScenario(tagScenario.id);
    component.chooseTagSsi("SSI-1");
    component.selectTagCurrency("USD");
    component.selectTagCounterparty("CHASUS33");
    component.updateTagTransactionContext();
    component.searchTagCatalog("MT7");
    component.sortTagCatalog("description");
    component.sortTagCatalog("description");
    component.openTagTransaction(tagScenario.id);
    component.openTagMessage(tagScenario.descriptor.messageType);
    await component.extract();
    await component.generateTags();
    component.moveTagCatalogPage(1);
    component.cancelTagTransaction();
    expect(component.tagTransactionOpen()).toBe(false);
  });

  it("derives governed dashboard, payment, resolution, and tag state", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    await Promise.resolve();
    component.rows.set([]);
    component.counterpartyDirectory.set([]);
    component.paymentMessageIndex.set([]);
    component.finResolutionCatalogue.set([]);
    component.controlledTagCandidates.set([]);

    expect(component.visibleRows()).toEqual([]);
    expect(component.counterpartyInbox()).toEqual([]);
    expect(component.filteredCounterpartyInbox()).toEqual([]);
    expect(component.counterpartyInboxTotalPages()).toBe(1);
    expect(component.pagedCounterpartyInbox()).toEqual([]);
    expect(component.selectedCounterparty()).toBeNull();
    expect(component.indexTotalPages()).toBe(1);
    expect(component.pagedVisibleRows()).toEqual([]);
    expect(component.activeRows()).toEqual([]);
    expect(component.archivedCount()).toBe(0);
    expect(component.pending()).toEqual([]);
    expect(component.activeCount()).toBe(0);
    expect(component.hasPreviousBankPage()).toBe(false);
    expect(component.hasNextBankPage()).toBe(false);
    expect(component.hasPreviousCustomerPage()).toBe(false);
    expect(component.hasNextCustomerPage()).toBe(false);
    expect(component.resolutionCustomers()).toEqual([]);
    expect(component.resolutionSourceLabel()).toBe("Trade Finance");
    expect(component.resolutionCounterpartyId()).toBe("BARCGB22");
    expect(component.resolutionCounterpartyCountry()).toBe("GB");
    expect(component.resolutionCoveredCurrencies()).toEqual(new Set());
    expect(component.resolutionSelectedCurrencyCovered()).toBe(false);
    expect(component.resolutionClearingSystems()).toEqual([]);
    expect(component.resolutionBusinessService()).toBe("");
    expect(component.resolutionPaymentProfile().counterpartyType).toBe("BANK");
    expect(component.resolutionMtMessageType()).toBe("MT202");
    expect(component.resolutionBeneficiaryCustomer()).toBeUndefined();
    expect(component.resolvedCanonicalSettlement()).toBeNull();
    expect(component.renderedSettlementOutput()).toBeNull();
    expect(component.resolutionSelectableRoutes()).toEqual([]);
    expect(component.selectedResolutionRoute()).toBeNull();
    expect(component.resolutionHasManualRouteOverride()).toBe(false);
    expect(component.availableTagMessages()).toEqual([]);
    expect(component.tagCatalogTotalPages()).toBe(1);
    expect(component.pagedTagScenarios()).toEqual([]);
    expect(component.tagSelectedCurrencyCovered()).toBe(false);
    expect(component.eligibleSuggestionBanks()).toEqual([]);
    expect(component.mt760ValidationIssue()).toBe("");
    expect(component.mt400ValidationIssue()).toBe("");
    expect(component.tagSuggestionValidationIssue()).toBe("");
    expect(component.tagSsiDerivationReason()).toBe("NO_SSI_FOUND");
    expect(component.tagSupportRows()).toBeDefined();
    expect(component.visibleTagSupportRows()).toBeDefined();
  });

  it("validates dynamic identity form rules for banks and customers", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();
    const counterparty = component
      .fields()
      .find((field) => field.key === "counterpartyId")!;
    const expressions = counterparty.expressions!;
    const evaluate = (key: string, counterpartyType: "BANK" | "CUSTOMER") =>
      (expressions[key] as (field: unknown) => unknown)({
        model: { route: { counterpartyType } },
      });

    expect(evaluate("props.minLength", "BANK")).toBe(8);
    expect(evaluate("props.minLength", "CUSTOMER")).toBe(3);
    expect(evaluate("props.maxLength", "BANK")).toBe(11);
    expect(evaluate("props.maxLength", "CUSTOMER")).toBe(35);
    expect(typeof evaluate("props.pattern", "BANK")).toBe("string");
    expect(evaluate("props.pattern", "CUSTOMER")).toBeInstanceOf(RegExp);
    expect(String(evaluate("props.validationMessage", "BANK"))).toContain(
      "BIC8",
    );
    expect(String(evaluate("props.validationMessage", "CUSTOMER"))).toContain(
      "Customer ID",
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

  it("derives populated ownership, customer-payment, and settlement state", async () => {
    const { AppComponent } = await import("./app.component");
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
    component.rows.set([
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
    ]);
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
    component.resolutionCounterpartyBic.set("BARCGB22");
    component.resolutionBanksError.set("");
    expect(component.resolutionCoveredCurrencies()).toEqual(new Set(["USD"]));
    expect(component.resolutionSelectedCurrencyCovered()).toBe(true);
    component.resolutionBanks.set([
      {
        bankServiceId: "BANK-SVC-BARC",
        bic: "BARCGB22",
        name: "Barclays",
        country: "GB",
        addressRef: "ADDR-BARC",
        standard: "BIC",
      },
    ]);
    component.resolutionCounterpartyBankServiceId.set("BANK-SVC-BARC");
    expect(component.selectedResolutionBank()?.bic).toBe("BARCGB22");
    component.paymentMessageIndex.set([
      {
        messageType: "MT202",
        targetMessage: "pacs.009.001.08",
        description: "FI transfer",
        direction: "OUTGOING",
        businessService: "swift.cbprplus.03",
        selectable: true,
      },
    ]);
    expect(component.filteredPaymentMessageIndex()).toHaveLength(1);
    component.ownershipSearch.set("chas");
    expect(component.visibleRows()).toHaveLength(1);
    component.selectOwnershipTab("COUNTERPARTY");
    component.selectCounterpartyPartyType("CUSTOMER");
    component.selectedCounterpartyId.set("CUST-1");
    expect(component.counterpartyInbox()).toHaveLength(1);
    expect(component.selectedCounterparty()?.counterpartyId).toBe("CUST-1");
    expect(component.activeCount()).toBe(1);
    expect(component.archivedCount()).toBe(1);
    expect(component.pending()).toHaveLength(1);
    component.deleteReason.set("valid reason");
    expect(component.canConfirmDelete()).toBe(true);

    component.resolutionConsumer.set("TREASURY");
    expect(component.resolutionSourceLabel()).toBe("Treasury");
    component.resolutionCounterpartyType.set("CUSTOMER");
    component.resolutionCustomerId.set("CUST-1");
    expect(component.resolutionCounterpartyId()).toBe("CUST-1");
    expect(component.resolutionCounterpartyCountry()).toBe("US");
    expect(component.resolutionBeneficiaryCustomer()).toMatchObject({
      customerId: "CUST-1",
      accountReference: "ACCT-1",
    });
    component.clearingSystems.set([
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
    ]);
    component.eligibleClearingSystemCodes.set(["T2"]);
    expect(component.resolutionClearingSystems()).toHaveLength(1);

    const settlement = {
      finMessageType: "MT202" as const,
      instructingAgentBic: "AAAAGB2L",
      instructedAgentBic: "BBBBUS33",
      deliveryAgentBic: "AAAAGB2L",
      intermediaryAgentBics: ["CCCCDEFF"],
      creditorAgentBic: "DDDDUS44",
      beneficiaryInstitutionBic: "EEEEJPJT",
      reimbursementAgentBics: [],
      settlementAccountReference: "ACCT-1",
      settlementCountry: "US",
      settlementMarket: "FEDWIRE",
      clearingSystem: "FEDWIRE",
      schemeType: "RTGS",
      fieldProvenance: {},
    };
    component.resolutionResult.set({
      useCase: "PAYMENT_SSI",
      usage: "EXECUTABLE_SETTLEMENT",
      paymentExecutable: false,
      preSettlement: true,
      attemptId: "ATTEMPT-2",
      requestHash: "hash",
      decision: "NO_SSI_FOUND",
      alternatives: [],
      excludedRoutes: [],
      explanation: "Preview only",
      canonicalSettlementPreview: settlement,
    });
    expect(component.resolvedCanonicalSettlement()).toEqual(settlement);
    component.resolutionOutputFormat.set("MT");
    expect(component.renderedSettlementOutput()).toHaveProperty("58A");

    component.finResolutionCatalogue.set([
      {
        messageType: "MT300",
        resolutionMode: "TREASURY",
        profileSlots: ["B1/57A"],
        ssiResolvableTags: ["57A"],
      },
      {
        messageType: "MT999",
        resolutionMode: "TREASURY",
        profileSlots: [],
        ssiResolvableTags: [],
      },
    ]);
    component.view.set("treasury");
    expect(component.availableTagMessages()).toHaveLength(2);
    component.tagCatalogSearch.set("foreign");
    expect(component.availableTagMessages()[0]?.messageType).toBe("MT300");
    component.navigate("treasury");
    expect(component.selectedTagScenario().descriptor.messageType).toBe(
      "MT300",
    );
    expect(component.tagScenarioUsesSettlementSsi()).toBe(true);
    expect(component.tagUpstreamContext().messageType).toBe("MT300");
    const mt760 = component.tagScenarios.find(
      (scenario) => scenario.descriptor.messageType === "MT760",
    )!;
    component.chooseTagScenario(mt760.id);
    component.mt760ConfirmationInstructions.set("CONFIRM");
    expect(component.mt760ValidationIssue()).toContain(
      "UPSTREAM_TRANSACTION_CONTEXT",
    );
    await component.generateTags();
    component.mt760ConfirmationInstructions.set("WITHOUT");
    expect(component.mt760ValidationIssue()).toBe("");

    const mt400 = component.tagScenarios.find(
      (scenario) => scenario.descriptor.messageType === "MT400",
    )!;
    component.chooseTagScenario(mt400.id);
    expect(component.mt400SettlementMode()).not.toBe("UNVERIFIED");
    await component.generateTags();

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
    await component.openBicPicker("beneficiaryBic", "Beneficiary");
    component.selectBank({
      bankServiceId: "BANK-1",
      bic: "CHASUS33",
      name: "Bank",
      country: "US",
      addressRef: "ADDR-1",
      standard: "BIC",
    });
    expect(setValue).toHaveBeenCalled();
    expect(component.selectedBic("counterpartyId")).toBe("CUSTOMER");
    component.resolutionClearingSystem.set("UNKNOWN");
    await component.refreshResolutionClearingOptions();
    expect(component.resolutionClearingSystem()).toBe("");

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

  it("fails closed when reference, resolution, and maintenance services are offline", async () => {
    rejectHttp = true;
    try {
      const { AppComponent } = await import("./app.component");
      const component = new AppComponent();
      component.ngOnInit();
      await Promise.resolve();
      await Promise.resolve();
      expect(component.resolutionBanksError()).toBe("BANK_SERVICE_UNAVAILABLE");
      expect(component.paymentMessageIndexError()).toBe(
        "PAYMENT_MESSAGE_INDEX_UNAVAILABLE",
      );

      await component.refresh();
      await component.loadPaymentMessageIndex();
      await component.loadFinResolutionCatalogue();
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
      await component.act(row, "activate");
      await component.revise(row);
      component.requestDelete(row);
      component.deleteReason.set("duplicate record");
      await component.confirmDelete();

      component.resolutionBanksError.set("");
      component.resolutionCounterpartyBankServiceId.set("BANK-SVC-1");
      await component.refreshResolutionClearingOptions();
      await component.resolve();
      component.resolutionResult.set({
        useCase: "PAYMENT_SSI",
        usage: "EXECUTABLE_SETTLEMENT",
        paymentExecutable: false,
        preSettlement: true,
        attemptId: "ATTEMPT-1",
        requestHash: "hash",
        decision: "RESOLVED",
        recommendedRoute: {
          ssiId: "SSI-1",
          ssiVersion: 1,
          counterpartyId: "BANK-1",
          route: { currency: "USD" },
          applicability: {
            id: "APP-1",
            ssiId: "SSI-1",
            consumer: "ANY",
            product: "ANY",
            businessFunction: "ANY",
            paymentLeg: "ANY",
            direction: "ANY",
            status: "ACTIVE",
            validFrom: "2026-01-01",
            validTo: "9999-12-31",
            version: 1,
          },
          fallbackTier: 0,
          rank: [1],
          evidence: [],
        },
        alternatives: [],
        excludedRoutes: [],
        explanation: "Exact match",
      });
      component.resolutionSelectedSsiId.set("SSI-1");
      await component.confirmResolution();
      await component.extract();
      await component.generateTags();
      await component.openBicPicker("beneficiaryBic", "Beneficiary bank");
      await component.searchBanks("bank");
      await component.moveBankPage(1);
      await component.searchCustomers("customer");
      await component.moveCustomerPage(1);
      component.navigate("audit");
      await Promise.resolve();

      expect(component.notice()?.kind).toMatch(/warning|error/);
      expect(component.resolutionLoading()).toBe(false);
      expect(component.resolutionConfirming()).toBe(false);
      expect(component.tagLoading()).toBe(false);
    } finally {
      rejectHttp = false;
    }
  });

  it("initialises SWIFT Data CRUD and applies local filtering and sorting", async () => {
    const { SwiftDataCrudComponent } =
      await import("./swift-data-crud.component");
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
      await import("./swift-data-crud.component");
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
    const row = {
      id: "ROW-1",
      status: "DRAFT",
      version: 1,
      maker: "maker",
      route: { currency: "USD" },
    };
    component.rows.set([row]);
    component.view(row);
    const preventDefault = jest.fn();
    component.openRowFromKeyboard(
      { key: "Enter", preventDefault } as KeyboardEvent,
      row,
    );
    expect(preventDefault).toHaveBeenCalled();
    component.openRowFromKeyboard(
      { key: "Escape", preventDefault } as KeyboardEvent,
      row,
    );
    expect(component.rowLabel(row)).toContain("ROW-1");
    expect(component.coreFields(resource)).toHaveLength(2);
    expect(component.detailFields(resource)).toHaveLength(2);
    const messageTypeField = component
      .fields()
      .find((field) => field.key === "messageTypes")!;
    const validateMessageTypes = messageTypeField.validators?.["messageTypes"]
      ?.expression as (control: { value: string }) => boolean;
    expect(validateMessageTypes({ value: "MT202, pacs.009.001.08" })).toBe(
      true,
    );
    expect(validateMessageTypes({ value: "javascript:alert(1)" })).toBe(false);
    component.edit(row);
    component.model = {
      id: "ROW-1",
      route: { currency: "USD" },
      messageTypes: "MT202, MT202COV",
      amount: "25",
    };
    await component.save();
    await component.act(row, "submit");
    await component.revise({ ...row, status: "ACTIVE" });
    component.requestRevoke(row);
    component.revokeReason.set("duplicate record");
    await component.confirmRevoke();

    expect(component.value({ ...row, scope: "REUSABLE" }, "scope")).toBe(
      "STANDING",
    );
    expect(
      component.value({ ...row, scope: "TRANSACTION_ONLY" }, "scope"),
    ).toBe("TRANSACTION_SPECIFIC");
    expect(component.value({ ...row, list: ["A", "B"] }, "list")).toBe("A, B");
    expect(component.columnValue(row, resource.columns[1]!)).toBe(
      "USD / DRAFT",
    );
    expect(component.columnPath(resource.columns[1]!)).toBe("route.currency");
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
  }, 15_000);

  it("provides native Formly select and BIC behaviors", async () => {
    const { BicInputType, NativeSelectType } = await import("./formly-types");
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
  });

  it("fails closed for SWIFT Data service errors and malformed imports", async () => {
    rejectHttp = true;
    try {
      const { SwiftDataCrudComponent } =
        await import("./swift-data-crud.component");
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
      component.requestRevoke(row);
      component.revokeReason.set("duplicate record");
      await component.confirmRevoke();
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
});
