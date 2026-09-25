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
let authorizationError = false;
let reloadErrorCode: string | null = null;
let cancelError = false;
let runtimeError = false;
const service = {
  currencyContract: jest.fn(() =>
    of({
      "x-ui-inquiries": [
        {
          id: "resolution-currency",
          endpoint: "settings/resolution-currencies",
          mode: "INDEX_ONLY",
          columns: [{ path: "currency", label: "Currency" }],
        },
      ],
    }),
  ),
  resolutionCurrencies: jest.fn(() =>
    of({
      items: [
        {
          businessDomain: "PAYMENT",
          currency: "USD",
          status: "ACTIVE",
          source: "SSI",
          lastResyncAt: null,
        },
      ],
      page: 1,
      pageSize: 25,
      totalItems: 1,
      totalPages: 1,
    }),
  ),
  resyncResolutionCurrencies: jest.fn(() =>
    of({
      discovered: 1,
      inserted: 0,
      unchanged: 1,
      activated: 0,
      inactivated: 0,
    }),
  ),
  runtime: jest.fn(() =>
    runtimeError
      ? throwError(() => new Error("runtime unavailable"))
      : of(runtime),
  ),
  authorizeDevelopmentDataReload: jest.fn(() =>
    authorizationError
      ? throwError(() => ({ error: { code: "INVALID_DEMO_CONTROL_PASSWORD" } }))
      : of({
          code: "DEMO_RELOAD_AUTHORIZED",
          authorizationToken: "one-time-token",
          expiresAt: "2026-09-25T01:05:00Z",
          dataset: {
            datasetId: "DEFAULT-COMPLIANT",
            displayName: "Default compliant development test data",
            version: "1.0",
            classification: "SYNTHETIC_DEMO_QA_UAT",
            estimatedRows: 201,
            source: "DEFAULT",
          },
          datasets: [
            {
              datasetId: "DEFAULT-COMPLIANT",
              displayName: "Default compliant development test data",
              version: "1.0",
              classification: "SYNTHETIC_DEMO_QA_UAT",
              estimatedRows: 201,
              source: "DEFAULT",
            },
          ],
          defaultDatasetId: "DEFAULT-COMPLIANT",
        }),
  ),
  cancelDevelopmentDataReload: jest.fn(() =>
    cancelError
      ? throwError(() => new Error("cancel unavailable"))
      : of({ code: "DEMO_RELOAD_AUTHORIZATION_CANCELLED" }),
  ),
  reloadDevelopmentData: jest.fn(() =>
    reloadErrorCode
      ? throwError(() => ({ error: { code: reloadErrorCode } }))
      : of({
          code: "DEMO_DATA_RELOADED",
          completedAt: "2026-09-12T00:00:00Z",
          snapshotHash: "c".repeat(64),
          snapshotIdentityMethod: "LOGICAL",
          importedRows: { ssi: 42, nostro: 159 },
        }),
  ),
  exportCurrentDatabase: jest.fn(() =>
    of({
      code: "DEMO_DATA_EXPORTED",
      completedAt: "2026-09-25T02:00:00Z",
      dataset: {
        datasetId: "EXPORT-1",
        displayName: "export-1.seed.json",
        version: "1.0",
        classification: "SYNTHETIC_DEMO_QA_UAT",
        estimatedRows: 201,
        source: "EXPORT",
      },
    }),
  ),
  uploadDevelopmentData: jest.fn(() =>
    of({
      datasetId: "UPLOAD-1",
      displayName: "selected.seed.json",
      version: "1.0",
      classification: "SYNTHETIC_DEMO_QA_UAT",
      estimatedRows: 201,
      source: "UPLOAD",
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
jest.mock("../../app/alert.component", () => ({ AlertComponent: class {} }));
jest.mock("../../app/governance-index-table.component", () => ({
  GovernanceIndexTableComponent: class {},
}));
jest.mock("../../app/runtime-settings.service", () => ({
  RuntimeSettingsService: class {},
}));

describe("SettingsPageComponent", () => {
  beforeEach(() => {
    authorizationError = false;
    reloadErrorCode = null;
    cancelError = false;
    runtimeError = false;
    emitted.length = 0;
    jest.clearAllMocks();
  });

  it("does not request or render a DB logical snapshot on ordinary Settings load", () => {
    const source = readFileSync(
      "apps/ssi-portal/src/app/settings-page.component.ts",
      "utf8",
    );
    expect(source).not.toContain("currentSnapshot");
  });

  it("does not inspect or display canonical seed metadata in Settings", () => {
    const source = readFileSync(
      "apps/ssi-portal/src/app/settings-page.component.ts",
      "utf8",
    );
    expect(source).not.toContain('class="seed-facts"');
    expect(source).not.toContain("current.fixtureId");
    expect(source).not.toContain("current.seedSha256");
    expect(source).not.toContain("canonical seed");
  });

  it("loads server-authoritative runtime settings", async () => {
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
    const component = new SettingsPageComponent();
    component.ngOnInit();
    await Promise.resolve();
    expect(component.runtime()).toEqual(runtime);
  });

  it("loads OAS-governed Index-only inquiry and resyncs without edit actions", async () => {
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
    const component = new SettingsPageComponent();
    await component.loadCurrencyInquiry();
    expect(component.currencyColumns()).toEqual([
      { path: "currency", label: "Currency" },
    ]);
    expect(component.currencyRows()).toHaveLength(1);
    component.runtime.set(runtime);
    await component.resyncCurrencies();
    expect(service.resyncResolutionCurrencies).toHaveBeenCalled();
    expect(service.resolutionCurrencies).toHaveBeenCalledTimes(2);
    const source = readFileSync(
      "apps/ssi-portal/src/app/settings-page.component.ts",
      "utf8",
    );
    expect(source).toContain("<ssi-governance-index-table");
    expect(source).toContain('[interactiveRows]="false"');
    expect(source).toContain('appearance="maintenance"');
    expect(source).toContain('recordLabel="records"');
  });

  it("loads currency inquiry only when its Settings tab is selected", async () => {
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
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
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
    const component = new SettingsPageComponent();
    component.runtime.set({
      ...runtime,
      resolutionCurrencyInquiry: {
        title: "Business Currency Coverage",
        sortBy: "currency",
        sortDirection: "desc",
        pageSize: 15,
      },
    });
    component.currencySortBy.set("currency");
    component.currencySortDirection.set("desc");
    component.currencySearchInput.set("usd");
    component.submitCurrencySearch();
    await Promise.resolve();
    await Promise.resolve();
    expect(component.currencyConfig().title).toBe("Business Currency Coverage");
    expect(service.resolutionCurrencies).toHaveBeenCalledWith(
      1,
      15,
      "usd",
      "currency",
      "desc",
    );
  });

  it("debounces search, toggles governed sort and bounds pagination", async () => {
    jest.useFakeTimers();
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
    const component = new SettingsPageComponent();
    component.currencyColumns.set([{ path: "currency", label: "Currency" }]);
    component.currencyTotalPages.set(2);
    component.onCurrencySearchInput(" usd ");
    jest.advanceTimersByTime(300);
    await Promise.resolve();
    expect(component.currencySearch()).toBe("usd");
    component.sortCurrencies("currency");
    expect(component.currencySortDirection()).toBe("asc");
    component.sortCurrencies("currency");
    expect(component.currencySortDirection()).toBe("desc");
    component.sortCurrencies("not-governed");
    component.changeCurrencyPage(1);
    component.changeCurrencyPage(5);
    expect(service.resolutionCurrencies).toHaveBeenCalled();
    component.ngOnDestroy();
    jest.useRealTimers();
  });

  it("rejects a missing governed inquiry contract", async () => {
    service.currencyContract.mockImplementationOnce(() =>
      of({ "x-ui-inquiries": [] }),
    );
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
    const component = new SettingsPageComponent();
    await component.loadCurrencyInquiry();
    expect(component.currencyError()).toMatchObject({
      code: "RESOLUTION_CURRENCY_INQUIRY_UNAVAILABLE",
    });
  });

  it("opens and closes confirmation without retaining the password", async () => {
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
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
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
    const component = new SettingsPageComponent();
    await Promise.resolve();
    component.password.set("entered");
    await component.authorizeReload();
    expect(component.datasetConfirmationOpen()).toBe(true);
    expect(component.authorization()?.dataset.estimatedRows).toBe(201);
    await component.reload();
    expect(component.result()?.code).toBe("DEMO_DATA_RELOADED");
    expect(component.password()).toBe("");
    expect(component.busy()).toBe(false);
    expect(service.reloadDevelopmentData).toHaveBeenCalledWith(
      "one-time-token",
      "DEFAULT-COMPLIANT",
    );
    expect(component.successAlert(component.result()!).message).toContain(
      "201",
    );
    expect(emitted).toHaveLength(1);
  });

  it("defaults Reload to the latest export while allowing an older export", async () => {
    service.authorizeDevelopmentDataReload.mockImplementationOnce(() =>
      of({
        code: "DEMO_RELOAD_AUTHORIZED",
        authorizationToken: "one-time-token",
        expiresAt: "2026-09-25T01:05:00Z",
        dataset: {
          datasetId: "EXPORT-2",
          displayName: "Second export",
          version: "1.0",
          classification: "SYNTHETIC_DEMO_QA_UAT",
          estimatedRows: 202,
          source: "EXPORT",
        },
        datasets: [
          {
            datasetId: "EXPORT-2",
            displayName: "Second export",
            version: "1.0",
            classification: "SYNTHETIC_DEMO_QA_UAT",
            estimatedRows: 202,
            source: "EXPORT",
          },
          {
            datasetId: "EXPORT-1",
            displayName: "First export",
            version: "1.0",
            classification: "SYNTHETIC_DEMO_QA_UAT",
            estimatedRows: 201,
            source: "EXPORT",
          },
        ],
        defaultDatasetId: "EXPORT-2",
      }),
    );
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
    const component = new SettingsPageComponent();
    component.password.set("entered");
    await component.authorizeReload();
    expect(component.selectedDataset()?.datasetId).toBe("EXPORT-2");
    component.selectedDatasetId.set("EXPORT-1");
    await component.reload();
    expect(service.reloadDevelopmentData).toHaveBeenCalledWith(
      "one-time-token",
      "EXPORT-1",
    );
  });

  it("opens the native file input path and selects an uploaded compliant seed", async () => {
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
    const component = new SettingsPageComponent();
    component.password.set("entered");
    await component.authorizeReload();
    const file = new File(["{}"], "selected.seed.json", {
      type: "application/json",
    });
    await component.uploadSelectedFile({
      target: { files: [file], value: "C:\\fakepath\\selected.seed.json" },
    } as unknown as Event);
    expect(service.uploadDevelopmentData).toHaveBeenCalledWith(
      "one-time-token",
      file,
    );
    expect(component.selectedDataset()).toMatchObject({
      datasetId: "UPLOAD-1",
      source: "UPLOAD",
    });
  });

  it("exports the current DB without changing it", async () => {
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
    const component = new SettingsPageComponent();
    component.ngOnInit();
    await Promise.resolve();
    await component.exportCurrentDatabase();
    expect(service.exportCurrentDatabase).toHaveBeenCalledTimes(1);
    expect(component.exportResult()).toMatchObject({
      code: "DEMO_DATA_EXPORTED",
      dataset: { datasetId: "EXPORT-1" },
    });
    expect(component.exportResult()).not.toHaveProperty("path");
  });

  it("presents wrong-password failure without changing runtime capability", async () => {
    authorizationError = true;
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
    const component = new SettingsPageComponent();
    await Promise.resolve();
    component.password.set("wrong");
    await component.authorizeReload();
    expect(component.error()).toMatchObject({
      title: "控制密碼不正確",
      code: "INVALID_DEMO_CONTROL_PASSWORD",
    });
    expect(component.password()).toBe("");
  });

  it("reports unavailable default test data after password verification", async () => {
    authorizationError = true;
    service.authorizeDevelopmentDataReload.mockImplementationOnce(() =>
      throwError(() => ({
        error: { code: "DEMO_RELOAD_DATASET_UNAVAILABLE" },
      })),
    );
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
    const component = new SettingsPageComponent();
    component.password.set("entered");
    await component.authorizeReload();
    expect(component.error()).toMatchObject({
      title: "無法準備測試資料",
      code: "DEMO_RELOAD_DATASET_UNAVAILABLE",
    });
  });

  it("cancels a pending authorization when the data confirmation is closed", async () => {
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
    const component = new SettingsPageComponent();
    component.password.set("entered");
    await component.authorizeReload();
    await component.cancelDatasetConfirmation();
    expect(service.cancelDevelopmentDataReload).toHaveBeenCalledWith(
      "one-time-token",
    );
    expect(component.authorization()).toBeNull();
    expect(component.datasetConfirmationOpen()).toBe(false);
    cancelError = true;
    component.authorization.set({
      code: "DEMO_RELOAD_AUTHORIZED",
      authorizationToken: "expired-token",
      expiresAt: "2026-09-25T01:05:00Z",
      dataset: {
        datasetId: "DEFAULT-COMPLIANT",
        displayName: "Default data",
        version: "1",
        classification: "SYNTHETIC",
        estimatedRows: 1,
        source: "DEFAULT",
      },
      datasets: [
        {
          datasetId: "DEFAULT-COMPLIANT",
          displayName: "Default data",
          version: "1",
          classification: "SYNTHETIC",
          estimatedRows: 1,
          source: "DEFAULT",
        },
      ],
      defaultDatasetId: "DEFAULT-COMPLIANT",
    });
    await expect(
      component.cancelDatasetConfirmation(),
    ).resolves.toBeUndefined();
  });

  it("keeps the old DB message visible when reload authorization expires", async () => {
    reloadErrorCode = "INVALID_DEMO_RELOAD_AUTHORIZATION";
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
    const component = new SettingsPageComponent();
    component.password.set("entered");
    await component.authorizeReload();
    await component.reload();
    expect(component.error()).toMatchObject({
      title: "Reload 授權已失效",
      code: "INVALID_DEMO_RELOAD_AUTHORIZATION",
    });
  });

  it("reports a generic reload failure without replacing the current DB", async () => {
    reloadErrorCode = "DEMO_DATA_RELOAD_FAILED";
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
    const component = new SettingsPageComponent();
    component.password.set("entered");
    await component.authorizeReload();
    await component.reload();
    expect(component.error()).toMatchObject({
      title: "Development data reload 失敗",
      impact: "舊 DB 已保留或恢復；修正問題後可重試。",
    });
  });

  it("does not reload without authorization or while another action is busy", async () => {
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
    const component = new SettingsPageComponent();
    await component.reload();
    await component.cancelDatasetConfirmation();
    component.busy.set(true);
    await component.cancelDatasetConfirmation();
    expect(service.reloadDevelopmentData).not.toHaveBeenCalled();
  });

  it("fails closed when server-authoritative runtime settings are unavailable", async () => {
    runtimeError = true;
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
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
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
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
    const { SettingsPageComponent } =
      await import("../../app/settings-page.component");
    const component = new SettingsPageComponent();
    component.runtime.set({ ...runtime, reloadAvailable: false });
    component.openConfirmation();
    expect(component.confirmationOpen()).toBe(false);

    component.confirmationOpen.set(true);
    component.password.set("entered");
    component.busy.set(true);
    component.closeConfirmation();
    await component.authorizeReload();
    expect(component.confirmationOpen()).toBe(true);
    expect(component.password()).toBe("entered");
    expect(service.authorizeDevelopmentDataReload).not.toHaveBeenCalled();
  });
});
