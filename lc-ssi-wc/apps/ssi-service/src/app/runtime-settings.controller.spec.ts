import { RuntimeSettingsController } from "./runtime-settings.controller";
import type { DatabaseSnapshotIdentityService } from "./database-snapshot-identity.service";
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
  const snapshot = {
    current: jest.fn(() => ({ sha256: "b".repeat(64), method: "LOGICAL" })),
  } as unknown as DatabaseSnapshotIdentityService;
  const controller = new RuntimeSettingsController(reloadService, snapshot);

  beforeEach(() => jest.clearAllMocks());

  it("returns runtime capability and current snapshot without secrets", () => {
    expect(controller.runtime()).toEqual({
      ...status,
      currentSnapshot: { sha256: "b".repeat(64), method: "LOGICAL" },
    });
  });

  it("passes only a string password to the reload service", () => {
    expect(controller.reload({ password: "entered" })).toEqual({
      code: "DEMO_DATA_RELOADED",
      password: "entered",
    });
    controller.reload({ password: 123 });
    expect(reloadService.reload).toHaveBeenLastCalledWith("");
  });
});
