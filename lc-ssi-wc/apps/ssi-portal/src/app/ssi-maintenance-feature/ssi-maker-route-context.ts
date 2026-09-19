import { InjectionToken } from "@angular/core";
import type { SsiMakerFacade } from "./ssi-maker.facade";

/** Temporary narrow handoff while the Maker WIP guard is owned by the shell. */
export interface SsiMakerRouteContext {
  readonly maker: SsiMakerFacade;
  load(): Promise<void>;
  save(): Promise<void>;
  close(): Promise<void>;
}

export const SSI_MAKER_ROUTE_CONTEXT = new InjectionToken<SsiMakerRouteContext>(
  "SSI_MAKER_ROUTE_CONTEXT",
);
