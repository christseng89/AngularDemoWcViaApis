import { RuntimeSettingsController } from "./runtime-settings.controller";
import type { DevelopmentDataReloadService } from "./development-data-reload.service";

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
    reload: jest.fn((password: string) => ({ code: "DEMO_DATA_RELOADED", password })),
  } as unknown as DevelopmentDataReloadService;
  const controller = new RuntimeSettingsController(reloadService);

  beforeEach(() => jest.clearAllMocks());

  it("returns runtime capability and current snapshot without secrets", () => {
    expect(controller.runtime()).toMatchObject({ ...status, resolutionCurrencyInquiry: {
      title: "Inquire Business Currency Index", sortBy: "businessDomain", sortDirection: "asc", pageSize: 10,
    } });
  });

  it("passes only a string password to the reload service", () => {
    expect(controller.reload({ password: "entered" })).toEqual({
      code: "DEMO_DATA_RELOADED",
      password: "entered",
    });
    controller.reload({ password: 123 });
    expect(reloadService.reload).toHaveBeenLastCalledWith("");
  });

  it("exposes paged currency inquiry and development-only manual Resync", () => {
    const currencies = {
      inquiry: jest.fn(() => ({ items: [], page: 1, pageSize: 25, totalItems: 0 })),
      resync: jest.fn(() => ({ discovered: 10, inserted: 0, unchanged: 10, activated: 0, inactivated: 0 })),
    };
    const subject = new RuntimeSettingsController(reloadService, currencies as never);
    expect(subject.resolutionCurrencyInquiry({ page: "1", pageSize: "25" }))
      .toMatchObject({ totalItems: 0 });
    expect(currencies.inquiry).toHaveBeenCalledWith({ page: 1, pageSize: 25, sortBy: "businessDomain", sortDirection: "asc" });
    expect(subject.resyncResolutionCurrencies()).toMatchObject({ inserted: 0, unchanged: 10 });
    expect(currencies.resync).toHaveBeenCalledTimes(1);
    jest.spyOn(reloadService, "status").mockReturnValueOnce({ ...status, developmentEnabled: false });
    expect(() => subject.resyncResolutionCurrencies()).toThrow();
    expect(currencies.resync).toHaveBeenCalledTimes(1);
  });

  it("invalidates cached page definitions only after successful Reload", () => {
    const currencies = { onReloadCommitted: jest.fn() };
    const subject = new RuntimeSettingsController(reloadService, currencies as never);
    subject.reload({ password: "entered" });
    expect(currencies.onReloadCommitted).toHaveBeenCalledTimes(1);
    jest.spyOn(reloadService, "reload").mockImplementationOnce(() => { throw new Error("failed"); });
    expect(() => subject.reload({ password: "entered" })).toThrow("failed");
    expect(currencies.onReloadCommitted).toHaveBeenCalledTimes(1);
  });
});
