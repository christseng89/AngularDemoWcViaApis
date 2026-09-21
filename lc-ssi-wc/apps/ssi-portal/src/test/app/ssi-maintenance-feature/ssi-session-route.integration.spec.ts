/** @jest-environment jsdom */

import { Component, inject } from "@angular/core";
import { getTestBed, TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import { Router, RouterOutlet, provideRouter, type Route, type Routes } from "@angular/router";
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from "@angular/platform-browser-dynamic/testing";
import { SSI_MAINTENANCE_ROUTES } from "../../../app/ssi-maintenance-feature/ssi.routes";
import { SSI_MAKER_ROUTE_CONTEXT } from "../../../app/ssi-maintenance-feature/ssi-maker-route-context";
import { SsiMaintenanceSession } from "../../../app/ssi-maintenance-feature/ssi-maintenance-session";

const seen: SsiMaintenanceSession[] = [];

@Component({ selector: "ssi-settings-probe", standalone: true, template: "" })
class SettingsProbeComponent {}

@Component({ selector: "ssi-dashboard-probe", standalone: true, template: "" })
class DashboardProbeComponent {
  readonly session = inject(SsiMaintenanceSession);
  constructor() { seen.push(this.session); }
}

@Component({ selector: "ssi-maker-probe", standalone: true, template: "" })
class MakerProbeComponent {
  readonly session = inject(SsiMaintenanceSession);
  readonly actions = inject(SSI_MAKER_ROUTE_CONTEXT);
  constructor() { seen.push(this.session); }
}

@Component({ selector: "ssi-route-host-probe", standalone: true, imports: [RouterOutlet], template: "<router-outlet />" })
class RouteHostComponent {}

describe("SSI shared route injector", () => {
  beforeAll(() => {
    getTestBed().initTestEnvironment(
      BrowserDynamicTestingModule,
      platformBrowserDynamicTesting(),
    );
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    seen.length = 0;
  });
  afterAll(() => getTestBed().resetTestEnvironment());

  it("creates no Session on Settings and retains the same instance across Dashboard and Maker", async () => {
    let sessionFactories = 0;
    const original = SSI_MAINTENANCE_ROUTES[0]!;
    const originalProvider = (original.providers as Array<{ provide?: unknown; useFactory?: () => unknown }>).find(
      (provider) => provider.provide === SsiMaintenanceSession,
    )!;
    const shared: Route = {
      ...original,
      providers: (original.providers as Array<unknown>).map((provider) =>
        provider === originalProvider
          ? {
              ...originalProvider,
              useFactory: () => {
                sessionFactories++;
                return originalProvider.useFactory!();
              },
            }
          : provider,
      ) as Route["providers"],
      children: [
        { path: "dashboard", component: DashboardProbeComponent },
        { path: "maker", component: MakerProbeComponent },
      ],
    };
    const routes: Routes = [
      { path: "", loadChildren: () => Promise.resolve([shared]) },
      { path: "settings", component: SettingsProbeComponent },
    ];
    await TestBed.configureTestingModule({
      imports: [RouteHostComponent],
      providers: [provideHttpClient(), provideRouter(routes)],
    }).compileComponents();
    const fixture = TestBed.createComponent(RouteHostComponent);
    const router = TestBed.inject(Router);
    await router.navigateByUrl("/settings");
    fixture.detectChanges();
    expect(sessionFactories).toBe(0);
    expect(seen).toHaveLength(0);

    await router.navigateByUrl("/dashboard");
    fixture.detectChanges();
    expect(sessionFactories).toBe(1);
    expect(seen).toHaveLength(1);

    await router.navigateByUrl("/maker");
    fixture.detectChanges();
    expect(sessionFactories).toBe(1);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
  });
});
