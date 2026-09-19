import { inject, InjectionToken } from "@angular/core";
import { Router, type CanActivateFn } from "@angular/router";

export interface AppRouteGuardHost {
  canDeactivate(): Promise<boolean>;
  hasActiveMakerRevision(): boolean;
  onLateMakerWipRelease?(navigationId: number): void;
}

/** The root component is not routed, so target-route guards use this bridge. */
export class AppRouteGuardBridge {
  private host: AppRouteGuardHost | null = null;
  private firstActivationAvailable = true;
  private readonly releasedMakerWip = new Set<number>();
  private readonly deniedNavigations = new Set<number>();
  private readonly pendingNavigations = new Set<number>();
  private readonly terminatedWhilePending = new Set<number>();

  constructor(private readonly navigationId: () => number | null) {}

  register(host: AppRouteGuardHost): void {
    this.host = host;
  }

  unregister(host: AppRouteGuardHost): void {
    if (this.host === host) this.host = null;
  }

  async canActivate(): Promise<boolean> {
    const id = this.navigationId();
    const host = this.host;
    const initialActivation = this.firstActivationAvailable;
    this.firstActivationAvailable = false;
    if (!host) {
      if (!initialActivation) this.recordDenial(id);
      return initialActivation;
    }
    if (id !== null) this.pendingNavigations.add(id);
    try {
      const hadMakerWip = host.hasActiveMakerRevision();
      const allowed = await host.canDeactivate();
      if (!allowed) this.recordDenial(id);
      if (allowed && hadMakerWip && !host.hasActiveMakerRevision()) {
        if (id !== null) {
          this.releasedMakerWip.add(id);
          if (this.terminatedWhilePending.has(id))
            host.onLateMakerWipRelease?.(id);
        }
      }
      return allowed;
    } catch {
      this.recordDenial(id);
      return false;
    } finally {
      if (id !== null) {
        this.pendingNavigations.delete(id);
        this.terminatedWhilePending.delete(id);
      }
    }
  }

  markNavigationTerminated(id: number): void {
    if (this.pendingNavigations.has(id)) this.terminatedWhilePending.add(id);
  }

  isGuardPending(id: number): boolean {
    return this.pendingNavigations.has(id);
  }

  consumeReleasedMakerWip(navigationId: number): boolean {
    const released = this.releasedMakerWip.has(navigationId);
    this.releasedMakerWip.delete(navigationId);
    return released;
  }

  consumeDenied(navigationId: number): boolean {
    const denied = this.deniedNavigations.has(navigationId);
    this.deniedNavigations.delete(navigationId);
    return denied;
  }

  private recordDenial(id: number | null): void {
    if (id !== null && !this.terminatedWhilePending.has(id))
      this.deniedNavigations.add(id);
  }
}

export const APP_ROUTE_GUARD_BRIDGE = new InjectionToken<AppRouteGuardBridge>(
  "AppRouteGuardBridge",
  {
    providedIn: "root",
    factory: () => {
      const router = inject(Router);
      return new AppRouteGuardBridge(
        () => router.currentNavigation()?.id ?? null,
      );
    },
  },
);

export const appRouteCanActivate: CanActivateFn = () =>
  inject(APP_ROUTE_GUARD_BRIDGE).canActivate();
