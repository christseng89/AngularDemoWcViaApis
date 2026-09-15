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
    const { RuntimeSettingsService } = await import("./runtime-settings.service");
    const service = new RuntimeSettingsService();
    await expect(firstValueFrom(service.runtime())).resolves.toEqual({ runtimeEnvironment: "demo" });
    expect(http.get).toHaveBeenCalledWith("http://localhost:3100/api/settings/runtime");
  });

  it("posts only the entered control password to reload development data", async () => {
    const { RuntimeSettingsService } = await import("./runtime-settings.service");
    const service = new RuntimeSettingsService();
    await expect(firstValueFrom(service.reloadDevelopmentData("entered"))).resolves.toEqual({ code: "DEMO_DATA_RELOADED" });
    expect(http.post).toHaveBeenCalledWith(
      "http://localhost:3100/api/settings/development-data/reload",
      { password: "entered" },
    );
  });
});
