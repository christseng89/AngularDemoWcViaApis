jest.mock("@angular/router", () => ({ Router: class {} }));

import { APP_ROUTES } from "./app.routes";

describe("portal routes", () => {
  it("guards the lazy Settings route and legacy root, and redirects unknown paths to root", () => {
    const settings = APP_ROUTES.find((route) => route.path === "settings");
    const root = APP_ROUTES.find((route) => route.path === "");
    const unknown = APP_ROUTES.find((route) => route.path === "**");
    expect(settings?.loadComponent).toEqual(expect.any(Function));
    expect(settings?.canActivate).toHaveLength(1);
    expect(root?.canActivate).toHaveLength(1);
    expect(unknown?.redirectTo).toBe("");
  });

  it.each([
    ["resolution/payment", "PAYMENT"],
    ["resolution/treasury", "TREASURY"],
    ["resolution/trade-finance", "TRADE_FINANCE"],
  ])(
    "guards and lazy-loads the %s ResolutionPageDefinition feature",
    (path, domain) => {
      const route = APP_ROUTES.find((item) => item.path === path);
      expect(route?.loadComponent).toEqual(expect.any(Function));
      expect(route?.component).toBeUndefined();
      expect(route?.canActivate).toHaveLength(1);
      expect(route?.data?.["businessDomain"]).toBe(domain);
    },
  );
});
