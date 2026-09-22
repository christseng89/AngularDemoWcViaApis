import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  type OnDestroy,
  signal,
} from "@angular/core";
import { DOCUMENT } from "@angular/common";
import { ReactiveFormsModule } from "@angular/forms";
import { FormlyForm } from "@ngx-formly/core";
import type { Subscription } from "rxjs";
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
  RouterOutlet,
} from "@angular/router";
import type { SsiRow } from "./ssi-maintenance.types";
import { SsiSharedDetailPresenter } from "./ssi-shared-detail.presenter";
import {
  SsiMaintenanceShellBridge,
  type SsiMaintenanceShellPort,
} from "./ssi-maintenance-shell-port";
import { APP_ROUTE_GUARD_BRIDGE } from "./app-route-guard";
import { AlertComponent } from "./alert.component";
import { LoadingStateComponent } from "./loading-state.component";
import type { AppView as View, ThemeMode } from "./app-view.models";
import { ThemeService } from "./theme.service";
import { AppShellComponent } from "./app-shell.component";
import { dispatchRouterEvent } from "./app-router-event-dispatcher";

type WorkbenchView = "swiftdata" | "dashboard" | "maker";
type AppNotice = {
  kind: "info" | "warning" | "error";
  text: string;
};
type Subscribable<T> = {
  subscribe(callback: (value: T) => void): { unsubscribe(): void };
};
type MaintenanceWipPort = {
  canDeactivate(targetUrl?: string): Promise<boolean>;
  hasActiveMakerRevision(): boolean;
  onLateMakerWipRelease(): void;
  clearReleasedMakerForm(): void;
  closeOverlayOnEscape(): Promise<boolean>;
};
interface ActivatedRoutePort {
  dataReloaded?: Subscribable<void>;
  setCurrencyOptions?: (
    options: readonly { code: string; decimals: number }[],
  ) => void;
  detailOpenChange?: Subscribable<boolean>;
  ssiDetailRequested?: Subscribable<unknown>;
  tabChanged?: Subscribable<void>;
  canDeactivate?: () => Promise<boolean>;
  refresh?: () => Promise<void>;
  maintenanceWipPort?: MaintenanceWipPort;
  decide?: (
    row: SsiRow,
    decision: "approve" | "reject",
    reason: string,
  ) => Promise<boolean>;
  reviewRequested?: Subscribable<SsiRow>;
  countChanged?: Subscribable<number>;
  noticeRaised?: Subscribable<{ kind: "warning"; text: string }>;
}

const routePathForView = (view: View): string | null => {
  switch (view) {
    case "swiftdata":
      return "/swiftdata";
    case "dashboard":
      return "/dashboard";
    case "maker":
      return "/maker";
    case "settings":
      return "/settings";
    case "audit":
      return "/audit";
    case "checker":
      return "/checker";
    case "resolver":
      return "/resolution/payment";
    case "treasury":
      return "/resolution/treasury";
    case "tradefinance":
      return "/resolution/trade-finance";
    default:
      return null;
  }
};

const isWorkbenchView = (view: View): view is WorkbenchView =>
  view === "swiftdata" || view === "dashboard" || view === "maker";

