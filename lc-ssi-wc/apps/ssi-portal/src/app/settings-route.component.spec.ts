jest.mock("@angular/core", () => ({
  Component: () => (target: unknown) => target,
  inject: () => ({ theme: () => "dark", setTheme: jest.fn() }),
  output: () => ({ emit: jest.fn() }),
  ChangeDetectionStrategy: { OnPush: "OnPush" },
}));
jest.mock("./settings-page.component", () => ({
  SettingsPageComponent: class {},
}));
jest.mock("./theme.service", () => ({ ThemeService: class {} }));

import { SettingsRouteComponent } from "./settings-route.component";

describe("SettingsRouteComponent", () => {
  it("binds the shared theme service and relays reload without owning API state", () => {
    const route = new SettingsRouteComponent();
    expect(route.themeService.theme()).toBe("dark");
    route.dataReloaded.emit();
    expect(route.dataReloaded.emit).toHaveBeenCalledTimes(1);
    expect("http" in route).toBe(false);
  });
});
