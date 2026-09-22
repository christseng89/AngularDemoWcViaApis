/** @jest-environment jsdom */

import { of } from "rxjs";

type TestSignal<T> = (() => T) & { set(value: T): void };

const testSignal = <T>(initial: T): TestSignal<T> => {
  let value = initial;
  const read = (() => value) as TestSignal<T>;
  read.set = (next) => {
    value = next;
  };
  return read;
};

const mockEffects: Array<() => void> = [];
const mockInjected: unknown[] = [];
const mockViewChildren: unknown[] = [];
const mockOutput = () => ({ emit: jest.fn() });

jest.mock("@angular/core", () => ({
  ChangeDetectionStrategy: { OnPush: "OnPush" },
  Component:
    () =>
    <T>(target: T): T =>
      target,
  Injectable:
    () =>
    <T>(target: T): T =>
      target,
  InjectionToken: class {
    constructor(readonly description: string) {}
  },
  ElementRef: class {
    constructor(readonly nativeElement: unknown) {}
  },
  afterNextRender: (callback: () => void) => callback(),
  computed: <T>(compute: () => T): (() => T) => compute,
  effect: (callback: () => void) => {
    mockEffects.push(callback);
  },
  inject: () => mockInjected.shift(),
  input: Object.assign(<T>(value: T) => testSignal(value), {
    required: <T>() => testSignal<T>(undefined as T),
  }),
  output: mockOutput,
  signal: testSignal,
  viewChild: () => testSignal<unknown>(mockViewChildren.shift()),
}));

class MockHttpParams {
  constructor(private readonly values: Readonly<Record<string, string>> = {}) {}
  set(name: string, value: string): MockHttpParams {
    return new MockHttpParams({ ...this.values, [name]: value });
  }
  get(name: string): string | null {
    return this.values[name] ?? null;
  }
}

jest.mock("@angular/common/http", () => ({
  HttpClient: class {},
  HttpParams: MockHttpParams,
}));
jest.mock("@angular/common", () => ({ DOCUMENT: Symbol("DOCUMENT") }));

jest.mock("../../../app/resolution-workbench/parameter-lookup.facade", () => ({
  ParameterLookupFacade: class {},
}));
jest.mock("../../../app/resolution-workbench/generic-parameter-form.component", () => ({
  GenericParameterFormComponent: class {},
}));
jest.mock("../../../app/resolution-workbench/resolution-failure.component", () => ({
  ResolutionFailureComponent: class {},
}));
jest.mock("../../../app/resolution-workbench/resolution-workbench.facade", () => ({
  ResolutionWorkbenchFacade: class {},
}));

const metadata = (provider: "BANK_SERVICE" | "SSI_COUNTERPARTY") => ({
  provider,
  action: provider,
  endpoint: `/api/v1/resolution-page-definitions/lookups/${provider.toLowerCase()}`,
  valueField: "bankServiceId" as const,
  displayField: "bic" as const,
  validationField: "bic" as const,
  dependency: {
    dependsOnFieldIds: ["context.currency", "context.valueDate"],
    invalidatesFieldIds: [],
    selectionPolicy: "SELECTABLE" as const,
  },
});

const item = {
  provider: "SSI_COUNTERPARTY" as const,
  action: "SSI_COUNTERPARTY" as const,
  bankServiceId: "BANK-SVC-DEUTDEFF",
  bic: "DEUTDEFF",
  displayValue: "DEUTDEFF — Deutsche Bank AG",
  bankName: "Deutsche Bank AG",
};