const routeViewFromUrl = (url: string): View | null => {
  const path = url.split(/[?#]/, 1)[0];
  return (
    (
      [
        "swiftdata",
        "settings",
        "resolver",
        "treasury",
        "tradefinance",
        "audit",
        "checker",
        "dashboard",
        "maker",
      ] as const
    ).find((view) => routePathForView(view) === path) ?? null
  );
};

@Component({
  selector: "ssi-root",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormlyForm,
    RouterOutlet,
    AlertComponent,
    LoadingStateComponent,
    AppShellComponent,
  ],
  providers: [SsiSharedDetailPresenter],
  templateUrl: "./app.component.html",
  host: {
    "(document:keydown.escape)": "closeOverlayOnEscape()",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  readonly detail = inject(SsiSharedDetailPresenter);
  private readonly ssiShellBridge = inject(SsiMaintenanceShellBridge);
  private readonly shellPort = this.maintenanceShellPort();
  private readonly document = inject(DOCUMENT);

  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly routeGuardBridge = inject(APP_ROUTE_GUARD_BRIDGE);
  readonly routedAuditDetailOpen = signal(false);
  private auditRouteSubscriptions: Array<{ unsubscribe(): void }> = [];
  private activeCheckerRoute: {
    refresh(): Promise<void>;
    decide(
      row: SsiRow,
      decision: "approve" | "reject",
      reason: string,
    ): Promise<boolean>;
  } | null = null;
  private activeRoutedCanDeactivate: (() => Promise<boolean>) | null = null;
  private activeRoutedRefresh: (() => Promise<void>) | null = null;
  private activeMaintenanceWipPort: MaintenanceWipPort | null = null;
  readonly view = signal<View>(this.savedView());
  readonly routeLoading = signal(false);
  private lastWorkbenchView: WorkbenchView = this.savedWorkbenchView();
  private pendingRouteTarget: View | null = null;
  private loadingRouteView: View | null = null;
  private latestNavigationId = 0;
  private releasedMakerWipDuringNavigation = false;
  private readonly routerEventsSubscription: Subscription;
  private settingsReloadSubscription: { unsubscribe(): void } | null = null;
  readonly theme = this.themeService.theme;
  readonly notice = signal<AppNotice | null>(null);
  readonly noticeAlert = computed(() => {
    const notice = this.notice();
    return notice
      ? {
          severity: notice.kind,
          title: this.noticeTitle(notice.kind),
          message: notice.text,
        }
      : null;
  });

  private noticeTitle(kind: "info" | "warning" | "error"): string {
    if (kind === "error") return "操作未完成";
    if (kind === "warning") return "請注意";
    return "操作完成";
  }
  maintenanceShellPort(): SsiMaintenanceShellPort {
    return {
      checkerCount: () => this.checkerCount(),
      navigate: (view) => this.navigate(view),
      notify: (notice) => this.notice.set(notice),
      openDetail: (row) => this.detail.open(row),
      closeDetail: () => this.detail.close(),
      acceptCurrencies: (items) => this.detail.acceptCurrencies(items),
      acceptPendingApprovalCount: () => undefined,
      restoreDashboardAfterReleasedWip: (notice) => {
        this.lastWorkbenchView = "dashboard";
        this.document.defaultView?.localStorage.setItem(
          "ssi-last-workbench-view",
          "dashboard",
        );
        if (this.view() === "maker") this.commitRouteView("dashboard");
        this.restoreDashboardRouteAfterReleasedWip(notice);
      },
    };
  }
  private readonly routedCheckerCount = signal<number | null>(null);
  readonly checkerCount = computed(
    () =>
      this.routedCheckerCount() ?? this.ssiShellBridge.pendingApprovalCount(),
  );
  private readonly routeGuardHost = {
    canDeactivate: (targetUrl?: string) => this.canDeactivate(targetUrl),
    hasActiveMakerRevision: () =>
      this.activeMaintenanceWipPort?.hasActiveMakerRevision() ?? false,
    onLateMakerWipRelease: (navigationId: number) => {
      this.routeGuardBridge.consumeReleasedMakerWip(navigationId);
      this.activeMaintenanceWipPort?.onLateMakerWipRelease();
    },
  };

  constructor() {
    this.detail.setNoticeSink((notice) => this.notice.set(notice));
    this.ssiShellBridge.attach(this.shellPort);
    this.routeGuardBridge.register(this.routeGuardHost);
    this.routerEventsSubscription = this.router.events.subscribe((event) =>
      this.onRouterEvent(event),
    );
  }

  ngOnDestroy(): void {
    this.ssiShellBridge.detach(this.shellPort);
    this.settingsReloadSubscription?.unsubscribe();
    this.routerEventsSubscription.unsubscribe();
    this.routeGuardBridge.unregister(this.routeGuardHost);
  }

  ngOnInit(): void {
    // Canonicalize a persisted Maintenance view; routed features own loading.
    const savedRoute = routePathForView(this.view());
    if (this.document.defaultView?.location?.pathname === "/" && savedRoute) {
      this.pendingRouteTarget = this.view();
      void this.router.navigateByUrl(savedRoute).catch(() => undefined);
    }
  }

  async refreshAfterDevelopmentReload(): Promise<void> {
    this.notice.set({
      kind: "info",
      text: "Development Test Data 已重新載入；所有工作區資料已更新。",
    });
  }

  async refresh(): Promise<void> {
    if (this.view() === "checker") {
      await this.activeCheckerRoute?.refresh();
      return;
    }
    await this.activeRoutedRefresh?.();
  }

  navigate(view: View): Promise<boolean> {
    if (this.pendingRouteTarget !== null) return Promise.resolve(false);
    const targetPath = routePathForView(view);
    if (view === this.view()) return Promise.resolve(true);
    this.pendingRouteTarget = view;
    return this.router.navigateByUrl(targetPath ?? "/").catch(() => false);
  }

  private savedView(): View {
    const routed = routeViewFromUrl(
      this.document.defaultView?.location?.pathname ?? "/",
    );
    if (routed) return routed;
    return this.savedWorkbenchView();
  }

  private savedWorkbenchView(): WorkbenchView {
    const saved =
      this.document.defaultView?.localStorage.getItem("ssi-active-view");
    const previous = this.document.defaultView?.localStorage.getItem(
      "ssi-last-workbench-view",
    );
    const candidate = isWorkbenchView(saved as View) ? saved : previous;
    return ["swiftdata", "dashboard", "maker"].includes(candidate ?? "")
      ? (candidate as WorkbenchView)
      : "swiftdata";
  }

  private restoreDashboardRouteAfterReleasedWip(notice: {
    kind: "error";
    text: string;
  }): void {
    this.notice.set(notice);
    // The cancelled route still points at Maker while the editor is closed.
    // Replace it so the visible Dashboard and Angular outlet agree.
    void this.router
      .navigateByUrl("/dashboard", { replaceUrl: true })
      .then(() => this.notice.set(notice))
      .catch(() => this.notice.set(notice));
  }

  onSettingsActivated(component: unknown): void {
    this.resetActivatedRouteState();
    const route = component as ActivatedRoutePort;
    this.bindRouteCapabilities(route);
    this.bindCheckerRoute(route);
    this.bindDetailRoute(route);
    this.bindRouteEvents(route);
  }

  private resetActivatedRouteState(): void {
    this.settingsReloadSubscription?.unsubscribe();
    for (const subscription of this.auditRouteSubscriptions)
      subscription.unsubscribe();
    this.auditRouteSubscriptions = [];
    this.routedAuditDetailOpen.set(false);
  }

  private bindRouteCapabilities(route: ActivatedRoutePort): void {
    this.activeRoutedCanDeactivate = route.canDeactivate?.bind(route) ?? null;
    this.activeRoutedRefresh = route.refresh?.bind(route) ?? null;
    this.activeMaintenanceWipPort = route.maintenanceWipPort ?? null;
  }

  private bindCheckerRoute(route: ActivatedRoutePort): void {
    this.activeCheckerRoute =
      route.refresh && route.decide
        ? {
            refresh: route.refresh.bind(route),
            decide: route.decide.bind(route),
          }
        : null;
    this.detail.setDecisionPort(this.activeCheckerRoute?.decide ?? null);
    if (route.reviewRequested)
      this.auditRouteSubscriptions.push(
        route.reviewRequested.subscribe((row) => void this.detail.open(row)),
      );
    if (route.countChanged)
      this.auditRouteSubscriptions.push(
        route.countChanged.subscribe((count) =>
          this.routedCheckerCount.set(count),
        ),
      );
    if (route.noticeRaised)
      this.auditRouteSubscriptions.push(
        route.noticeRaised.subscribe((notice) => this.notice.set(notice)),
      );
  }

  private bindDetailRoute(route: ActivatedRoutePort): void {
    this.detail.setCurrencyConsumer(
      route.setCurrencyOptions?.bind(route) ?? null,
    );
    if (route.detailOpenChange)
      this.auditRouteSubscriptions.push(
        route.detailOpenChange.subscribe((open) =>
          this.routedAuditDetailOpen.set(open),
        ),
      );
    if (route.ssiDetailRequested)
      this.auditRouteSubscriptions.push(
        route.ssiDetailRequested.subscribe((snapshot) =>
          this.detail.showSnapshot(snapshot as SsiRow),
        ),
      );
    if (route.tabChanged)
      this.auditRouteSubscriptions.push(
        route.tabChanged.subscribe(() => this.detail.close()),
      );
  }

  private bindRouteEvents(route: ActivatedRoutePort): void {
    this.settingsReloadSubscription =
      route.dataReloaded?.subscribe(() => {
        void this.refreshAfterDevelopmentReload();
      }) ?? null;
  }

  onSettingsDeactivated(): void {
    this.activeCheckerRoute = null;
    this.activeRoutedCanDeactivate = null;
    this.activeRoutedRefresh = null;
    this.activeMaintenanceWipPort = null;
    this.detail.setCurrencyConsumer(null);
    this.detail.setDecisionPort(null);
    this.settingsReloadSubscription?.unsubscribe();
    this.settingsReloadSubscription = null;
    for (const subscription of this.auditRouteSubscriptions)
      subscription.unsubscribe();
    this.auditRouteSubscriptions = [];
    this.routedAuditDetailOpen.set(false);
  }

  private onRouterEvent(event: unknown): void {
    dispatchRouterEvent(event, {
      start: (navigation) => this.handleNavigationStart(navigation),
      end: (navigation) => this.handleNavigationEnd(navigation),
      skipped: (navigation) => this.handleNavigationSkipped(navigation),
      failure: (navigation) => this.handleNavigationFailure(navigation),
    });
  }

  private handleNavigationStart(event: NavigationStart): void {
    this.latestNavigationId = event.id;
    this.loadingRouteView = routeViewFromUrl(event.url);
    this.routeLoading.set(true);
  }

  private handleNavigationEnd(event: NavigationEnd): void {
    const released = this.consumeReleasedNavigationState(event.id);
    this.restoreReleasedWorkbenchState(released);
    const routed = routeViewFromUrl(event.urlAfterRedirects);
    const target = this.resolveNavigationTarget(routed, released);
    this.rememberPreviousWorkbench(routed, released);
    this.completeNavigation(target);
    if (event.urlAfterRedirects !== "/" || !isWorkbenchView(target)) return;

    this.redirectLegacyWorkbenchRoute(target);
  }

  private consumeReleasedNavigationState(navigationId: number): boolean {
    const released =
      this.routeGuardBridge.consumeReleasedMakerWip(navigationId) ||
      this.releasedMakerWipDuringNavigation;
    this.releasedMakerWipDuringNavigation = false;
    this.routeGuardBridge.consumeDenied(navigationId);
    return released;
  }

  private restoreReleasedWorkbenchState(released: boolean): void {
    if (!released) return;
    this.activeMaintenanceWipPort?.clearReleasedMakerForm();
    this.lastWorkbenchView = "dashboard";
    this.document.defaultView?.localStorage.setItem(
      "ssi-last-workbench-view",
      "dashboard",
    );
  }

  private resolveNavigationTarget(
    routed: View | null,
    released: boolean,
  ): View {
    if (routed) return routed;
    if (released) return "dashboard";
    return this.lastWorkbenchView;
  }

  private rememberPreviousWorkbench(
    routed: View | null,
    released: boolean,
  ): void {
    const previousView = this.view();
    if (!routed || !isWorkbenchView(previousView) || released) return;
    this.lastWorkbenchView = previousView;
    this.document.defaultView?.localStorage.setItem(
      "ssi-last-workbench-view",
      this.lastWorkbenchView,
    );
  }

  private completeNavigation(target: View): void {
    this.pendingRouteTarget = null;
    this.loadingRouteView = null;
    this.commitRouteView(target);
    this.routeLoading.set(false);
  }

  private redirectLegacyWorkbenchRoute(target: WorkbenchView): void {
    // Legacy history entries have no routed Maintenance UI after the
    // extraction. Replace that entry with the equivalent lazy route.
    this.pendingRouteTarget = target;
    void this.router
      .navigateByUrl(routePathForView(target)!, { replaceUrl: true })
      .catch(() => {
        this.pendingRouteTarget = null;
        this.notice.set({
          kind: "error",
          text: "無法返回 SSI 工作區；請重新選擇工作區。",
        });
      });
  }

  private handleNavigationSkipped(event: NavigationSkipped): void {
    if (event.id !== this.latestNavigationId) return;

    this.pendingRouteTarget = null;
    this.loadingRouteView = null;
    this.routeLoading.set(false);
  }

  private handleNavigationFailure(
    event: NavigationCancel | NavigationError,
  ): void {
    const state = this.consumeNavigationFailureState(event.id);
    if (event.id !== this.latestNavigationId) {
      this.rememberReleasedWip(state.released);
      return;
    }
    this.clearPendingNavigation();
    if (state.released || this.releasedMakerWipDuringNavigation) {
      this.recoverReleasedMakerWip();
      return;
    }
    if (state.denied || state.guardPending) return;
    this.showNavigationFailure();
  }

  private consumeNavigationFailureState(navigationId: number): {
    guardPending: boolean;
    released: boolean;
    denied: boolean;
  } {
    const guardPending = this.routeGuardBridge.isGuardPending(navigationId);
    this.routeGuardBridge.markNavigationTerminated(navigationId);
    const released =
      this.routeGuardBridge.consumeReleasedMakerWip(navigationId);
    const denied = this.routeGuardBridge.consumeDenied(navigationId);
    return { guardPending, released, denied };
  }

  private rememberReleasedWip(released: boolean): void {
    this.releasedMakerWipDuringNavigation ||= released;
  }

  private clearPendingNavigation(): void {
    this.pendingRouteTarget = null;
    this.loadingRouteView = null;
    this.routeLoading.set(false);
  }

  private recoverReleasedMakerWip(): void {
    this.releasedMakerWipDuringNavigation = false;
    this.activeMaintenanceWipPort?.clearReleasedMakerForm();
    this.commitRouteView("dashboard");
    this.restoreDashboardRouteAfterReleasedWip({
      kind: "error",
      text: "頁面切換失敗；修訂 WIP 已釋放，編輯內容已關閉，請重新進入。",
    });
  }

  private showNavigationFailure(): void {
    this.notice.set({
      kind: "error",
      text: "頁面切換失敗；目前畫面與未儲存內容保持不變，請重試。",
    });
  }

  loadingSsiDashboard(): boolean {
    return (
      this.routeLoading() &&
      (this.loadingRouteView === "dashboard" ||
        (this.loadingRouteView === null && this.view() === "dashboard"))
    );
  }

  private commitRouteView(view: View): void {
    this.notice.set(null);
    this.view.set(view);
    this.document.defaultView?.localStorage.setItem("ssi-active-view", view);
    if (isWorkbenchView(view)) {
      this.lastWorkbenchView = view;
      this.document.defaultView?.localStorage.setItem(
        "ssi-last-workbench-view",
        view,
      );
    }
  }

  async closeOverlayOnEscape(): Promise<void> {
    if (await this.activeMaintenanceWipPort?.closeOverlayOnEscape()) return;
    if (this.detail.target()) this.detail.close();
  }

  setTheme(mode: ThemeMode): void {
    this.themeService.setTheme(mode);
  }

  async canDeactivate(targetUrl?: string): Promise<boolean> {
    if (
      this.activeRoutedCanDeactivate &&
      !(await this.activeRoutedCanDeactivate())
    )
      return false;
    return (
      (await this.activeMaintenanceWipPort?.canDeactivate(targetUrl)) ?? true
    );
  }
}
