import { Injectable, signal } from "@angular/core";
import type { SsiRow } from "./ssi-maintenance.types";

export interface ReferenceCurrency {
  code: string;
  decimals: number;
  standard: string;
}

export interface ReferenceCountry {
  code: string;
  name: string;
  standard: string;
  status: string;
}

export interface ReferenceBookingBranch {
  branchCode: string;
  branchName: string;
  legalEntityCode: string;
  legalEntityName: string;
  countryCode: string;
  status: string;
  validFrom: string;
  validTo: string;
}

/** Shell presentation/navigation only; SSI business state stays in the lazy session. */
export interface SsiMaintenanceShellPort {
  checkerCount(): number;
  navigate(view: "dashboard" | "maker"): Promise<boolean>;
  notify(notice: { kind: "info" | "warning" | "error"; text: string } | null): void;
  openDetail(row: SsiRow): Promise<void>;
  closeDetail(): void;
  acceptCurrencies(items: readonly ReferenceCurrency[]): void;
  onIndexRefreshed(): void;
  acceptPendingApprovalCount(count: number): void;
  restoreDashboardAfterReleasedWip(notice: {
    kind: "error";
    text: string;
  }): void;
}

/** Root-inert bridge: only a live shell may bind presentation callbacks. */
@Injectable({ providedIn: "root" })
export class SsiMaintenanceShellBridge implements SsiMaintenanceShellPort {
  private delegate: SsiMaintenanceShellPort | null = null;
  private readonly pendingApprovalCountState = signal(0);
  readonly pendingApprovalCount = this.pendingApprovalCountState.asReadonly();

  attach(port: SsiMaintenanceShellPort): void {
    this.delegate = port;
  }

  detach(port: SsiMaintenanceShellPort): void {
    if (this.delegate === port) this.delegate = null;
  }

  checkerCount(): number { return this.delegate?.checkerCount() ?? 0; }
  navigate(view: "dashboard" | "maker"): Promise<boolean> {
    return this.delegate?.navigate(view) ?? Promise.resolve(false);
  }
  notify(notice: { kind: "info" | "warning" | "error"; text: string } | null): void {
    this.delegate?.notify(notice);
  }
  openDetail(row: SsiRow): Promise<void> {
    return this.delegate?.openDetail(row) ?? Promise.resolve();
  }
  closeDetail(): void { this.delegate?.closeDetail(); }
  acceptCurrencies(items: readonly ReferenceCurrency[]): void {
    this.delegate?.acceptCurrencies(items);
  }
  onIndexRefreshed(): void { this.delegate?.onIndexRefreshed(); }
  acceptPendingApprovalCount(count: number): void {
    this.pendingApprovalCountState.set(count);
  }
  restoreDashboardAfterReleasedWip(notice: { kind: "error"; text: string }): void {
    this.delegate?.restoreDashboardAfterReleasedWip(notice);
  }
}
