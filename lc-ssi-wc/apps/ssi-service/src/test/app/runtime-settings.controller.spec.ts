import { RuntimeSettingsController } from "../../app/runtime-settings.controller";
import type { DevelopmentDataReloadService } from "../../app/development-data-reload.service";

describe("RuntimeSettingsController", () => {
  const status = {
    runtimeEnvironment: "demo",
    developmentEnabled: true,
    reloadAvailable: true,
    fixtureId: "SSI-DEMO",
    seedSha256: "a".repeat(64),
    statusPolicyVersion: "SSI-CONFIG-HTTP-01" as const,
  };
  const reloadService = {
    status: jest.fn(() => status),
    authorize: jest.fn((password: string) => ({
      code: "DEMO_RELOAD_AUTHORIZED",
      authorizationToken: password,
    })),
    cancelAuthorization: jest.fn((authorizationToken: string) => ({
      code: "DEMO_RELOAD_AUTHORIZATION_CANCELLED",
      authorizationToken,
    })),
    reload: jest.fn(async (authorizationToken: string, datasetId?: string) => ({
      code: "DEMO_DATA_RELOADED",
      authorizationToken,
      datasetId,
    })),
    exportCurrentDatabase: jest.fn(() => ({ code: "DEMO_DATA_EXPORTED" })),
    uploadDataset: jest.fn((authorizationToken: string, file: unknown) => ({
      datasetId: "UPLOAD-1",
      authorizationToken,
      file,
    })),
    evidence: jest.fn((password: string) => ({
      passwordAccepted: password === "entered",
      currentSnapshot: { sha256: "b".repeat(64), method: "LOGICAL" },
    })),
  } as unknown as DevelopmentDataReloadService;
  const controller = new RuntimeSettingsController(reloadService);

  beforeEach(() => jest.clearAllMocks());

  it("returns runtime capability and current snapshot without secrets", () => {
    expect(controller.runtime()).toMatchObject({
      ...status,
      resolutionCurrencyInquiry: {
        title: "Inquire Business Currency Index",
        sortBy: "businessDomain",
        sortDirection: "asc",
        pageSize: 10,
      },
    });
  });

  it("authorizes with a password and reloads with only the one-time token", async () => {
    expect(controller.authorizeReload({ password: "entered" })).toEqual({
      code: "DEMO_RELOAD_AUTHORIZED",
      authorizationToken: "entered",
    });
    controller.authorizeReload({ password: 123 });
    expect(reloadService.authorize).toHaveBeenLastCalledWith("");
    expect(
      await controller.reload({
        authorizationToken: "token",
        datasetId: "EXPORT-1",
      }),
    ).toEqual({
      code: "DEMO_DATA_RELOADED",
      authorizationToken: "token",
      datasetId: "EXPORT-1",
    });
    await controller.reload({ authorizationToken: 123 });
    expect(reloadService.reload).toHaveBeenLastCalledWith("", undefined);
    expect(controller.exportCurrentDatabase()).toEqual({
      code: "DEMO_DATA_EXPORTED",
    });
    expect(
      controller.uploadReloadDataset(
        { authorizationToken: "token" },
        {
          originalname: "selected.seed.json",
          buffer: Buffer.from("{}"),
        },
      ),
    ).toMatchObject({ datasetId: "UPLOAD-1" });
    expect(reloadService.uploadDataset).toHaveBeenCalledWith("token", {
      originalName: "selected.seed.json",
      buffer: Buffer.from("{}"),
    });
  });

  it("returns password-protected QA evidence without adding it to ordinary Settings status", () => {
    expect(controller.runtime()).not.toHaveProperty("currentSnapshot");
    expect(controller.developmentDataEvidence({ password: "entered" })).toEqual(
      {
        passwordAccepted: true,
        currentSnapshot: { sha256: "b".repeat(64), method: "LOGICAL" },
      },
    );
    expect(reloadService.evidence).toHaveBeenCalledWith("entered");
  });

  it("cancels a pending one-time reload authorization", () => {
    expect(
      controller.cancelReloadAuthorization({ authorizationToken: "token" }),
    ).toMatchObject({ code: "DEMO_RELOAD_AUTHORIZATION_CANCELLED" });
    expect(reloadService.cancelAuthorization).toHaveBeenCalledWith("token");
    controller.cancelReloadAuthorization({ authorizationToken: 123 });
    expect(reloadService.cancelAuthorization).toHaveBeenLastCalledWith("");
  });

  it("exposes paged currency inquiry and development-only manual Resync", () => {
    const currencies = {
      inquiry: jest.fn(() => ({
        items: [],
        page: 1,
        pageSize: 25,
        totalItems: 0,
      })),
      resync: jest.fn(() => ({
        discovered: 10,
        inserted: 0,
        unchanged: 10,
        activated: 0,
        inactivated: 0,
      })),
    };
    const subject = new RuntimeSettingsController(
      reloadService,
      currencies as never,
    );
    expect(
      subject.resolutionCurrencyInquiry({ page: "1", pageSize: "25" }),
    ).toMatchObject({ totalItems: 0 });
    expect(currencies.inquiry).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      sortBy: "businessDomain",
      sortDirection: "asc",
    });
    subject.resolutionCurrencyInquiry({
      businessDomain: "PAYMENT",
      status: "ACTIVE",
      search: "USD",
      sortBy: "currency",
      sortDirection: "desc",
    });
    expect(currencies.inquiry).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 10,
      businessDomain: "PAYMENT",
      status: "ACTIVE",
      search: "USD",
      sortBy: "currency",
      sortDirection: "desc",
    });
    expect(() =>
      subject.resolutionCurrencyInquiry({ businessDomain: "INVALID" }),
    ).toThrow("RESOLUTION_CURRENCY_INVALID_INQUIRY");
    expect(() =>
      subject.resolutionCurrencyInquiry({ status: "INVALID" }),
    ).toThrow("RESOLUTION_CURRENCY_INVALID_INQUIRY");
    expect(subject.resyncResolutionCurrencies()).toMatchObject({
      inserted: 0,
      unchanged: 10,
    });
    expect(currencies.resync).toHaveBeenCalledTimes(1);
    jest
      .spyOn(reloadService, "status")
      .mockReturnValueOnce({ ...status, developmentEnabled: false });
    expect(() => subject.resyncResolutionCurrencies()).toThrow();
    expect(currencies.resync).toHaveBeenCalledTimes(1);
  });

  it("invalidates cached page definitions only after successful Reload", async () => {
    const currencies = { onReloadCommitted: jest.fn() };
    const subject = new RuntimeSettingsController(
      reloadService,
      currencies as never,
    );
    await subject.reload({ authorizationToken: "entered" });
    expect(currencies.onReloadCommitted).toHaveBeenCalledTimes(1);
    jest
      .spyOn(reloadService, "reload")
      .mockRejectedValueOnce(new Error("failed"));
    await expect(
      subject.reload({ authorizationToken: "entered" }),
    ).rejects.toThrow("failed");
    expect(currencies.onReloadCommitted).toHaveBeenCalledTimes(1);
  });
});
