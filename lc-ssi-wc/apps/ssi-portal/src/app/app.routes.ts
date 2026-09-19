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
