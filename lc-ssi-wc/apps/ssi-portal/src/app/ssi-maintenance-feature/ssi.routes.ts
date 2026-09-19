import { inject } from "@angular/core";
import type { Routes } from "@angular/router";
import { appRouteCanActivate } from "../app-route-guard";
import { ReferenceLookupApiService } from "../reference-lookup-api.service";
import { SsiMaintenanceApiService } from "../ssi-maintenance-api.service";
import { SsiMaintenanceShellBridge } from "../ssi-maintenance-shell-port";
import { SsiResolutionReadStore } from "../ssi-resolution-read-port";
import { SsiMaintenanceSession } from "./ssi-maintenance-session";
import { SSI_MAKER_ROUTE_CONTEXT } from "./ssi-maker-route-context";

export const SSI_MAINTENANCE_ROUTES: Routes = [
  {
    path: "",
    providers: [
      SsiMaintenanceApiService,
      {
        provide: SsiMaintenanceSession,
        useFactory: () => {
          const shell = inject(SsiMaintenanceShellBridge);
          return new SsiMaintenanceSession(
            inject(SsiMaintenanceApiService),
            (notice) => shell?.notify(notice),
            shell,
            inject(ReferenceLookupApiService),
            inject(SsiResolutionReadStore),
          );
        },
      },
      {
        provide: SSI_MAKER_ROUTE_CONTEXT,
        useFactory: () => {
          const session = inject(SsiMaintenanceSession);
          return {
            maker: session.maker,
            load: () => session.load("maker"),
            save: () => session.save(),
            close: () => session.closeMaker(),
          };
        },
      },
    ],
    children: [
      {
        path: "dashboard",
        canActivate: [appRouteCanActivate],
        loadComponent: () =>
          import("./dashboard-route.component").then(
            (module) => module.DashboardRouteComponent,
          ),
      },
      {
        path: "maker",
        canActivate: [appRouteCanActivate],
        loadComponent: () =>
          import("./maker-route.component").then(
            (module) => module.MakerRouteComponent,
          ),
      },
    ],
  },
];
