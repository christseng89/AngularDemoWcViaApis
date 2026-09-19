jest.mock("@angular/router", () => ({ Router: class {} }));
jest.mock("./ssi-maintenance-api.service", () => ({
  SsiMaintenanceApiService: class {},
}));
jest.mock("./reference-lookup-api.service", () => ({
  ReferenceLookupApiService: class {},
}));
jest.mock("./ssi-maintenance-feature/ssi-maintenance-session", () => ({
  SsiMaintenanceSession: class {},
}));

import { APP_ROUTES } from "./app.routes";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("portal routes", () => {
  it("guards and lazy-loads SSI Maintenance Dashboard and Maker without eager feature components", () => {
    const feature = APP_ROUTES.find((route) => route.path === "" && route.loadChildren);
    expect(feature?.loadChildren).toEqual(expect.any(Function));
    expect(feature?.component).toBeUndefined();
  });

  it("keeps both SSI URLs and guarded loadComponent children in one lazy route scope", async () => {
    const feature = APP_ROUTES.find((route) => route.path === "" && route.loadChildren);
    const scopedRoutes = await Promise.resolve(feature?.loadChildren?.());
    const sharedScope = scopedRoutes?.[0];
    const { SsiMaintenanceSession } = await import("./ssi-maintenance-feature/ssi-maintenance-session");
    const { SSI_MAKER_ROUTE_CONTEXT } = await import("./ssi-maintenance-feature/ssi-maker-route-context");
    expect(sharedScope?.path).toBe("");
    expect(sharedScope?.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provide: SsiMaintenanceSession }),
        expect.objectContaining({ provide: SSI_MAKER_ROUTE_CONTEXT }),
      ]),
    );
    for (const path of ["dashboard", "maker"]) {
      const route = sharedScope?.children?.find((item) => item.path === path);
      expect(route?.loadComponent).toEqual(expect.any(Function));
      expect(route?.component).toBeUndefined();
      expect(route?.canActivate).toHaveLength(1);
      expect(route?.providers).toBeUndefined();
    }
  });

  it("loads one shared SSI route scope for Dashboard and Maker", async () => {
    const feature = APP_ROUTES.find((route) => route.path === "" && route.loadChildren);
    expect(feature?.loadChildren).toEqual(expect.any(Function));
    const scopedRoutes = await Promise.resolve(feature?.loadChildren?.());
    const children = scopedRoutes?.[0]?.children;
    expect(children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "dashboard", loadComponent: expect.any(Function) }),
        expect.objectContaining({ path: "maker", loadComponent: expect.any(Function) }),
      ]),
    );
    expect(scopedRoutes?.[0]?.providers).toEqual(expect.arrayContaining([expect.anything()]));
  });

  it("does not load SSI feature routes when matching Settings", () => {
    const feature = APP_ROUTES.find((route) => route.path === "" && route.loadChildren);
    const canMatch = feature?.canMatch?.[0];
    expect(canMatch).toEqual(expect.any(Function));
    if (typeof canMatch !== "function") return;
    expect(canMatch(feature!, [{ path: "settings" }] as never)).toBe(false);
    expect(canMatch(feature!, [{ path: "dashboard" }] as never)).toBe(true);
    expect(canMatch(feature!, [{ path: "maker" }] as never)).toBe(true);
  });

  it("does not construct or provide SSI Maintenance from AppComponent", () => {
    const root = readFileSync(join(__dirname, "app.component.ts"), "utf8");
    const ownershipPatterns = [
      /inject\(SsiMaintenanceApiService\)/,
      /new SsiIndexFacade\(/,
      /new SsiMakerFacade\(/,
      /provide:\s*SSI_MAKER_ROUTE_CONTEXT/,
    ];
    expect(
      root.split(/\r?\n/).filter((line) =>
        ownershipPatterns.some((pattern) => pattern.test(line)),
      ),
    ).toEqual([]);
  });

  it("guards the lazy Settings route and legacy root, and redirects unknown paths to root", () => {
    const settings = APP_ROUTES.find((route) => route.path === "settings");
    const root = APP_ROUTES.find((route) => route.path === "" && route.component);
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

  it("guards and lazy-loads the Audit feature", () => {
    const route = APP_ROUTES.find((item) => item.path === "audit");
    expect(route?.loadComponent).toEqual(expect.any(Function));
    expect(route?.component).toBeUndefined();
    expect(route?.canActivate).toHaveLength(1);
  });

  it("guards and lazy-loads the Checker feature", () => {
    const route = APP_ROUTES.find((item) => item.path === "checker");
    expect(route?.loadComponent).toEqual(expect.any(Function));
    expect(route?.component).toBeUndefined();
    expect(route?.canActivate).toHaveLength(1);
  });

  it("guards and lazy-loads SWIFT Data without eagerly importing it from Root", () => {
    const route = APP_ROUTES.find((item) => item.path === "swiftdata");
    expect(route?.loadComponent).toEqual(expect.any(Function));
    expect(route?.component).toBeUndefined();
    expect(route?.canActivate).toHaveLength(1);
    const root = readFileSync(join(__dirname, "app.component.ts"), "utf8");
    const template = readFileSync(join(__dirname, "app.component.html"), "utf8");
    expect(root).not.toContain('from "./swift-data-crud.component"');
    expect(template).not.toContain("<ssi-swift-data-crud");
  });
});
