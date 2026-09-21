import { firstValueFrom, of } from "rxjs";

class HttpClientToken {}
const http = {
  get: jest.fn(() => of({ runtimeEnvironment: "demo" })),
  post: jest.fn(() => of({ code: "DEMO_DATA_RELOADED" })),
};

jest.mock("@angular/core", () => ({
  Injectable: () => <T>(target: T): T => target,
  inject: (token: unknown) => token === HttpClientToken ? http : undefined,
}));
jest.mock("@angular/common/http", () => ({ HttpClient: HttpClientToken }));

describe("RuntimeSettingsService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("loads server-derived runtime settings", async () => {
    const { RuntimeSettingsService } = await import("../../app/runtime-settings.service");
    const service = new RuntimeSettingsService();
    await expect(firstValueFrom(service.runtime())).resolves.toEqual({ runtimeEnvironment: "demo" });
    expect(http.get).toHaveBeenCalledWith("/api/settings/runtime");
  });

  it("posts only the entered control password to reload development data", async () => {
    const { RuntimeSettingsService } = await import("../../app/runtime-settings.service");
    const service = new RuntimeSettingsService();
    await expect(firstValueFrom(service.reloadDevelopmentData("entered"))).resolves.toEqual({ code: "DEMO_DATA_RELOADED" });
    expect(http.post).toHaveBeenCalledWith(
      "/api/settings/development-data/reload",
      { password: "entered" },
    );
  });

  it("keeps inquiry and resync on the current Portal origin", async () => {
    const { RuntimeSettingsService } = await import("../../app/runtime-settings.service");
    const service = new RuntimeSettingsService();
    await firstValueFrom(service.resolutionCurrencies(2, 10, "usd", "currency", "desc"));
    await firstValueFrom(service.resyncResolutionCurrencies());
    expect(http.get).toHaveBeenCalledWith("/api/settings/resolution-currencies", {
      params: { page: 2, pageSize: 10, search: "usd", sortBy: "currency", sortDirection: "desc" },
    });
    expect(http.post).toHaveBeenCalledWith("/api/settings/resolution-currencies/resync", {});
  });
});
