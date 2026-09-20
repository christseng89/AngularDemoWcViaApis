import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
  viewChild,
  ElementRef,
  inject,
  type OnInit,
  type OnDestroy,
} from "@angular/core";
import { firstValueFrom } from "rxjs";
import { AlertComponent } from "./alert.component";
import type { AlertModel } from "./alert.model";
import { GovernanceIndexTableComponent, type GovernanceIndexColumn, type GovernanceIndexRow } from "./governance-index-table.component";
import {
  RuntimeSettingsService,
  type DemoReloadResult,
  type RuntimeSettings,
  type ResolutionCurrencyRow,
  type ResolutionCurrencyResyncResult,
} from "./runtime-settings.service";

export type ThemeMode = "system" | "light" | "dark";

@Component({
  selector: "ssi-settings-page",
  standalone: true,
  imports: [AlertComponent, GovernanceIndexTableComponent],
  template: `
    <section class="settings-page" aria-label="Settings controls">
      <section class="settings-section" aria-labelledby="appearance-title">
        <div>
          <h3 id="appearance-title">Appearance</h3>
          <p>只儲存在這個瀏覽器。</p>
        </div>
        <fieldset class="theme-options" aria-label="Theme">
          @for (option of themes; track option.value) {
            <label [class.selected]="theme() === option.value">
              <input
                type="radio"
                name="theme"
                [value]="option.value"
                [checked]="theme() === option.value"
                (change)="themeChange.emit(option.value)"
              />
              <span>{{ option.label }}</span>
            </label>
          }
        </fieldset>
      </section>

      <section class="settings-section" aria-labelledby="runtime-title">
        <div>
          <h3 id="runtime-title">Runtime environment</h3>
          <p>由伺服器設定決定，瀏覽器不可切換。</p>
        </div>
        @if (runtime(); as current) {
          <div class="runtime-status">
            <b>{{ displayRuntimeEnvironment(current) }}</b>
            <small>{{ current.statusPolicyVersion }}</small>
          </div>
        } @else {
          <span class="loading-copy">正在讀取環境設定…</span>
        }
      </section>

      <div class="settings-tabs" role="tablist" aria-label="Settings data tools">
        <button type="button" role="tab" id="reload-tab" aria-controls="reload-panel" [attr.aria-selected]="settingsTab() === 'reload'" [class.active]="settingsTab() === 'reload'" (click)="selectSettingsTab('reload')">Reload Test Data</button>
        <button type="button" role="tab" id="currency-tab" aria-controls="currency-panel" [attr.aria-selected]="settingsTab() === 'currency'" [class.active]="settingsTab() === 'currency'" (click)="selectSettingsTab('currency')">Inquire Business Currency Index</button>
      </div>

      @if (settingsTab() === 'currency') {
      <section id="currency-panel" class="currency-inquiry" role="tabpanel" aria-labelledby="currency-tab">
        <div class="currency-heading">
          <div>
            <p class="eyebrow">CONTROLLED RESOLUTION DATA</p>
            <h3 id="currency-title">{{ currencyConfig().title }}</h3>
          </div>
          @if (runtime()?.developmentEnabled) {
            <button type="button" class="ghost" [disabled]="currencyBusy() || currencyLoading()" (click)="resyncCurrencies()">{{ currencyBusy() ? "Resyncing…" : "Resync" }}</button>
          }
        </div>
        <label class="index-search" for="currency-search">
          <span>{{ currencySearchLabel() }}</span>
          <input id="currency-search" type="search" [placeholder]="currencySearchPlaceholder()" [value]="currencySearchInput()" (input)="onCurrencySearchInput($any($event.target).value)" (keydown.enter)="submitCurrencySearch()" />
        </label>
        @if (currencyError(); as failure) {
          <ssi-alert [model]="failure" variant="inline" />
          <button type="button" class="ghost" (click)="loadCurrencyInquiry()">Retry</button>
        } @else if (currencyLoading()) {
          <p role="status">Loading business currencies…</p>
        } @else if (currencyColumns().length) {
          <ssi-governance-index-table
            appearance="maintenance"
            ariaLabel="Resolution currency inquiry"
            kicker="RESOLUTION CURRENCY"
            instruction="Controlled business currency coverage"
            emptyText="No business currencies found."
            recordLabel="records"
            [columns]="currencyColumns()"
            [trailingColumns]="[]"
            [rows]="currencyRows()"
            [interactiveRows]="false"
            [currentPage]="currencyPage()"
            [totalPages]="currencyTotalPages()"
            [totalRecords]="currencyTotalItems()"
            [pageSize]="currencyConfig().pageSize"
            [sortPath]="currencySortBy()"
            [sortDirection]="currencySortDirection()"
            (sortRequested)="sortCurrencies($event)"
            (pageRequested)="changeCurrencyPage($event)"
          />
        }
        @if (currencyResyncResult(); as synced) {
          <p role="status">Discovered {{ synced.discovered }} · Inserted {{ synced.inserted }} · Unchanged {{ synced.unchanged }} · Inactivated {{ synced.inactivated }}</p>
        }
      </section>
      }

      @if (settingsTab() === 'reload') {
      <section id="reload-panel" class="reload-zone" role="tabpanel" aria-labelledby="reload-tab">
        @if (runtime(); as current) {
          <div class="reload-header">
            <div>
              <p class="eyebrow">DEVELOPMENT DATA</p>
              <h3 id="reload-title">Reload Development Test Data</h3>
              <p>
                清除目前 demo 資料並從 canonical synthetic seed 完整重新匯入。
              </p>
            </div>
          </div>
          <dl class="seed-facts">
            <div>
              <dt>Fixture</dt>
              <dd>{{ current.fixtureId || "Not configured" }}</dd>
            </div>
            <div>
              <dt>Seed SHA-256</dt>
              <dd>
                <code [title]="current.seedSha256 || ''">{{
                  compactIdentifier(current.seedSha256)
                }}</code>
              </dd>
            </div>
          </dl>
          @if (!current.developmentEnabled) {
            <ssi-alert [model]="developmentOff" variant="inline" />
          } @else if (!current.reloadAvailable) {
            <ssi-alert [model]="reloadUnavailable" variant="inline" />
          }
          <div class="reload-footer">
            <p>需輸入控制密碼。重載採單一交易執行；驗證失敗時保留原資料。</p>
            <button
              class="danger-secondary"
              type="button"
              [disabled]="!current.reloadAvailable || busy()"
              (click)="openConfirmation()"
            >
              Reload test data
            </button>
          </div>
        }
        @if (result(); as completed) {
          <ssi-alert [model]="successAlert(completed)" variant="banner" />
        }
        @if (error(); as failure) {
          <ssi-alert
            [model]="failure"
            variant="blocking"
            [dismissible]="true"
            (dismiss)="error.set(null)"
          />
        }
      </section>
      }
    </section>

    @if (confirmationOpen()) {
      <div class="dialog-backdrop">
        <section
          class="reload-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="reload-dialog-title"
          aria-describedby="reload-dialog-description"
        >
          <p class="eyebrow">DESTRUCTIVE DEMO ACTION</p>
          <h2 id="reload-dialog-title">重新載入 Development Test Data？</h2>
          <p id="reload-dialog-description">
            系統會在單一交易中清除目前資料，再由 canonical seed
            匯入；驗證失敗時原資料保持不變。
          </p>
          <label for="demo-control-password">Control password</label>
          <input
            #passwordInput
            id="demo-control-password"
            type="password"
            autocomplete="current-password"
            [value]="password()"
            (input)="password.set($any($event.target).value)"
            (keydown.enter)="reload()"
          />
          <div class="dialog-actions">
            <button
              type="button"
              class="ghost"
              [disabled]="busy()"
              (click)="closeConfirmation()"
            >
              取消
            </button>
            <button
              type="button"
              class="danger-primary"
              [disabled]="busy() || !password()"
              (click)="reload()"
            >
              {{ busy() ? "Reloading data…" : "確認清除並重新匯入" }}
            </button>
          </div>
        </section>
      </div>
    }
  `,
  styleUrl: "./settings-page.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPageComponent implements OnInit, OnDestroy {
  private readonly service = inject(RuntimeSettingsService);
  private currencySearchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly passwordInput =
    viewChild<ElementRef<HTMLInputElement>>("passwordInput");
  readonly theme = input.required<ThemeMode>();
  readonly themeChange = output<ThemeMode>();
  readonly dataReloaded = output<DemoReloadResult>();
  readonly runtime = signal<RuntimeSettings | null>(null);
  readonly busy = signal(false);
  readonly confirmationOpen = signal(false);
  readonly password = signal("");
  readonly result = signal<DemoReloadResult | null>(null);
  readonly error = signal<AlertModel | null>(null);
  readonly settingsTab = signal<"reload" | "currency">("reload");
  readonly currencyColumns = signal<readonly GovernanceIndexColumn[]>([]);
  readonly currencyRows = signal<readonly GovernanceIndexRow<ResolutionCurrencyRow>[]>([]);
  readonly currencyPage = signal(1);
  readonly currencyTotalPages = signal(1);
  readonly currencyTotalItems = signal(0);
  readonly currencyLoading = signal(false);
  readonly currencyBusy = signal(false);
  readonly currencyError = signal<AlertModel | null>(null);
  readonly currencyResyncResult = signal<ResolutionCurrencyResyncResult | null>(null);
  readonly currencySearchInput = signal("");
  readonly currencySearch = signal("");
  readonly currencySearchLabel = signal("Search Business Currency index");
  readonly currencySearchPlaceholder = signal("Search configured index fields");
  readonly currencySortBy = signal("businessDomain");
  readonly currencySortDirection = signal<"asc" | "desc">("asc");
  readonly currencyLoaded = signal(false);
  readonly themes = [
    { value: "system" as const, label: "System" },
    { value: "light" as const, label: "Light" },
    { value: "dark" as const, label: "Dark" },
  ];
  readonly developmentOff: AlertModel = {
    severity: "warning",
    title: "Development mode is OFF",
    message: "伺服器未啟用 Development Mode；資料重載已鎖定。",
  };
  readonly reloadUnavailable: AlertModel = {
    severity: "error",
    title: "Reload 尚未配置",
    message: "缺少伺服器控制密碼或 canonical seed。",
    impact: "現有資料不受影響。",
    code: "DEMO_RELOAD_NOT_CONFIGURED",
  };

  ngOnInit(): void {
    void this.loadRuntime();
  }

  ngOnDestroy(): void {
    if (this.currencySearchTimer) clearTimeout(this.currencySearchTimer);
  }

  selectSettingsTab(tab: "reload" | "currency"): void {
    this.settingsTab.set(tab);
    if (tab === "currency" && !this.currencyLoaded() && !this.currencyLoading())
      void this.loadCurrencyInquiry();
  }

  currencyConfig() {
    return this.runtime()?.resolutionCurrencyInquiry ?? {
      title: "Inquire Business Currency Index", sortBy: "businessDomain", sortDirection: "asc" as const, pageSize: 10,
    };
  }

  submitCurrencySearch(): void {
    if (this.currencySearchTimer) clearTimeout(this.currencySearchTimer);
    this.currencySearch.set(this.currencySearchInput().trim());
    void this.loadCurrencyInquiry(1);
  }

  onCurrencySearchInput(value: string): void {
    this.currencySearchInput.set(value);
    if (this.currencySearchTimer) clearTimeout(this.currencySearchTimer);
    this.currencySearchTimer = setTimeout(() => this.submitCurrencySearch(), 300);
  }

  sortCurrencies(path: string): void {
    if (!this.currencyColumns().some((column) => column.path === path)) return;
    this.currencySortDirection.set(this.currencySortBy() === path && this.currencySortDirection() === "asc" ? "desc" : "asc");
    this.currencySortBy.set(path);
    void this.loadCurrencyInquiry(1);
  }

  async loadCurrencyInquiry(page = this.currencyPage()): Promise<void> {
    this.currencyLoading.set(true);
    this.currencyError.set(null);
    try {
      if (!this.runtime()) await this.loadRuntime();
      if (!this.runtime()) throw new Error("RUNTIME_SETTINGS_UNAVAILABLE");
      const [contract, result] = await Promise.all([
        firstValueFrom(this.service.currencyContract()),
        firstValueFrom(this.service.resolutionCurrencies(page, this.currencyConfig().pageSize, this.currencySearch(), this.currencySortBy(), this.currencySortDirection())),
      ]);
      const inquiry = contract["x-ui-inquiries"]?.find(({ id }) => id === "resolution-currency");
      if (inquiry?.mode !== "INDEX_ONLY" || inquiry.endpoint !== "settings/resolution-currencies" || !inquiry.columns.length)
        throw new Error("RESOLUTION_CURRENCY_SCREEN_CONTRACT_MISSING");
      this.currencyColumns.set(inquiry.columns);
      this.currencySearchLabel.set(inquiry.search?.label ?? "Search Business Currency index");
      this.currencySearchPlaceholder.set(inquiry.search?.placeholder ?? "Search configured index fields");
      this.currencyRows.set(result.items.map((row) => ({
        id: `${row.businessDomain}-${row.currency}`,
        cells: inquiry.columns.map(({ path }) => {
          const value = row[path as keyof ResolutionCurrencyRow];
          return value == null ? "—" : String(value);
        }),
        trailing: [],
        source: row,
      })));
      this.currencyPage.set(result.page);
      this.currencyTotalPages.set(Math.max(1, result.totalPages));
      this.currencyTotalItems.set(result.totalItems);
      this.currencyLoaded.set(true);
    } catch {
      this.currencyError.set({
        severity: "error",
        title: "Unable to load business currency index",
        message: "The governed inquiry is temporarily unavailable.",
        code: "RESOLUTION_CURRENCY_INQUIRY_UNAVAILABLE",
      });
    } finally {
      this.currencyLoading.set(false);
    }
  }

  changeCurrencyPage(delta: number): void {
    const next = this.currencyPage() + delta;
    if (next >= 1 && next <= this.currencyTotalPages()) void this.loadCurrencyInquiry(next);
  }

  async resyncCurrencies(): Promise<void> {
    if (!this.runtime()?.developmentEnabled || this.currencyBusy()) return;
    this.currencyBusy.set(true);
    this.currencyError.set(null);
    try {
      this.currencyResyncResult.set(await firstValueFrom(this.service.resyncResolutionCurrencies()));
      await this.loadCurrencyInquiry(1);
    } catch {
      this.currencyError.set({
        severity: "error",
        title: "Business currency resync failed",
        message: "Existing coverage remains available; retry after checking the service.",
        code: "RESOLUTION_CURRENCY_RESYNC_FAILED",
      });
    } finally {
      this.currencyBusy.set(false);
    }
  }

  async loadRuntime(): Promise<void> {
    try {
      this.runtime.set(await firstValueFrom(this.service.runtime()));
      if (!this.currencyLoaded()) {
        this.currencySortBy.set(this.currencyConfig().sortBy);
        this.currencySortDirection.set(this.currencyConfig().sortDirection);
      }
    } catch {
      this.error.set({
        severity: "error",
        title: "無法讀取 Settings",
        message: "Runtime settings service 暫時無法使用。",
        impact: "資料重載保持鎖定。",
        code: "RUNTIME_SETTINGS_UNAVAILABLE",
      });
    }
  }

  openConfirmation(): void {
    if (!this.runtime()?.reloadAvailable) return;
    this.confirmationOpen.set(true);
    queueMicrotask(() => this.passwordInput()?.nativeElement.focus());
  }

  closeConfirmation(): void {
    if (this.busy()) return;
    this.password.set("");
    this.confirmationOpen.set(false);
  }

  async reload(): Promise<void> {
    if (this.busy() || !this.password()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(
        this.service.reloadDevelopmentData(this.password()),
      );
      this.result.set(result);
      this.confirmationOpen.set(false);
      this.dataReloaded.emit(result);
      await this.loadRuntime();
      await this.loadCurrencyInquiry(1);
    } catch (error_) {
      const code = this.errorCode(error_);
      this.error.set({
        severity: "error",
        title:
          code === "INVALID_DEMO_CONTROL_PASSWORD"
            ? "控制密碼不正確"
            : "Development data reload 失敗",
        message:
          code === "INVALID_DEMO_CONTROL_PASSWORD"
            ? "密碼驗證失敗，資料庫未被修改。"
            : "伺服器未完成受控資料重載。",
        impact: "現有資料保持不變；修正問題後可重試。",
        code,
      });
    } finally {
      this.password.set("");
      this.busy.set(false);
    }
  }

  successAlert(result: DemoReloadResult): AlertModel {
    const count = Object.values(result.importedRows).reduce(
      (total, value) => total + value,
      0,
    );
    return {
      severity: "success",
      title: "Development test data 已重新載入",
      message: `已匯入 ${count} 筆資料；畫面資料已重新整理。`,
      impact: `Snapshot ${result.snapshotHash}`,
      code: result.code,
    };
  }

  compactIdentifier(value: string | null | undefined): string {
    if (!value) return "Unavailable";
    if (value.length <= 22) return value;
    return `${value.slice(0, 12)}…${value.slice(-6)}`;
  }

  displayRuntimeEnvironment(settings: RuntimeSettings): string {
    return settings.developmentEnabled
      ? "DEVELOPMENT"
      : settings.runtimeEnvironment.toUpperCase();
  }

  private errorCode(caught: unknown): string {
    const response = (caught as { error?: { code?: unknown } })?.error;
    return typeof response?.code === "string"
      ? response.code
      : "DEMO_DATA_RELOAD_FAILED";
  }
}
