import { Component } from "@angular/core";
import type { Routes } from "@angular/router";
import { appRouteCanActivate } from "./app-route-guard";

@Component({
  selector: "ssi-legacy-route-anchor",
  standalone: true,
  template: "",
})
export class LegacyRouteAnchorComponent {}

export const APP_ROUTES: Routes = [
  {
    path: "audit",
    canActivate: [appRouteCanActivate],
    loadComponent: () =>
      import("./audit-feature/audit-route.component").then(
        (module) => module.AuditRouteComponent,
      ),
  },
  {
    path: "resolution/payment",
    canActivate: [appRouteCanActivate],
    data: { businessDomain: "PAYMENT" },
    loadComponent: () =>
      import("./resolution-route.component").then(
        (module) => module.ResolutionRouteComponent,
      ),
  },
  {
    path: "resolution/treasury",
    canActivate: [appRouteCanActivate],
    data: { businessDomain: "TREASURY" },
    loadComponent: () =>
      import("./resolution-route.component").then(
        (module) => module.ResolutionRouteComponent,
      ),
  },
  {
    path: "resolution/trade-finance",
    canActivate: [appRouteCanActivate],
    data: { businessDomain: "TRADE_FINANCE" },
    loadComponent: () =>
      import("./resolution-route.component").then(
        (module) => module.ResolutionRouteComponent,
      ),
  },
  {
    path: "settings",
    canActivate: [appRouteCanActivate],
    loadComponent: () =>
      import("./settings-route.component").then(
        (module) => module.SettingsRouteComponent,
      ),
  },
  {
    path: "",
    pathMatch: "full",
    canActivate: [appRouteCanActivate],
    component: LegacyRouteAnchorComponent,
  },
  { path: "**", redirectTo: "" },
];
