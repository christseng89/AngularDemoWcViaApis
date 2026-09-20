import { of, throwError } from "rxjs";
import { readFileSync } from "node:fs";

type TestSignal<T> = (() => T) & { set(value: T): void };
const testSignal = <T>(initial: T): TestSignal<T> => {
  let value = initial;
  const read = (() => value) as TestSignal<T>;
  read.set = (next) => {
    value = next;
  };
  return read;
};

const emitted: unknown[] = [];
const runtime = {
  runtimeEnvironment: "demo",
  developmentEnabled: true,
  reloadAvailable: true,
  fixtureId: "SSI-DEMO",
  seedSha256: "a".repeat(64),
  statusPolicyVersion: "SSI-CONFIG-HTTP-01",
};
let reloadError = false;
let runtimeError = false;
const service = {
  currencyContract: jest.fn(() => of({ "x-ui-inquiries": [{ id: "resolution-currency", endpoint: "settings/resolution-currencies", mode: "INDEX_ONLY", columns: [{ path: "currency", label: "Currency" }] }] })),
  resolutionCurrencies: jest.fn(() => of({ items: [{ businessDomain: "PAYMENT", currency: "USD", status: "ACTIVE", source: "SSI", lastResyncAt: null }], page: 1, pageSize: 25, totalItems: 1, totalPages: 1 })),
  resyncResolutionCurrencies: jest.fn(() => of({ discovered: 1, inserted: 0, unchanged: 1, activated: 0, inactivated: 0 })),
  runtime: jest.fn(() =>
    runtimeError
      ? throwError(() => new Error("runtime unavailable"))
      : of(runtime),
  ),
  reloadDevelopmentData: jest.fn(() =>
    reloadError
      ? throwError(() => ({ error: { code: "INVALID_DEMO_CONTROL_PASSWORD" } }))
      : of({
          code: "DEMO_DATA_RELOADED",
          completedAt: "2026-09-12T00:00:00Z",
          snapshotHash: "c".repeat(64),
          snapshotIdentityMethod: "LOGICAL",
          importedRows: { ssi: 42, nostro: 159 },
        }),
  ),
};

jest.mock("@angular/core", () => ({
  ChangeDetectionStrategy: { OnPush: "OnPush" },
  Component:
    () =>
    <T>(target: T): T =>
      target,
  ElementRef: class {},
  inject: () => service,
  input: Object.assign(<T>(value: T) => testSignal(value), {
    required: <T>() => testSignal<T>("system" as T),
  }),
  output: () => ({ emit: (value: unknown) => emitted.push(value) }),
  signal: testSignal,
  viewChild: () => () => undefined,
}));
jest.mock("@angular/common", () => ({ UpperCasePipe: class {} }));
jest.mock("./alert.component", () => ({ AlertComponent: class {} }));
jest.mock("./governance-index-table.component", () => ({ GovernanceIndexTableComponent: class {} }));
jest.mock("./runtime-settings.service", () => ({
  RuntimeSettingsService: class {},
}));

