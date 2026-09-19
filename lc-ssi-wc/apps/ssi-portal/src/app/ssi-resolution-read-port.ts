import { inject, Injectable, InjectionToken, signal } from "@angular/core";
import type {
  ResolutionCounterpartyProjection,
  SettlementSsiProjection,
} from "./ssi-maintenance-feature/ssi-resolution-read-projection";

/** Inert, read-only query boundary for non-Maintenance consumers. */
export interface SsiResolutionReadPort {
  readonly settlementSsis: () => readonly SettlementSsiProjection[];
  readonly counterparties: () => readonly ResolutionCounterpartyProjection[];
}

/** Consumers receive no publishing surface; only SSI Maintenance owns writes. */
export const SSI_RESOLUTION_READ_PORT = new InjectionToken<SsiResolutionReadPort>(
  "SSI_RESOLUTION_READ_PORT",
  { providedIn: "root", factory: () => inject(SsiResolutionReadStore) },
);

/** Only the active SSI feature publishes snapshots; this store makes no requests. */
@Injectable({ providedIn: "root" })
export class SsiResolutionReadStore implements SsiResolutionReadPort {
  private readonly settlementSsisState = signal<readonly SettlementSsiProjection[]>([]);
  private readonly counterpartiesState = signal<readonly ResolutionCounterpartyProjection[]>([]);
  readonly settlementSsis = this.settlementSsisState.asReadonly();
  readonly counterparties = this.counterpartiesState.asReadonly();

  publishSettlementSsis(rows: readonly SettlementSsiProjection[]): void {
    this.settlementSsisState.set(rows);
  }

  publishCounterparties(parties: readonly ResolutionCounterpartyProjection[]): void {
    this.counterpartiesState.set(parties);
  }
}
