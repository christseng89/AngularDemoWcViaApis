import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  type OnDestroy,
  signal,
  viewChild,
} from "@angular/core";
import { DOCUMENT } from "@angular/common";
import { ReactiveFormsModule, FormGroup } from "@angular/forms";
import { FormlyForm } from "@ngx-formly/core";
import { readonlyFormFields, ssiFormModel } from "./ssi-form-presentation";
import { firstValueFrom, type Subscription } from "rxjs";
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
  RouterOutlet,
} from "@angular/router";
import { SwiftDataCrudComponent } from "./swift-data-crud.component";
import type { SsiRow } from "./ssi-maintenance.types";
import { ReferenceLookupApiService } from "./reference-lookup-api.service";
import { buildSsiMakerFields } from "./ssi-maintenance-feature/ssi-maker-fields";
import {
  SsiMaintenanceShellBridge,
  type SsiMaintenanceShellPort,
} from "./ssi-maintenance-shell-port";
import { APP_ROUTE_GUARD_BRIDGE } from "./app-route-guard";
import { AlertComponent } from "./alert.component";
import { requestTypeLabel as presentRequestTypeLabel } from "./governance-record-value";
import { LoadingStateComponent } from "./loading-state.component";
import type { AppView as View, ThemeMode } from "./app-view.models";
import { ThemeService } from "./theme.service";
import { AppShellComponent } from "./app-shell.component";

type RoutedView =
  | "settings"
  | "resolver"
  | "treasury"
  | "tradefinance"
  | "audit"
  | "checker"
  | "dashboard"
  | "maker";
type LegacyView = Exclude<View, RoutedView>;
type WorkbenchView = "swiftdata" | "dashboard" | "maker";