describe("Portal new-code component behavior", () => {
  beforeEach(() => {
    mockEffects.length = 0;
    mockInjected.length = 0;
    jest.clearAllMocks();
  });

  it("submits governed HTTP parameters and rejects non-OAS endpoints or methods", async () => {
    const http = {
      get: jest.fn((_url: string, _options?: unknown) => of(item)),
      post: jest.fn((_url: string, body: unknown) => of(body)),
    };
    mockInjected.push(http);
    const { HttpResolutionPageParameterClient } =
      await import("../../../app/resolution-workbench/page-parameter.client");
    const client = new HttpResolutionPageParameterClient();

    client.loadIndex("PAYMENT").subscribe();
    client
      .load({
        standardsRelease: "SR2026",
        messageFamily: "MT2",
        messageType: "MT202COV",
        direction: "OUTGOING",
        businessScenarioId: "COV",
        businessService: "swift.cbprplus.cov.04",
        businessDomain: "PAYMENT",
      })
      .subscribe();
    const loadedParams = http.get.mock.calls[1]?.[1] as {
      params: { get(name: string): string | null };
    };
    expect(loadedParams.params.get("businessScenarioId")).toBe("COV");
    expect(loadedParams.params.get("businessService")).toBe(
      "swift.cbprplus.cov.04",
    );
    expect(loadedParams.params.get("businessDomain")).toBe("PAYMENT");

    const execution = {
      action: "RESOLVE_SSI" as const,
      owner: "SSI_FIELD_RESOLUTION_API" as const,
      endpoint: "/api/v1/resolution-page-definitions/execute",
      method: "POST" as const,
      expectedHttp: [200],
    };
    const request = {
      definitionId: "D",
      definitionVersion: "1",
      scenarioId: "S",
      fixtureBindingId: "F",
      contractSha256: "a".repeat(64),
      values: {},
    };
    client.execute(execution, request).subscribe();
    expect(http.post).toHaveBeenCalledWith(execution.endpoint, request);
    expect(() =>
      client.execute(
        { ...execution, endpoint: "https://evil.invalid/x" },
        request,
      ),
    ).toThrow("PAGE_PARAMETER_ENDPOINT_NOT_SAME_ORIGIN");
    expect(() =>
      client.execute({ ...execution, method: "GET" as never }, request),
    ).toThrow("PAGE_PARAMETER_HTTP_METHOD_NOT_SUPPORTED");
  });

  it("normalises lookup envelopes and sends only governed SSI dependencies", async () => {
    const http = {
      get: jest.fn(() => of(item)),
      post: jest.fn(),
    };
    mockInjected.push(http);
    const { HttpResolutionPageParameterClient } =
      await import("../../../app/resolution-workbench/page-parameter.client");
    const client = new HttpResolutionPageParameterClient();
    let envelope: unknown;
    client
      .lookup(metadata("SSI_COUNTERPARTY"), {
        query: "deut",
        bankServiceId: "BANK-SVC-DEUTDEFF",
        scenarioId: "MT202-OP-DIRECT",
        messageType: "MT202",
        sequence: "A",
        dependencyValues: {
          "context.currency": "EUR",
          "context.valueDate": "2026-09-14",
        },
      })
      .subscribe((value) => (envelope = value));

    expect(envelope).toMatchObject({ items: [item] });
    const params = (
      http.get.mock.calls[0]?.[1] as {
        params: { get(name: string): string | null };
      }
    ).params;
    expect(params.get("scenarioId")).toBe("MT202-OP-DIRECT");
    expect(params.get("messageType")).toBe("MT202");
    expect(params.get("sequence")).toBe("A");
    expect(params.get("currency")).toBe("EUR");
    expect(params.get("valueDate")).toBe("2026-09-14");

    http.get.mockReturnValueOnce(
      of({ provider: "BANK_SERVICE", action: "BANK_SERVICE", items: [item] }),
    );
    client
      .lookup(metadata("BANK_SERVICE"), { query: "", bankServiceId: "B1" })
      .subscribe();
    const bankParams = (
      http.get.mock.calls[1]?.[1] as {
        params: { get(name: string): string | null };
      }
    ).params;
    expect(bankParams.get("query")).toBeNull();
    expect(bankParams.get("bankServiceId")).toBe("B1");
    expect(() =>
      client.lookup({ ...metadata("BANK_SERVICE"), endpoint: "//evil/x" }, {}),
    ).toThrow("PAGE_PARAMETER_ENDPOINT_NOT_SAME_ORIGIN");
  });

  it("covers Bank Service picker events and both focus-wrap directions", async () => {
    const focus = jest.fn();
    mockViewChildren.push(undefined, { nativeElement: { focus } });
    const { BankServicePickerDialogComponent } =
      await import("../../../app/bank-service-picker-dialog.component");
    const component = new BankServicePickerDialogComponent();
    expect(focus).toHaveBeenCalled();
    component.search("  deutsch  ");
    component.cancel();
    expect(component.searchRequested.emit).toHaveBeenCalledWith("deutsch");
    expect(component.cancelled.emit).toHaveBeenCalled();

    component.retainFocus(new KeyboardEvent("keydown"));
    const emptyRoot = document.createElement("div");
    (component as never as { dialog: TestSignal<unknown> }).dialog.set({
      nativeElement: emptyRoot,
    });
    component.retainFocus(new KeyboardEvent("keydown"));

    const root = document.createElement("div");
    const first = document.createElement("button");
    const last = document.createElement("button");
    root.append(first, last);
    document.body.append(root);
    (component as never as { dialog: TestSignal<unknown> }).dialog.set({
      nativeElement: root,
    });

    first.focus();
    const backward = new KeyboardEvent("keydown", { shiftKey: true });
    jest.spyOn(backward, "preventDefault");
    component.retainFocus(backward);
    expect(backward.preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(last);

    const forward = new KeyboardEvent("keydown");
    jest.spyOn(forward, "preventDefault");
    component.retainFocus(forward);
    expect(forward.preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(first);

    const middle = document.createElement("button");
    root.insertBefore(middle, last);
    middle.focus();
    const unchanged = new KeyboardEvent("keydown");
    jest.spyOn(unchanged, "preventDefault");
    component.retainFocus(unchanged);
    expect(unchanged.preventDefault).not.toHaveBeenCalled();
  });

  it("covers lookup labels, guarded opening, paging, selection and focus restoration", async () => {
    const facade = {
      phase: testSignal("ready"),
      items: testSignal([item]),
      selected: testSignal(null),
      defaultSelection: testSignal<string | null>(null),
      eligibilitySnapshot: testSignal(null),
      error: testSignal<string | null>(null),
      clear: jest.fn(),
      resolve: jest.fn(),
      search: jest.fn(),
      select: jest.fn(() => item.bankServiceId),
    };
    mockInjected.push(facade);
    const { BankServiceLookupComponent } =
      await import("../../../app/resolution-workbench/bank-service-lookup.component");
    const component = new BankServiceLookupComponent();
    component.metadata.set(metadata("SSI_COUNTERPARTY"));
    component.inputId.set("counterparty");
    component.pageSize.set(1);
    component.context.set({
      dependencyValues: {
        "context.currency": "USD",
        "context.valueDate": "2026-09-14",
      },
    });
    mockEffects.forEach((run) => run());

    expect(component.serviceLabel()).toBe("SSI COUNTERPARTY");
    expect(component.lookupAvailable()).toBe(true);
    expect(component.selectedDescription(item)).toBe("Deutsche Bank AG");
    const opener = document.createElement("button");
    document.body.append(opener);
    component.open({ currentTarget: opener } as unknown as Event);
    expect(component.pickerOpen()).toBe(true);
    component.search("deut");
    expect(facade.search).toHaveBeenCalledWith(
      component.metadata(),
      "deut",
      component.context(),
    );
    component.moveToPage(99);
    expect(component.pickerPage()).toBe(1);
    component.select(item);
    expect(component.valueSelected.emit).toHaveBeenCalledWith(
      item.bankServiceId,
    );
    expect(component.pickerOpen()).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(opener);

    component.disabled.set(true);
    component.open({ currentTarget: opener } as unknown as Event);
    component.select(item);
    expect(facade.select).toHaveBeenCalledTimes(1);
    component.metadata.set(metadata("BANK_SERVICE"));
    expect(component.serviceLabel()).toBe("BANK SERVICE");
    expect(component.emptyMessage()).toBe("No matching Bank Service.");
    expect(component.emptySelectionLabel()).toBe("No bank selected.");
    expect(component.loadingMessage()).toBe("Loading Bank Services…");
    component.metadata.set({
      ...metadata("BANK_SERVICE"),
      provider: "NOSTRO_ACCOUNT",
      action: "NOSTRO_ACCOUNT",
      valueField: "nostroId",
      displayField: "displayValue",
      validationField: "nostroId",
    });
    expect(component.serviceLabel()).toBe("OWN ACCOUNT");
    expect(component.emptyMessage()).toBe("No eligible own account.");
    expect(component.emptySelectionLabel()).toBe("No own account selected.");
    expect(component.loadingMessage()).toBe("Loading eligible own accounts…");
  });

  it("covers governed lookup prerequisites, atomic defaults and Nostro picker projection", async () => {
    const nostroItem = {
      provider: "NOSTRO_ACCOUNT" as const,
      action: "NOSTRO_ACCOUNT" as const,
      nostroId: "NOSTRO-USD-1",
      version: 2,
      maskedAccountRef: "USD-PRIMARY",
      displayValue: "USD-PRIMARY — CITIUS33",
    };
    const facade = {
      phase: testSignal("ready"),
      items: testSignal([nostroItem]),
      selected: testSignal<typeof item | null>(null),
      defaultSelection: testSignal<string | null>(null),
      eligibilitySnapshot: testSignal(null),
      error: testSignal<string | null>(null),
      clear: jest.fn(),
      resolve: jest.fn(),
      search: jest.fn(),
      select: jest.fn(() => nostroItem.nostroId),
    };
    mockInjected.push(facade);
    const { BankServiceLookupComponent } =
      await import("../../../app/resolution-workbench/bank-service-lookup.component");
    const component = new BankServiceLookupComponent();
    component.metadata.set({
      ...metadata("BANK_SERVICE"),
      provider: "NOSTRO_ACCOUNT",
      action: "NOSTRO_ACCOUNT",
      valueField: "nostroId",
      displayField: "displayValue",
      validationField: "nostroId",
    });
    component.inputId.set("own-account");
    component.pageSize.set(5);
    component.dependencyLabels.set({
      "context.currency": "Currency",
      "context.valueDate": "Value Date",
    });
    component.context.set({
      dependencyValues: {
        "context.currency": "USD",
        "context.valueDate": "",
      },
    });

    expect(component.missingDependencyLabels()).toEqual(["Value Date"]);
    expect(component.prerequisiteMessage()).toBe(
      "Complete Value Date before selecting a Bank Service.",
    );
    expect(component.pickerItems()).toEqual([
      expect.objectContaining({
        bankServiceId: "NOSTRO-USD-1",
        bic: "USD-PRIMARY",
      }),
    ]);
    mockEffects[1]!();
    expect(facade.clear).toHaveBeenCalled();

    component.context.set({
      dependencyValues: {
        "context.currency": "USD",
        "context.valueDate": "2026-09-15",
      },
    });
    facade.selected.set(item);
    mockEffects[0]!();
    expect(component.displayedSelection()).toBe(item);
    facade.selected.set(null);
    facade.phase.set("loading");
    mockEffects[0]!();
    expect(component.displayedSelection()).toBeNull();

    component.pickerOpen.set(true);
    mockEffects[3]!();
    expect(facade.search).toHaveBeenCalled();

    facade.phase.set("ready");
    facade.defaultSelection.set("NOSTRO-USD-1");
    mockEffects[4]!();
    mockEffects[4]!();
    expect(component.valueSelected.emit).toHaveBeenCalledTimes(1);
    expect(component.valueSelected.emit).toHaveBeenCalledWith("NOSTRO-USD-1");
  });

  it("maps every result outcome title and resolves the selected scenario label", async () => {
    const { ResolutionEvidenceComponent } =
      await import("../../../app/resolution-workbench/resolution-evidence.component");
    const component = new ResolutionEvidenceComponent();
    const result = {
      definitionId: "D",
      definitionVersion: "1",
      scenarioId: "S",
      fixtureBindingId: "F",
      outcome: "RESOLVED" as const,
      payloadGenerated: true,
      confirmedResolutionCreated: false,
      repairQueueCreated: false,
      fields: [],
      outputs: [],
      evidence: {
        correlationId: "C",
        owner: "SSI_FIELD_RESOLUTION_API" as const,
        action: "RESOLVE_SSI" as const,
        executorIdentity: "E",
        requestSha256: "a".repeat(64),
        responseSha256: "b".repeat(64),
        ruleIds: [],
      },
    };
    component.result.set(result);
    component.page.set({
      scenarios: [{ id: "S", label: "Direct route" }],
    } as never);
    expect(component.scenarioLabel()).toBe("Direct route");
    expect(component.outcomeTitle()).toBe("SSI resolved");
    expect(component.resolutionDomain()).toBe("");
    for (const [outcome, title] of [
      ["NOT_REQUIRED", "SSI not required"],
      ["NO_ELIGIBLE_SSI", "No eligible SSI found"],
      ["VALIDATION_REJECTED", "Details need attention"],
      ["REFERENCE_ONLY", "SSI reference completed"],
    ] as const) {
      component.result.set({ ...result, outcome });
      expect(component.outcomeTitle()).toBe(title);
    }
    component.result.set({ ...result, scenarioId: "UNKNOWN" });
    expect(component.scenarioLabel()).toBe("Selected scenario");
  });

  it("projects result table rows, route and empty message", async () => {
    const { ResolutionResultTableComponent } =
      await import("../../../app/resolution-workbench/resolution-result-table.component");
    const component = new ResolutionResultTableComponent();
    component.result.set({
      outcome: "NOT_REQUIRED",
      fields: [],
      outputs: [],
    } as never);
    expect(component.rows()).toEqual([]);
    expect(component.route()).toBeUndefined();
    expect(component.emptyMessage()).toContain("not required");
  });

  it("covers result dialog close and focus containment", async () => {
    const focus = jest.fn();
    mockViewChildren.push(undefined, { nativeElement: { focus } });
    const { ResolutionResultDialogComponent } =
      await import("../../../app/resolution-workbench/resolution-result-dialog.component");
    const component = new ResolutionResultDialogComponent();
    expect(focus).toHaveBeenCalled();
    component.close();
    expect(component.closed.emit).toHaveBeenCalled();
    component.retainFocus(new KeyboardEvent("keydown"));

    const emptyRoot = document.createElement("div");
    (component as never as { dialog: TestSignal<unknown> }).dialog.set({
      nativeElement: emptyRoot,
    });
    component.retainFocus(new KeyboardEvent("keydown"));

    const root = document.createElement("div");
    const first = document.createElement("button");
    const last = document.createElement("a");
    last.href = "#";
    root.append(first, last);
    document.body.append(root);
    (component as never as { dialog: TestSignal<unknown> }).dialog.set({
      nativeElement: root,
    });
    first.focus();
    component.retainFocus(new KeyboardEvent("keydown", { shiftKey: true }));
    expect(document.activeElement).toBe(last);
    component.retainFocus(new KeyboardEvent("keydown"));
    expect(document.activeElement).toBe(first);
    const middle = document.createElement("button");
    root.insertBefore(middle, last);
    middle.focus();
    const unchanged = new KeyboardEvent("keydown");
    jest.spyOn(unchanged, "preventDefault");
    component.retainFocus(unchanged);
    expect(unchanged.preventDefault).not.toHaveBeenCalled();
  });

  it("covers workbench loading, submission, retry, cancel and focus restore", async () => {
    const facade = {
      model: testSignal(null),
      loading: testSignal(false),
      submitting: testSignal(false),
      failure: testSignal(null),
      result: testSignal(null),
      load: jest.fn(),
      execute: jest.fn(),
      dismissResult: jest.fn(),
    };
    mockInjected.push(facade, document);
    const { ResolutionWorkbenchComponent } =
      await import("../../../app/resolution-workbench/resolution-workbench.component");
    const component = new ResolutionWorkbenchComponent();
    const selection = {
      query: {
        standardsRelease: "SR2026",
        messageFamily: "MT2",
        messageType: "MT202",
        direction: "OUTGOING" as const,
      },
      selectedScenarioId: "MT202-OP-DIRECT",
    };
    component.selection.set(selection);
    component.pageSize.set(10);
    mockEffects.forEach((run) => run());
    expect(facade.load).toHaveBeenCalledWith(
      selection.query,
      selection.selectedScenarioId,
    );

    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    component.submit({ values: { "context.currency": "USD" } } as never);
    expect(facade.execute).toHaveBeenCalledWith({ "context.currency": "USD" });
    component.retry();
    component.cancel();
    expect(component.cancelled.emit).toHaveBeenCalledTimes(1);
    facade.submitting.set(true);
    component.cancel();
    expect(component.cancelled.emit).toHaveBeenCalledTimes(1);
    component.closeResult();
    await Promise.resolve();
    expect(facade.dismissResult).toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
  });
});
