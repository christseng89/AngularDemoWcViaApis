import { signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import type { SsiMaintenanceApiService } from "../ssi-maintenance-api.service";
import type { SsiRow } from "../ssi-maintenance.types";
import type { ReferenceLookupApiService } from "../reference-lookup-api.service";
import type { SsiResolutionReadStore } from "../ssi-resolution-read-port";
import type {
  ReferenceBookingBranch,
  ReferenceCountry,
  ReferenceCurrency,
  SsiMaintenanceShellPort,
} from "../ssi-maintenance-shell-port";
import { SsiIndexFacade } from "./ssi-index.facade";
import { SsiMakerFacade } from "./ssi-maker.facade";
import { ssiFormModel } from "../ssi-form-presentation";
import {
  projectResolutionCounterparties,
  projectSettlementSsis,
} from "./ssi-resolution-read-projection";

export type SsiMaintenanceNotice = (notice: {
  kind: "error";
  text: string;
}) => void;

/** One route-scoped owner shared by Dashboard and Maker, not a new business facade. */
export class SsiMaintenanceSession {
  readonly index: SsiIndexFacade;
  readonly maker: SsiMakerFacade;
  readonly currencies = signal<readonly ReferenceCurrency[]>([]);
  readonly currenciesLoading = signal(false);
  readonly countries = signal<readonly ReferenceCountry[]>([]);
  readonly bookingBranches = signal<readonly ReferenceBookingBranch[]>([]);
  private activeView: "dashboard" | "maker" | null = null;
  private skipNextLoad: "dashboard" | "maker" | null = null;
  private pendingDeactivation: {
    preserveWip: boolean;
    attempt: Promise<boolean>;
  } | null = null;

  constructor(
    api: SsiMaintenanceApiService,
    private readonly raiseNotice: SsiMaintenanceNotice = () => undefined,
    private readonly shell?: SsiMaintenanceShellPort,
    private readonly references?: ReferenceLookupApiService,
    private readonly readStore?: SsiResolutionReadStore,
  ) {
    this.index = new SsiIndexFacade(api);
    this.maker = new SsiMakerFacade(api, raiseNotice, this.index.indexPageSize);
  }

  activate(view: "dashboard" | "maker"): void {
    this.activeView = view;
  }

  async load(view: "dashboard" | "maker"): Promise<void> {
    this.activate(view);
    if (this.skipNextLoad === view) {
      this.skipNextLoad = null;
      return;
    }
    if (view === "dashboard") {
      await Promise.all([this.refreshIndex(), this.loadCounterpartyDirectory()]);
      return;
    }
    await Promise.all([
      this.refreshIndex(),
      this.loadCurrencies(),
      this.loadCountries(),
      this.loadCounterpartyDirectory(),
      this.loadBookingBranches(),
    ]);
  }

  async refreshIndex(): Promise<void> {
    const result = await this.index.refresh();
    if (result === "applied") {
      this.readStore?.publishSettlementSsis(projectSettlementSsis(this.index.rows()));
      this.shell?.acceptPendingApprovalCount(this.index.ssiSummary().pendingApproval);
      this.shell?.onIndexRefreshed();
    }
    if (result === "error")
      this.shell?.notify({
        kind: "warning",
        text: "BFF 尚未啟動；啟動後重新整理即可。",
      });
  }

  async loadCounterpartyDirectory(): Promise<void> {
    const result = await this.index.loadCounterpartyDirectory();
    this.readStore?.publishCounterparties(
      projectResolutionCounterparties(this.index.counterpartyDirectory()),
    );
    if (result === "error")
      this.shell?.notify({
        kind: "warning",
        text: "Counterparty Master 暫時不可用。",
      });
  }

  private async loadCurrencies(): Promise<void> {
    if (!this.references) return;
    this.currenciesLoading.set(true);
    try {
      const currencies = await firstValueFrom(
        this.references.currencies<ReferenceCurrency[]>(),
      );
      this.currencies.set(currencies);
      this.shell?.acceptCurrencies(currencies);
      this.maker.setCurrencyOptions(currencies);
    } catch {
      this.shell?.notify({
        kind: "warning",
        text: "Currency 參考服務暫時不可用。",
      });
    } finally {
      this.currenciesLoading.set(false);
    }
  }

  private async loadCountries(): Promise<void> {
    if (!this.references) return;
    try {
      const response = await firstValueFrom(
        this.references.countries<{ items: ReferenceCountry[] }>(),
      );
      const countries = response.items.filter((item) => item.status === "ACTIVE");
      this.countries.set(countries);
    } catch {
      this.shell?.notify({
        kind: "warning",
        text: "Country Standing Data 暫時不可用。",
      });
    }
  }

  private async loadBookingBranches(): Promise<void> {
    if (!this.references) return;
    try {
      const response = await firstValueFrom(
        this.references.bookingBranches<{ items: ReferenceBookingBranch[] }>(),
      );
      const branches = response.items.filter((item) => item.status === "ACTIVE");
      this.bookingBranches.set(branches);
    } catch {
      this.shell?.notify({
        kind: "warning",
        text: "Booking Branch/Entity Standing Data 暫時不可用。",
      });
    }
  }

  async startNew(): Promise<void> {
    this.maker.clearRevision();
    this.maker.reset(this.index.ownershipTab());
    this.skipNextLoad = "maker";
    const navigation = this.shell?.navigate("maker");
    this.ensureMakerCurrencies();
    if (!(await navigation)) this.skipNextLoad = null;
  }

  checkerCount(): number {
    return this.shell?.checkerCount() ?? this.index.ssiSummary().pendingApproval;
  }

  async closeMaker(): Promise<void> {
    const revisionId = this.maker.revisionSource()
      ? this.maker.editingId()
      : null;
    if (revisionId) {
      try {
        await this.maker.cancelRevision(revisionId);
      } catch {
        this.notify({
          kind: "error",
          text: "無法取消修訂；In Progress 鎖定仍保留，請重試。",
        });
        return;
      }
    }
    this.maker.clearRevision();
    this.maker.form.reset();
    if (revisionId) await this.refreshIndex();
    this.skipNextLoad = "dashboard";
    if (!(await this.shell?.navigate("dashboard"))) this.skipNextLoad = null;
  }

  async save(): Promise<void> {
    if (this.maker.form.invalid) {
      this.maker.form.markAllAsTouched();
      this.notify({ kind: "warning", text: "請修正必填欄位及 BIC 格式。" });
      return;
    }
    try {
      this.maker.applyCounterpartyIdentityPolicy();
      const id = this.maker.editingId();
      await this.maker.saveDraft();
      this.notify({
        kind: "info",
        text:
          id || this.maker.revisionSource()
            ? "SSI 草稿已更新；請提交審批。"
            : "SSI 草稿已建立；請提交審批。",
      });
      this.maker.clearRevision();
      this.index.ownershipStatus.set("DRAFT");
      this.index.indexPage.set(1);
      await this.refreshIndex();
      this.skipNextLoad = "dashboard";
      if (!(await this.shell?.navigate("dashboard"))) this.skipNextLoad = null;
    } catch {
      this.notify({
        kind: "error",
        text: "儲存失敗；請確認資料格式及 Maker 權限。",
      });
    }
  }

  async act(row: SsiRow, action: "submit" | "approve"): Promise<void> {
    try {
      await this.index.applyAction(row, action);
      await this.refreshIndex();
    } catch {
      this.notify({ kind: "error", text: `動作 ${action} 被拒絕。` });
    }
  }

  async edit(row: SsiRow): Promise<void> {
    if (row.changeType === "SUPPRESSION") return;
    if (!["DRAFT", "WIP"].includes(row.status)) {
      await this.revise(row);
      return;
    }
    this.maker.editingId.set(row.id);
    this.maker.revisionSource.set(null);
    this.maker.model = ssiFormModel(row, this.index.ownershipOf(row));
    this.skipNextLoad = "maker";
    const navigation = this.shell?.navigate("maker");
    this.ensureMakerCurrencies();
    if (!(await navigation)) this.skipNextLoad = null;
  }

  async revise(row: SsiRow): Promise<void> {
    const maker = "maker.revision";
    let revision: SsiRow;
    try {
      revision = await this.maker.reserveRevision(row.id, maker);
    } catch {
      this.notify({
        kind: "error",
        text: "無法建立修訂；此 SSI 可能正由其他使用者修改。",
      });
      return;
    }
    this.maker.beginRevision(row, revision, {
      ...ssiFormModel(revision, this.index.ownershipOf(revision)),
      maker,
    });
    this.skipNextLoad = "maker";
    if (!(await this.shell?.navigate("maker"))) {
      this.skipNextLoad = null;
      try {
        if (this.maker.editingId() === revision.id)
          await this.maker.cancelRevision(revision.id, maker);
        this.notify({
          kind: "warning",
          text: "修訂畫面未開啟；已取消伺服器上的 In Progress 鎖定。",
        });
      } catch {
        this.notify({
          kind: "error",
          text: "修訂畫面未開啟，且無法取消 In Progress 鎖定；請重新進入 Maker 後取消。",
        });
      }
      return;
    }
    if (this.maker.editingId() !== revision.id) return;
    this.shell?.notify(null);
    this.ensureMakerCurrencies();
    await this.refreshIndex();
  }

  async confirmDelete(): Promise<void> {
    const row = this.index.deleteTarget();
    const reason = this.index.deleteReason().trim();
    if (!row || reason.length < 5) return;
    try {
      await this.index.revokeOrSuppress(row, reason);
      this.index.closeDeleteDialog();
      this.index.ownershipStatus.set(row.status === "DRAFT" ? "ACTIVE" : "DRAFT");
      this.index.indexPage.set(1);
      this.notify({
        kind: "info",
        text:
          row.status === "DRAFT"
            ? "Draft 已撤銷；原 Active SSI 已恢復可 Revise／Suppress。"
            : "SUPPRESSION DRAFT 已建立；原 Active SSI 在 Checker 核准前繼續有效。",
      });
      await this.refreshIndex();
    } catch {
      await this.refreshIndex();
      this.notify({
        kind: "error",
        text: "Suppression 建立失敗；狀態已重新檢查，可能已有進行中的工作。",
      });
    }
  }

  moveIndexPage(delta: number): void {
    this.index.moveIndexPage(delta);
    void this.refreshIndex();
  }

  selectOwnershipTab(tab: "OWN" | "COUNTERPARTY"): void {
    this.index.selectOwnershipTab(tab);
    if (tab === "COUNTERPARTY") {
      void Promise.all([this.refreshIndex(), this.loadCounterpartyDirectory()]);
      return;
    }
    void this.refreshIndex();
  }

  sortOwnershipIndex(sort: Parameters<SsiIndexFacade["sortOwnershipIndex"]>[0]): void {
    this.index.sortOwnershipIndex(sort);
    void this.refreshIndex();
  }

  selectOwnershipStatus(status: "ACTIVE" | "DRAFT" | "SUPPRESSED" | "ALL"): void {
    this.index.selectOwnershipStatus(status);
    void this.refreshIndex();
  }

  searchOwnershipIndex(value: string): void {
    this.index.searchOwnershipIndex(value);
    void this.refreshIndex();
  }

  openCounterpartySsi(counterpartyId: string): void {
    if (!this.index.openCounterpartySsi(counterpartyId)) return;
    this.shell?.closeDetail();
    void this.refreshIndex();
  }

  closeCounterpartySsi(): void {
    this.index.closeCounterpartySsi();
    this.shell?.closeDetail();
    void this.refreshIndex();
  }

  async reviewForChecker(row: SsiRow): Promise<void> {
    await this.shell?.openDetail(row);
  }

  async closeOverlayOnEscape(): Promise<boolean> {
    if (this.maker.bicPickerTarget()) {
      this.maker.closeBicPicker();
      return true;
    }
    if (this.index.deleteTarget()) {
      this.index.closeDeleteDialog();
      return true;
    }
    if (this.activeView === "maker") {
      await this.closeMaker();
      return true;
    }
    return false;
  }

  onLateMakerWipRelease(): void {
    this.maker.form.reset();
    this.maker.clearRevision();
    this.shell?.restoreDashboardAfterReleasedWip({
      kind: "error",
      text: "頁面切換已取消，但修訂 WIP 隨後釋放；編輯內容已關閉，請重新進入。",
    });
  }

  clearReleasedMakerForm(): void {
    this.maker.form.reset();
  }

  private ensureMakerCurrencies(): void {
    if (this.currencies().length === 0 && !this.currenciesLoading())
      void this.loadCurrencies();
  }

  private notify(notice: { kind: "info" | "warning" | "error"; text: string }): void {
    this.shell?.notify(notice);
    if (!this.shell && notice.kind === "error")
      this.raiseNotice({ kind: "error", text: notice.text });
  }

  hasActiveMakerRevision(): boolean {
    return !!this.maker.revisionSource() && !!this.maker.editingId();
  }

  canDeactivate(targetUrl?: string): Promise<boolean> {
    const preserveWip =
      targetUrl?.split(/[?#]/, 1)[0] === "/maker" &&
      this.activeView !== "maker" &&
      this.hasActiveMakerRevision();
    if (
      this.pendingDeactivation &&
      (!this.pendingDeactivation.preserveWip || preserveWip)
    )
      return this.pendingDeactivation.attempt;
    const attempt = this.releaseWipForNavigation(preserveWip).finally(() => {
      if (this.pendingDeactivation?.attempt === attempt)
        this.pendingDeactivation = null;
    });
    this.pendingDeactivation = { preserveWip, attempt };
    return attempt;
  }

  private async releaseWipForNavigation(preserveWip: boolean): Promise<boolean> {
    if (preserveWip) return true;
    const revisionId = this.maker.revisionSource()
      ? this.maker.editingId()
      : null;
    if (!revisionId) return true;
    try {
      await this.maker.cancelRevision(revisionId);
      return true;
    } catch {
      this.raiseNotice({
        kind: "error",
        text: "無法取消修訂；In Progress 鎖定仍保留，請重試。",
      });
      return false;
    }
  }
}