const routePathForView = (view: View): string | null => {
  switch (view) {
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

const isLegacyView = (view: View): view is LegacyView =>
  routePathForView(view) === null;
const isWorkbenchView = (view: View): view is WorkbenchView =>
  view === "swiftdata" || view === "dashboard" || view === "maker";

const routeViewFromUrl = (url: string): View | null => {
  const path = url.split(/[?#]/, 1)[0];
  return (
    (
      [
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

interface CurrencyReference {
  code: string;
  decimals: number;
  standard: string;
}
@Component({
  selector: "ssi-root",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormlyForm,
    SwiftDataCrudComponent,
    RouterOutlet,
    AlertComponent,
    LoadingStateComponent,
    AppShellComponent,
  ],
  templateUrl: "./app.component.html",
  host: {
    "(document:keydown.escape)": "closeOverlayOnEscape()",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly referenceApi = inject(ReferenceLookupApiService);

  private readonly ssiShellBridge = inject(SsiMaintenanceShellBridge);
  private readonly shellPort = this.maintenanceShellPort();
  private readonly document = inject(DOCUMENT);

  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly routeGuardBridge = inject(APP_ROUTE_GUARD_BRIDGE);
  readonly routedAuditDetailOpen = signal(false);
  private auditRouteSubscriptions: Array<{ unsubscribe(): void }> = [];
  private activeAuditCurrencyOptionsConsumer:
    ((options: readonly { code: string; decimals: number }[]) => void) | null =
    null;
  private readonly swiftDataCrud = viewChild(SwiftDataCrudComponent);
  private activeCheckerRoute: {
    canDeactivate(): Promise<boolean>;
    refresh(): Promise<void>;
    decide(
      row: SsiRow,
      decision: "approve" | "reject",
      reason: string,
    ): Promise<boolean>;
  } | null = null;
  private activeRoutedRefresh: (() => Promise<void>) | null = null;
  private activeMaintenanceWipPort: {
    canDeactivate(targetUrl?: string): Promise<boolean>;
    hasActiveMakerRevision(): boolean;
    onLateMakerWipRelease(): void;
    clearReleasedMakerForm(): void;
    closeOverlayOnEscape(): Promise<boolean>;
  } | null = null;
  readonly view = signal<View>(this.savedView());
  readonly routeLoading = signal(false);
  private lastWorkbenchView: WorkbenchView = this.savedWorkbenchView();
  private pendingRouteTarget: View | null = null;
  private latestNavigationId = 0;
  private releasedMakerWipDuringNavigation = false;
  private readonly routerEventsSubscription: Subscription;
  private settingsReloadSubscription: { unsubscribe(): void } | null = null;
  readonly theme = this.themeService.theme;
  readonly notice = signal<{
    kind: "info" | "warning" | "error";
    text: string;
  } | null>(null);
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
      openDetail: (row) => this.reviewForChecker(row),
      closeDetail: () => this.detailTarget.set(null),
      acceptCurrencies: (items) => {
        this.currencies.set(items);
        this.activeAuditCurrencyOptionsConsumer?.(items);
      },
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
  readonly currenciesLoading = signal(false);
  readonly currencies = signal<readonly CurrencyReference[]>([]);
  readonly readonlyFields = computed(() =>
    readonlyFormFields(buildSsiMakerFields(this.currencies(), () => undefined)),
  );
  readonly detailTarget = signal<SsiRow | null>(null);
  readonly detailForm = new FormGroup({});
  readonly detailModel = computed<Record<string, unknown>>(() => {
    const row = this.detailTarget();
    return row ? this.modelForRow(row) : {};
  });
  readonly checkerRejectReason = signal("");
  readonly governedReviewResourceId = signal<string | null>(null);
  readonly governedReviewRecordId = signal<string | null>(null);
  private readonly loadedFeatureData = new Set<string>();
  private readonly featureDataLoads = new Map<string, Promise<void>>();
  private featureDataGeneration = 0;
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
    if (
      (this.view() === "dashboard" || this.view() === "maker") &&
      this.document.defaultView?.location?.pathname === "/" &&
      savedRoute
    ) {
      this.pendingRouteTarget = this.view();
      void this.router.navigateByUrl(savedRoute).catch(() => undefined);
      return;
    }
  }

  async refreshAfterDevelopmentReload(): Promise<void> {
    this.featureDataGeneration += 1;
    this.loadedFeatureData.clear();
    this.featureDataLoads.clear();
    if (this.view() !== "settings") await this.ensureFeatureData(this.view());
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
    if (
      this.view() === "resolver" ||
      this.view() === "treasury" ||
      this.view() === "tradefinance" ||
      this.view() === "settings" ||
      this.view() === "audit"
    ) {
      await this.activeRoutedRefresh?.();
      return;
    }
    await this.activeRoutedRefresh?.();
  }

  navigate(view: View): Promise<boolean> {
    if (this.pendingRouteTarget !== null) return Promise.resolve(false);
    const targetPath = routePathForView(view);
    if (targetPath || routePathForView(this.view())) {
      if (view === this.view()) {
        return Promise.resolve(true);
      }
      this.pendingRouteTarget = view;
      return this.router.navigateByUrl(targetPath ?? "/").catch(() => false);
    }
    if (!isLegacyView(view)) return Promise.resolve(false);
    this.notice.set(null);
    this.view.set(view);
    this.document.defaultView?.localStorage.setItem("ssi-active-view", view);
    this.lastWorkbenchView = view;
    this.document.defaultView?.localStorage.setItem(
      "ssi-last-workbench-view",
      view,
    );
    void this.ensureFeatureData(view);
    return Promise.resolve(true);
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
    this.settingsReloadSubscription?.unsubscribe();
    for (const subscription of this.auditRouteSubscriptions)
      subscription.unsubscribe();
    this.auditRouteSubscriptions = [];
    this.routedAuditDetailOpen.set(false);
    const route = component as {
      dataReloaded?: {
        subscribe(callback: () => void): { unsubscribe(): void };
      };
      setCurrencyOptions?: (
        options: readonly { code: string; decimals: number }[],
      ) => void;
      detailOpenChange?: {
        subscribe(callback: (open: boolean) => void): { unsubscribe(): void };
      };
      ssiDetailRequested?: {
        subscribe(callback: (snapshot: unknown) => void): {
          unsubscribe(): void;
        };
      };
      tabChanged?: {
        subscribe(callback: () => void): { unsubscribe(): void };
      };
      canDeactivate?: () => Promise<boolean>;
      refresh?: () => Promise<void>;
      maintenanceWipPort?: NonNullable<
        AppComponent["activeMaintenanceWipPort"]
      >;
      decide?: (
        row: SsiRow,
        decision: "approve" | "reject",
        reason: string,
      ) => Promise<boolean>;
      reviewRequested?: {
        subscribe(callback: (row: SsiRow) => void): { unsubscribe(): void };
      };
      countChanged?: {
        subscribe(callback: (count: number) => void): { unsubscribe(): void };
      };
      noticeRaised?: {
        subscribe(
          callback: (notice: { kind: "warning"; text: string }) => void,
        ): {
          unsubscribe(): void;
        };
      };
    };
    this.activeCheckerRoute =
      route.canDeactivate && route.refresh && route.decide
        ? {
            canDeactivate: route.canDeactivate.bind(route),
            refresh: route.refresh.bind(route),
            decide: route.decide.bind(route),
          }
        : null;
    this.activeRoutedRefresh = route.refresh?.bind(route) ?? null;
    this.activeMaintenanceWipPort = route.maintenanceWipPort ?? null;
    if (route.reviewRequested)
      this.auditRouteSubscriptions.push(
        route.reviewRequested.subscribe(
          (row) => void this.reviewForChecker(row),
        ),
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
    this.activeAuditCurrencyOptionsConsumer =
      route.setCurrencyOptions?.bind(route) ?? null;
    this.activeAuditCurrencyOptionsConsumer?.(this.currencies());
    if (route.detailOpenChange)
      this.auditRouteSubscriptions.push(
        route.detailOpenChange.subscribe((open) =>
          this.routedAuditDetailOpen.set(open),
        ),
      );
    if (route.ssiDetailRequested)
      this.auditRouteSubscriptions.push(
        route.ssiDetailRequested.subscribe((snapshot) =>
          this.detailTarget.set(snapshot as SsiRow),
        ),
      );
    if (route.tabChanged)
      this.auditRouteSubscriptions.push(
        route.tabChanged.subscribe(() => this.detailTarget.set(null)),
      );
    this.settingsReloadSubscription =
      route.dataReloaded?.subscribe(() => {
        void this.refreshAfterDevelopmentReload();
      }) ?? null;
  }

  onSettingsDeactivated(): void {
    this.activeCheckerRoute = null;
    this.activeRoutedRefresh = null;
    this.activeMaintenanceWipPort = null;
    this.activeAuditCurrencyOptionsConsumer = null;
    this.settingsReloadSubscription?.unsubscribe();
    this.settingsReloadSubscription = null;
    for (const subscription of this.auditRouteSubscriptions)
      subscription.unsubscribe();
    this.auditRouteSubscriptions = [];
    this.routedAuditDetailOpen.set(false);
  }

  private onRouterEvent(event: unknown): void {
    if (event instanceof NavigationStart) {
      this.latestNavigationId = event.id;
      this.routeLoading.set(true);
      return;
    }
    if (event instanceof NavigationEnd) {
      const released =
        this.routeGuardBridge.consumeReleasedMakerWip(event.id) ||
        this.releasedMakerWipDuringNavigation;
      this.releasedMakerWipDuringNavigation = false;
      this.routeGuardBridge.consumeDenied(event.id);
      if (released) {
        this.activeMaintenanceWipPort?.clearReleasedMakerForm();
        this.lastWorkbenchView = "dashboard";
        this.document.defaultView?.localStorage.setItem(
          "ssi-last-workbench-view",
          "dashboard",
        );
      }
      const routed = routeViewFromUrl(event.urlAfterRedirects);
      const target: View = routed
        ? routed
        : released
          ? "dashboard"
          : this.pendingRouteTarget && isLegacyView(this.pendingRouteTarget)
            ? this.pendingRouteTarget
            : this.lastWorkbenchView;
      const previousView = this.view();
      if (routed && isWorkbenchView(previousView) && !released) {
        this.lastWorkbenchView = previousView;
        this.document.defaultView?.localStorage.setItem(
          "ssi-last-workbench-view",
          this.lastWorkbenchView,
        );
      }
      this.pendingRouteTarget = null;
      this.commitRouteView(target);
      this.routeLoading.set(false);
      if (
        event.urlAfterRedirects === "/" &&
        (target === "dashboard" || target === "maker")
      ) {
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
      return;
    }
    if (event instanceof NavigationSkipped) {
      if (event.id === this.latestNavigationId) {
        this.pendingRouteTarget = null;
        this.routeLoading.set(false);
      }
      return;
    }
    if (event instanceof NavigationCancel || event instanceof NavigationError) {
      const guardPending = this.routeGuardBridge.isGuardPending(event.id);
      this.routeGuardBridge.markNavigationTerminated(event.id);
      const released = this.routeGuardBridge.consumeReleasedMakerWip(event.id);
      const denied = this.routeGuardBridge.consumeDenied(event.id);
      if (event.id !== this.latestNavigationId) {
        this.releasedMakerWipDuringNavigation ||= released;
        return;
      }
      this.pendingRouteTarget = null;
      this.routeLoading.set(false);
      if (released || this.releasedMakerWipDuringNavigation) {
        this.releasedMakerWipDuringNavigation = false;
        this.activeMaintenanceWipPort?.clearReleasedMakerForm();
        this.commitRouteView("dashboard");
        this.restoreDashboardRouteAfterReleasedWip({
          kind: "error",
          text: "頁面切換失敗；修訂 WIP 已釋放，編輯內容已關閉，請重新進入。",
        });
      } else if (!denied && !guardPending) {
        this.notice.set({
          kind: "error",
          text: "頁面切換失敗；目前畫面與未儲存內容保持不變，請重試。",
        });
      }
    }
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
    if (view !== "dashboard" && view !== "maker")
      void this.ensureFeatureData(view);
  }

  private ensureFeatureData(view: View): Promise<void> {
    const key =
      view === "treasury" || view === "tradefinance" ? "fin-resolution" : view;
    const cacheAfterLoad = true;
    if (cacheAfterLoad && this.loadedFeatureData.has(key))
      return Promise.resolve();
    const existing = this.featureDataLoads.get(key);
    if (existing) return existing;
    const generation = this.featureDataGeneration;
    const load = this.loadFeatureData(view)
      .then(() => {
        if (cacheAfterLoad && generation === this.featureDataGeneration)
          this.loadedFeatureData.add(key);
      })
      .finally(() => {
        if (this.featureDataLoads.get(key) === load)
          this.featureDataLoads.delete(key);
      });
    this.featureDataLoads.set(key, load);
    return load;
  }

  private async loadFeatureData(view: View): Promise<void> {
    if (view === "swiftdata" || view === "settings" || view === "checker")
      return;
    // The parameter-driven Resolution workspace loads only the selected page
    // definition and its own dependent lookups. The legacy parent workspace
    // must not preload unrelated reference services or emit duplicate alerts.
  }

  async reviewForChecker(row: SsiRow): Promise<void> {
    if (this.currencies().length === 0 && !this.currenciesLoading())
      await this.loadCurrencies();
    this.detailForm.reset(this.modelForRow(row));
    this.checkerRejectReason.set("");
    this.detailTarget.set(row);
  }

  async decideSsi(row: SsiRow, decision: "approve" | "reject"): Promise<void> {
    const reason = this.checkerRejectReason().trim();
    if (decision === "reject" && reason.length < 5) {
      this.notice.set({
        kind: "warning",
        text: "Reject 必須輸入至少 5 個字元的退回原因。",
      });
      return;
    }
    try {
      if (!this.activeCheckerRoute)
        throw new Error("Checker route is not active");
      if (!(await this.activeCheckerRoute.decide(row, decision, reason)))
        return;
      this.detailTarget.set(null);
      this.checkerRejectReason.set("");
      this.notice.set({
        kind: "info",
        text:
          decision === "approve"
            ? "SSI 已由獨立 Checker 核准並啟用。"
            : "SSI 已退回 Maker 的 DRAFT 工作清單。",
      });
    } catch {
      this.notice.set({
        kind: "error",
        text: `Checker ${decision === "approve" ? "Approve" : "Reject"} 被生命週期／四眼控制拒絕。`,
      });
    }
  }

  async closeOverlayOnEscape(): Promise<void> {
    if (await this.activeMaintenanceWipPort?.closeOverlayOnEscape()) return;
    if (this.detailTarget()) this.detailTarget.set(null);
  }

  setTheme(mode: ThemeMode): void {
    this.themeService.setTheme(mode);
  }

  async canDeactivate(targetUrl?: string): Promise<boolean> {
    if (
      this.activeCheckerRoute &&
      !(await this.activeCheckerRoute.canDeactivate())
    )
      return false;
    const swiftData = this.swiftDataCrud();
    if (swiftData && !(await swiftData.canDeactivate())) return false;
    return (
      (await this.activeMaintenanceWipPort?.canDeactivate(targetUrl)) ?? true
    );
  }

  requestTypeLabel(row: SsiRow): "ADD" | "EDIT" | "SUPPRESSED" {
    return presentRequestTypeLabel(row);
  }

  private modelForRow(row: SsiRow): Record<string, unknown> {
    const ownership =
      row.ownershipType ??
      (row.route["counterpartyBic"] === "ANY" ? "OWN" : "COUNTERPARTY");
    return ssiFormModel(row, ownership);
  }

  private async loadCurrencies(): Promise<void> {
    this.currenciesLoading.set(true);
    try {
      const currencies = await firstValueFrom(
        this.referenceApi.currencies<CurrencyReference[]>(),
      );
      this.currencies.set(currencies);
      this.activeAuditCurrencyOptionsConsumer?.(currencies);
    } catch {
      this.notice.set({
        kind: "warning",
        text: "Currency 參考服務暫時不可用。",
      });
    } finally {
      this.currenciesLoading.set(false);
    }
  }
  displayStatus(status: string): string {
    return status === "PENDING_APPROVAL" ? "SUBMITTED" : status;
  }
}