describe("SettingsPageComponent", () => {
  it("does not request or render a DB logical snapshot on ordinary Settings load", () => {
    const source = readFileSync("apps/ssi-portal/src/app/settings-page.component.ts", "utf8");
    expect(source).not.toContain("currentSnapshot");
  });
  beforeEach(() => {
    reloadError = false;
    runtimeError = false;
    emitted.length = 0;
    jest.clearAllMocks();
  });

  it("loads server-authoritative runtime settings", async () => {
    const { SettingsPageComponent } = await import("./settings-page.component");
    const component = new SettingsPageComponent();
    component.ngOnInit();
    await Promise.resolve();
    expect(component.runtime()).toEqual(runtime);
  });

  it("loads OAS-governed Index-only inquiry and resyncs without edit actions", async () => {
    const { SettingsPageComponent } = await import("./settings-page.component");
    const component = new SettingsPageComponent();
    await component.loadCurrencyInquiry();
    expect(component.currencyColumns()).toEqual([{ path: "currency", label: "Currency" }]);
    expect(component.currencyRows()).toHaveLength(1);
    component.runtime.set(runtime);
    await component.resyncCurrencies();
    expect(service.resyncResolutionCurrencies).toHaveBeenCalled();
    expect(service.resolutionCurrencies).toHaveBeenCalledTimes(2);
    const source = readFileSync("apps/ssi-portal/src/app/settings-page.component.ts", "utf8");
    expect(source).toContain("<ssi-governance-index-table");
    expect(source).toContain("[interactiveRows]=\"false\"");
    expect(source).toContain('appearance="maintenance"');
    expect(source).toContain('recordLabel="records"');
  });

  it("loads currency inquiry only when its Settings tab is selected", async () => {
    const { SettingsPageComponent } = await import("./settings-page.component");
    const component = new SettingsPageComponent();
    component.ngOnInit();
    await Promise.resolve();
    expect(component.settingsTab()).toBe("reload");
    expect(service.resolutionCurrencies).not.toHaveBeenCalled();
    component.selectSettingsTab("currency");
    await Promise.resolve();
    await Promise.resolve();
    expect(service.resolutionCurrencies).toHaveBeenCalledTimes(1);
    component.selectSettingsTab("reload");
    component.selectSettingsTab("currency");
    expect(service.resolutionCurrencies).toHaveBeenCalledTimes(1);
  });

  it("uses server environment title, sort and page size, with DB-backed search", async () => {
    const { SettingsPageComponent } = await import("./settings-page.component");
    const component = new SettingsPageComponent();
    component.runtime.set({ ...runtime, resolutionCurrencyInquiry: {
      title: "Business Currency Coverage", sortBy: "currency", sortDirection: "desc", pageSize: 15,
    } });
    component.currencySortBy.set("currency");
    component.currencySortDirection.set("desc");
    component.currencySearchInput.set("usd");
    component.submitCurrencySearch();
    await Promise.resolve();
    await Promise.resolve();
    expect(component.currencyConfig().title).toBe("Business Currency Coverage");
    expect(service.resolutionCurrencies).toHaveBeenCalledWith(1, 15, "usd", "currency", "desc");
  });

  it("opens and closes confirmation without retaining the password", async () => {
    const { SettingsPageComponent } = await import("./settings-page.component");
    const component = new SettingsPageComponent();
    component.ngOnInit();
    await Promise.resolve();
    component.openConfirmation();
    expect(component.confirmationOpen()).toBe(true);
    component.password.set("entered");
    component.closeConfirmation();
    expect(component.confirmationOpen()).toBe(false);
    expect(component.password()).toBe("");
  });

  it("reloads data, emits the result, clears the password, and reports counts", async () => {
    const { SettingsPageComponent } = await import("./settings-page.component");
    const component = new SettingsPageComponent();
    await Promise.resolve();
    component.password.set("entered");
    await component.reload();
    expect(component.result()?.code).toBe("DEMO_DATA_RELOADED");
    expect(component.password()).toBe("");
    expect(component.busy()).toBe(false);
    expect(component.successAlert(component.result()!).message).toContain(
      "201",
    );
    expect(emitted).toHaveLength(1);
  });

  it("presents wrong-password failure without changing runtime capability", async () => {
    reloadError = true;
    const { SettingsPageComponent } = await import("./settings-page.component");
    const component = new SettingsPageComponent();
    await Promise.resolve();
    component.password.set("wrong");
    await component.reload();
    expect(component.error()).toMatchObject({
      title: "控制密碼不正確",
      code: "INVALID_DEMO_CONTROL_PASSWORD",
    });
    expect(component.password()).toBe("");
  });

  it("fails closed when server-authoritative runtime settings are unavailable", async () => {
    runtimeError = true;
    const { SettingsPageComponent } = await import("./settings-page.component");
    const component = new SettingsPageComponent();
    await component.loadRuntime();
    expect(component.runtime()).toBeNull();
    expect(component.error()).toEqual({
      severity: "error",
      title: "無法讀取 Settings",
      message: "Runtime settings service 暫時無法使用。",
      impact: "資料重載保持鎖定。",
      code: "RUNTIME_SETTINGS_UNAVAILABLE",
    });
  });

  it("formats runtime and snapshot identifiers for operator display", async () => {
    const { SettingsPageComponent } = await import("./settings-page.component");
    const component = new SettingsPageComponent();
    expect(component.compactIdentifier(undefined)).toBe("Unavailable");
    expect(component.compactIdentifier("SHORT-ID")).toBe("SHORT-ID");
    expect(component.compactIdentifier("A".repeat(64))).toBe(
      `${"A".repeat(12)}…${"A".repeat(6)}`,
    );
    expect(component.displayRuntimeEnvironment(runtime)).toBe("DEVELOPMENT");
    expect(
      component.displayRuntimeEnvironment({
        ...runtime,
        developmentEnabled: false,
        runtimeEnvironment: "uat",
      }),
    ).toBe("UAT");
  });

  it("keeps unavailable or busy reload controls inert", async () => {
    const { SettingsPageComponent } = await import("./settings-page.component");
    const component = new SettingsPageComponent();
    component.runtime.set({ ...runtime, reloadAvailable: false });
    component.openConfirmation();
    expect(component.confirmationOpen()).toBe(false);

    component.confirmationOpen.set(true);
    component.password.set("entered");
    component.busy.set(true);
    component.closeConfirmation();
    await component.reload();
    expect(component.confirmationOpen()).toBe(true);
    expect(component.password()).toBe("entered");
    expect(service.reloadDevelopmentData).not.toHaveBeenCalled();
  });
});
