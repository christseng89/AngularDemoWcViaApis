import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnChanges,
  type OnInit,
  type SimpleChanges,
  signal,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { scalarText } from "./scalar-text";
import { DOCUMENT, JsonPipe } from "@angular/common";
import {
  AbstractControl,
  FormGroup,
  ReactiveFormsModule,
} from "@angular/forms";
import { FormlyForm, type FormlyFieldConfig } from "@ngx-formly/core";
import { firstValueFrom } from "rxjs";
import { AlertComponent } from "./alert.component";
import { GovernedRecordViewComponent } from "./governed-record-view.component";
import {
  BankServicePickerDialogComponent,
  type BankServicePickerItem,
} from "./bank-service-picker-dialog.component";
import {
  createMaintenanceIndexActionAdapter,
  type MaintenanceIndexActionId,
  type MaintenanceIndexTab,
} from "./maintenance-index-action-policy";
import { assertMaintenanceServerPage } from "./maintenance-index-server-page";
import {
  currentStatusLabel,
  type CurrentStatus,
} from "./current-status-contract";

interface UiColumn {
  path?: string;
  paths?: string[];
  separator?: string;
  label: string;
}
interface UiField {
  key: string;
  label: string;
  description?: string;
  required?: boolean;
  type: string;
  inputType?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  options?: string[];
  optionsSource?: string;
  referenceSource?: "reference/banks";
  defaultValue?: unknown;
  "x-required-when"?: { path: string; equals: unknown };
  "x-disabled-when"?: { path: string; equals: unknown };
}
interface UiResource {
  id: string;
  label: string;
  endpoint: string;
  importType?: "SSI" | "RMA" | "NOSTRO";
  description: string;
  columns: UiColumn[];
  exportColumns?: Array<{ path: string; label: string }>;
  fields: UiField[];
  "x-lifecycle": string[];
}
interface OpenApiUiContract {
  info: { title: string; version: string };
  "x-standards-baseline": Record<string, string>;
  "x-ui-resources": UiResource[];
}
interface CurrencyReference {
  code: string;
  decimals: number;
}
type Row = Record<string, unknown> & {
  id: string;
  status: string;
  version: number;
  maker: string;
};
type StatusFilter =
  "ACTIVE" | "DRAFT" | "PENDING_APPROVAL" | "SUPPRESSED" | "ALL";
type ExcelWorkbook = import("exceljs").Workbook;
type ExcelWorksheet = import("exceljs").Worksheet;
interface ExportColumn {
  path: string;
  label: string;
}
interface PagedRows {
  items: Row[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}
interface BankReference {
  bankServiceId: string;
  bic: string;
  name: string;
  country: string;
  city?: string;
  standard: string;
}
interface BankPage {
  items: readonly BankReference[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
interface MessageTypeChanges {
  readonly unchanged: readonly string[];
  readonly added: readonly string[];
  readonly suppressed: readonly string[];
}
interface RmaMessageCategory {
  readonly categoryId: "SECURITY" | "TRADE_FINANCE" | "PAYMENT";
  readonly displayName: string;
  readonly displayOrder: number;
  readonly emptyStateText: string;
}
interface RmaMessagePolicyItem {
  readonly messageType: string;
  readonly description: string;
  readonly categoryId: RmaMessageCategory["categoryId"];
  readonly directionApplicability: {
    readonly inbound: { readonly applicable: boolean };
    readonly outbound: { readonly applicable: boolean };
  };
}
interface RmaMessageTypePolicy {
  readonly supportedMessageTypes: readonly string[];
  readonly categories: readonly RmaMessageCategory[];
  readonly items: readonly RmaMessagePolicyItem[];
}
interface RmaPairState {
  readonly ownBic: string;
  readonly counterpartyBic: string;
  readonly directions: Readonly<Record<"INBOUND" | "OUTBOUND", Row | null>>;
}

@Component({
  selector: "ssi-swift-data-crud",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormlyForm,
    JsonPipe,
    AlertComponent,
    BankServicePickerDialogComponent,
    GovernedRecordViewComponent,
  ],
  templateUrl: "./swift-data-crud.component.html",
  styleUrl: "./swift-data-crud.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "(document:keydown.escape)": "cancelWork()",
  },
})
export class SwiftDataCrudComponent implements OnInit, OnChanges {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly api = "http://localhost:3100/api";
  readonly contract = signal<OpenApiUiContract | null>(null);
  readonly initialResourceId = input<string | null>(null);
  readonly initialRecordId = input<string | null>(null);
  readonly checkerMode = input(false);
  readonly resourceId = signal("rma");
  readonly resources = computed(() =>
    (this.contract()?.["x-ui-resources"] ?? []).filter(
      (item) => item.id !== "ssi",
    ),
  );
  readonly resource = computed(
    () =>
      this.resources().find((item) => item.id === this.resourceId()) ?? null,
  );
  readonly rows = signal<readonly Row[]>([]);
  readonly statusFilter = signal<StatusFilter>("ACTIVE");
  readonly actionAdapter = computed(() =>
    createMaintenanceIndexActionAdapter(this.resourceId()),
  );
  readonly actionColumns = computed(() =>
    this.checkerMode()
      ? []
      : this.actionAdapter().columnsFor(
          this.statusFilter() as MaintenanceIndexTab,
        ),
  );
  readonly indexSearch = signal("");
  readonly page = signal(1);
  readonly pageSize = 8;
  readonly totalItems = signal(0);
  readonly serverTotalPages = signal(1);
  readonly filteredRows = computed(() => this.rows());
  readonly sortPath = signal<string | null>(null);
  readonly sortDirection = signal<"asc" | "desc">("asc");
  readonly sortedRows = computed(() => {
    const path = this.sortPath();
    if (!path) return this.filteredRows();
    const direction = this.sortDirection() === "asc" ? 1 : -1;
    return [...this.filteredRows()].sort(
      (left, right) =>
        this.compare(this.sortValue(left, path), this.sortValue(right, path)) *
        direction,
    );
  });
  readonly totalPages = computed(() => this.serverTotalPages());
  readonly pagedRows = computed(() => this.sortedRows());
  readonly form = new FormGroup({});
  readonly fields = signal<FormlyFieldConfig[]>([]);
  readonly editingId = signal<string | null>(null);
  readonly revisionReservationId = signal<string | null>(null);
  readonly savedDraftId = signal<string | null>(null);
  readonly formVisible = signal(false);
  readonly busy = signal(false);
  readonly exportBusy = signal(false);
  readonly notice = signal<{
    kind: "info" | "warning" | "error";
    text: string;
  } | null>(null);
  readonly noticeAlert = computed(() => {
    const notice = this.notice();
    if (!notice) return null;
    return {
      severity: notice.kind,
      title:
        notice.kind === "error"
          ? "操作未完成"
          : notice.kind === "warning"
            ? "請注意"
            : "操作完成",
      message: notice.text,
    } as const;
  });
  readonly importResult = signal<unknown>(null);
  readonly detailTarget = signal<Row | null>(null);
  readonly detailModel = computed<Record<string, unknown>>(() => {
    const row = this.detailTarget();
    const resource = this.resource();
    if (!row || !resource) return {};
    const model: Record<string, unknown> = {};
    for (const field of resource.fields) {
      this.setPath(
        model,
        field.key,
        this.toFormValue(this.getPath(row, field.key), field),
      );
    }
    return model;
  });
  readonly revokeTarget = signal<Row | null>(null);
  readonly revokeReason = signal("");
  readonly checkerRejectReason = signal("");
  readonly bankPickerTarget = signal<string | null>(null);
  readonly bankPickerTitle = signal("Select Bank Service");
  readonly bankQuery = signal("");
  readonly bankPickerLoading = signal(false);
  readonly bankPickerError = signal<string | null>(null);
  private readonly rmaDirectionMessageTypes = new Map<
    string,
    readonly string[]
  >();
  private pendingDeactivation: Promise<boolean> | null = null;
  readonly bankPage = signal<BankPage>({
    items: [],
    page: 1,
    pageSize: 8,
    total: 0,
    totalPages: 0,
  });
  readonly bankPickerItems = computed<readonly BankServicePickerItem[]>(() =>
    this.bankPage().items.map((bank) => ({
      bankServiceId: bank.bankServiceId,
      bic: bank.bic,
      displayValue: bank.name,
      location: [bank.city, bank.country].filter(Boolean).join(" · "),
      standard: bank.standard,
    })),
  );
  model: Record<string, unknown> = {};

  ngOnInit(): void {
    void this.initialise();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes["initialResourceId"] || !this.contract()) return;
    const requestedResourceId = this.initialResourceId();
    if (
      !requestedResourceId ||
      requestedResourceId === this.resourceId() ||
      !this.resources().some((resource) => resource.id === requestedResourceId)
    )
      return;
    void this.chooseResource(requestedResourceId);
  }

  async initialise(): Promise<void> {
    this.busy.set(true);
    try {
      if (this.checkerMode()) this.statusFilter.set("PENDING_APPROVAL");
      const [contract, currencies, messageTypePolicy] = await Promise.all([
        firstValueFrom(
          this.http.get<OpenApiUiContract>(
            "/openapi/swift-data-service.v1.json",
          ),
        ),
        firstValueFrom(
          this.http.get<CurrencyReference[]>(
            `${this.api}/reference/currencies`,
          ),
        ),
        firstValueFrom(
          this.http.get<RmaMessageTypePolicy>(
            `${this.api}/rma-authorisations/message-type-policy`,
          ),
        ),
      ]);
      this.contract.set(contract);
      const requestedResourceId = this.initialResourceId();
      if (
        requestedResourceId &&
        contract["x-ui-resources"].some(
          (resource) => resource.id === requestedResourceId,
        )
      ) {
        this.resourceId.set(requestedResourceId);
      }
      this.configureFields(currencies, messageTypePolicy);
      await this.refresh();
      const requestedRecordId = this.initialRecordId();
      if (requestedRecordId) {
        const requestedRow = this.rows().find(
          (row) => row.id === requestedRecordId,
        );
        if (requestedRow) this.view(requestedRow);
      }
    } catch {
      this.busy.set(false);
      this.notice.set({
        kind: "error",
        text: "無法載入 OAS UI contract 或 Currency service；CRUD 頁面採 fail-closed。",
      });
    }
  }

  async chooseResource(id: string): Promise<void> {
    this.resourceId.set(id);
    this.formVisible.set(false);
    this.editingId.set(null);
    this.importResult.set(null);
    this.detailTarget.set(null);
    this.sortPath.set(null);
    this.sortDirection.set("asc");
    this.statusFilter.set(this.checkerMode() ? "PENDING_APPROVAL" : "ACTIVE");
    this.indexSearch.set("");
    this.page.set(1);
    const [currencies, messageTypePolicy] = await Promise.all([
      firstValueFrom(
        this.http.get<CurrencyReference[]>(`${this.api}/reference/currencies`),
      ),
      firstValueFrom(
        this.http.get<RmaMessageTypePolicy>(
          `${this.api}/rma-authorisations/message-type-policy`,
        ),
      ),
    ]);
    this.configureFields(currencies, messageTypePolicy);
    await this.refresh();
  }

  searchIndex(value: string): void {
    this.indexSearch.set(value);
    this.page.set(1);
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const resource = this.resource();
    if (!resource) return;
    this.busy.set(true);
    try {
      const query = new URLSearchParams({
        page: String(this.page()),
        pageSize: String(this.pageSize),
      });
      if (this.statusFilter() !== "ALL")
        query.set("status", this.statusFilter());
      const search = this.indexSearch().trim();
      if (search) query.set("search", search);
      const response = await firstValueFrom(
        this.http.get<PagedRows | Row[]>(
          `${this.api}/${resource.endpoint}?${query.toString()}`,
        ),
      );
      const result: PagedRows = Array.isArray(response)
        ? {
            items: response,
            page: 1,
            pageSize: response.length || this.pageSize,
            totalItems: response.length,
            totalPages: 1,
            hasPrevious: false,
            hasNext: false,
          }
        : response;
      assertMaintenanceServerPage(result.items, this.statusFilter());
      this.rows.set(result.items);
      this.cacheRmaDirectionMessageTypes(result.items);
      this.totalItems.set(result.totalItems);
      this.serverTotalPages.set(result.totalPages);
      this.page.set(result.page);
    } catch {
      this.notice.set({
        kind: "error",
        text: `${resource.label} API 暫時不可用。`,
      });
    } finally {
      this.busy.set(false);
    }
  }

  startCreate(): void {
    const resource = this.resource();
    if (!resource) return;
    this.model = {};
    for (const field of resource.fields)
      if (field.defaultValue !== undefined)
        this.setPath(this.model, field.key, field.defaultValue);
    this.editingId.set(null);
    this.form.reset(this.model);
    this.formVisible.set(true);
  }
  cancelWork(): void {
    if (this.bankPickerTarget()) {
      this.closeBankPicker();
      return;
    }
    const reservationId = this.revisionReservationId();
    this.revisionReservationId.set(null);
    this.formVisible.set(false);
    this.detailTarget.set(null);
    this.revokeTarget.set(null);
    this.revokeReason.set("");
    this.editingId.set(null);
    if (reservationId) void this.releaseRevisionReservation(reservationId);
  }

  async openBankPicker(field: UiField): Promise<void> {
    this.bankPickerTarget.set(field.key);
    this.bankPickerTitle.set(`Select ${field.label}`);
    this.bankQuery.set("");
    this.bankPickerError.set(null);
    await this.loadBankPage(1);
  }

  closeBankPicker(): void {
    this.bankPickerTarget.set(null);
  }

  async searchBanks(query: string): Promise<void> {
    this.bankQuery.set(query.trim());
    await this.loadBankPage(1);
  }

  async moveBankToPage(page: number): Promise<void> {
    await this.loadBankPage(page);
  }

  selectBank(item: BankServicePickerItem): void {
    const target = this.bankPickerTarget();
    if (!target) return;
    this.form.get(target)?.setValue(item.bic);
    this.closeBankPicker();
  }

  private async loadBankPage(page: number): Promise<void> {
    this.bankPickerLoading.set(true);
    this.bankPickerError.set(null);
    try {
      const query = encodeURIComponent(this.bankQuery());
      this.bankPage.set(
        await firstValueFrom(
          this.http.get<BankPage>(
            `${this.api}/reference/banks?page=${page}&pageSize=8&query=${query}`,
          ),
        ),
      );
    } catch {
      this.bankPickerError.set("Bank Service lookup is unavailable.");
    } finally {
      this.bankPickerLoading.set(false);
    }
  }

  async canDeactivate(): Promise<boolean> {
    if (this.pendingDeactivation) return this.pendingDeactivation;
    const attempt = this.performCanDeactivate().finally(() => {
      if (this.pendingDeactivation === attempt) this.pendingDeactivation = null;
    });
    this.pendingDeactivation = attempt;
    return attempt;
  }

  private async performCanDeactivate(): Promise<boolean> {
    const reservationId = this.revisionReservationId();
    if (!reservationId) return true;
    const released = await this.releaseRevisionReservation(reservationId);
    if (released) {
      this.revisionReservationId.set(null);
      this.formVisible.set(false);
      this.editingId.set(null);
    }
    return released;
  }

  private async releaseRevisionReservation(id: string): Promise<boolean> {
    const resource = this.resource();
    if (!resource) return false;
    try {
      await firstValueFrom(
        this.http.delete(`${this.api}/${resource.endpoint}/${id}`, {
          body: {
            actor: "maker.revision",
            reason: "Revision cancelled before Save Draft",
          },
        }),
      );
      this.notice.set({
        kind: "info",
        text: "Revise 已取消；ACTIVE 紀錄已解除修訂註記。",
      });
      await this.refresh();
      return true;
    } catch {
      this.notice.set({
        kind: "error",
        text: "取消 Revise 失敗；資料狀態已改變，請重新整理。",
      });
      await this.refresh();
      return false;
    }
  }
  async view(row: Row): Promise<void> {
    await this.hydrateRmaDirectionMessageTypes(row);
    this.checkerRejectReason.set("");
    this.detailTarget.set(row);
    this.formVisible.set(false);
  }
  async openRowFromKeyboard(event: KeyboardEvent, row: Row): Promise<void> {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      await this.view(row);
    }
  }
  rowLabel(row: Row): string {
    const resource = this.resource();
    const identifier = resource?.columns[0];
    return `View ${resource?.label ?? "record"} ${identifier ? this.columnValue(row, identifier) : row.id}`;
  }
  async edit(row: Row): Promise<void> {
    if (row["changeType"] === "SUPPRESSION") return;
    if (!["DRAFT", "WIP"].includes(row.status)) {
      void this.revise(row);
      return;
    }
    const resource = this.resource();
    if (!resource) return;
    await this.hydrateRmaDirectionMessageTypes(row);
    this.model = {};
    for (const field of resource.fields)
      this.setPath(
        this.model,
        field.key,
        this.toFormValue(this.getPath(row, field.key), field),
      );
    this.editingId.set(row.id);
    this.form.reset(this.model);
    this.formVisible.set(true);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notice.set({
        kind: "warning",
        text: "請修正 OAS／SWIFT 標準驗證錯誤。",
      });
      return;
    }
    const resource = this.resource();
    if (!resource) return;
    const payload = this.toApiPayload(resource);
    this.busy.set(true);
    try {
      const id = this.editingId();
      const resourceUrl = id
        ? `${this.api}/${resource.endpoint}/${id}`
        : `${this.api}/${resource.endpoint}`;
      const saved = await firstValueFrom(
        this.http.request<Row>(id ? "PUT" : "POST", resourceUrl, {
          body: payload,
        }),
      );
      this.editingId.set(saved.id);
      this.notice.set({
        kind: "info",
        text: `${resource.label} DRAFT 已${id ? "更新" : "建立"}；仍須 Maker submit 與獨立 Checker approve。`,
      });
      this.savedDraftId.set(saved.id);
      this.revisionReservationId.set(null);
      this.editingId.set(null);
      this.formVisible.set(false);
      this.statusFilter.set("DRAFT");
      this.indexSearch.set("");
      this.page.set(1);
      await this.refresh();
    } catch (error) {
      const response =
        error !== null && typeof error === "object"
          ? (error as { error?: { message?: unknown } })
          : null;
      const conflict = response?.error?.message === "RMA_INDEX_ALREADY_EXISTS";
      this.notice.set({
        kind: "error",
        text: conflict
          ? "此 BIC 已有 ACTIVE 或進行中的 RMA；請從原 index 使用 EDIT 或 SUPPRESSED。"
          : "儲存被拒絕；請檢查 SWIFT 格式、有效期與 Maker 權限。",
      });
    } finally {
      this.busy.set(false);
    }
  }

  async act(row: Row, action: "submit" | "approve"): Promise<void> {
    const resource = this.resource();
    if (!resource) return;
    const actor = action === "submit" ? row.maker : "checker.demo";
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/${resource.endpoint}/${row.id}/${action}`, {
          actor,
        }),
      );
      this.notice.set({
        kind: "info",
        text:
          action === "submit"
            ? `${resource.label} 已提交審批。`
            : action === "approve"
              ? `${resource.label} 已由獨立 Checker 核准並啟用。`
              : `${resource.label} 已啟用。`,
      });
      await this.refresh();
      if (action === "approve") this.cancelWork();
    } catch {
      this.notice.set({
        kind: "error",
        text: `${action} 被生命週期／四眼控制拒絕。`,
      });
    }
  }

  canAct(row: Row, action: "submit" | "approve"): boolean {
    const expectedStatus = {
      submit: "DRAFT",
      approve: "PENDING_APPROVAL",
    } as const;
    return (
      row.status === expectedStatus[action] &&
      Boolean(this.resource()?.["x-lifecycle"].includes(action))
    );
  }

  async revise(row: Row): Promise<void> {
    const resource = this.resource();
    if (!resource) return;
    try {
      const revision = await firstValueFrom(
        this.http.post<Row>(
          `${this.api}/${resource.endpoint}/${row.id}/revise`,
          { maker: "maker.revision" },
        ),
      );
      this.revisionReservationId.set(revision.id);
      await this.refresh();
      await this.edit(revision);
    } catch {
      this.notice.set({ kind: "error", text: "此紀錄無法建立修訂版本。" });
    }
  }

  requestSuppress(row: Row): void {
    this.revokeTarget.set(row);
    this.revokeReason.set("");
  }
  requestDraftRevoke(row: Row): void {
    if (row.status !== "DRAFT") return;
    this.revokeTarget.set(row);
    this.revokeReason.set("");
  }
  async confirmSuppression(): Promise<void> {
    const resource = this.resource(),
      row = this.revokeTarget(),
      reason = this.revokeReason().trim();
    if (!resource || !row || reason.length < 5) return;
    try {
      if (row.status === "DRAFT") {
        await firstValueFrom(
          this.http.delete(`${this.api}/${resource.endpoint}/${row.id}`, {
            body: { actor: row.maker, reason },
          }),
        );
      } else {
        await firstValueFrom(
          this.http.post(
            `${this.api}/${resource.endpoint}/${row.id}/suppress`,
            {
              maker: "maker.suppression",
              reason,
            },
          ),
        );
      }
      this.revokeTarget.set(null);
      this.revokeReason.set("");
      this.statusFilter.set(row.status === "DRAFT" ? "ACTIVE" : "DRAFT");
      this.page.set(1);
      await this.refresh();
    } catch {
      await this.refresh();
      this.notice.set({
        kind: "error",
        text: "Suppression 建立失敗；狀態已重新檢查，可能已有進行中的工作。",
      });
    }
  }

  async upload(event: Event, dryRun: boolean): Promise<void> {
    const resource = this.resource(),
      input = event.target as HTMLInputElement,
      file = input.files?.[0];
    if (!resource?.importType || !file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const records = Array.isArray(parsed)
        ? parsed
        : (parsed as { records?: unknown[] }).records;
      if (!Array.isArray(records)) throw new Error("records array required");
      this.importResult.set(
        await firstValueFrom(
          this.http.post(`${this.api}/swift-data/imports`, {
            dataType: resource.importType,
            fileName: file.name,
            dryRun,
            idempotencyKey: `portal-${resource.id}-${file.name}-${file.lastModified}-${dryRun}`,
            records,
          }),
        ),
      );
      if (!dryRun) await this.refresh();
      this.notice.set({
        kind: "info",
        text: dryRun
          ? "檔案已完成 dry-run 驗證；未寫入資料。"
          : "檔案已導入為 DRAFT；不會自動啟用。",
      });
    } catch {
      this.notice.set({
        kind: "error",
        text: "匯入失敗：必須是 OAS 定義的 JSON records，且通過逐列驗證。",
      });
    } finally {
      input.value = "";
    }
  }

  async exportExcel(): Promise<void> {
    const resource = this.resource();
    if (!resource || this.exportBusy()) return;
    this.exportBusy.set(true);
    try {
      const excelJsModule =
        (await import("exceljs")) as typeof import("exceljs") & {
          default?: typeof import("exceljs");
        };
      const ExcelJS = excelJsModule.default ?? excelJsModule;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Baseline SSI Prototype";
      workbook.created = new Date();
      const rows = this.sortedRows();
      this.addDataSheet(workbook, resource, rows);
      if (resource.id === "ssi") this.addApplicabilitySheet(workbook, rows);
      this.addMetadataSheet(workbook, resource, rows.length);
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([new Uint8Array(buffer)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      this.download(blob, this.exportFileName(resource.id, "xlsx"));
      this.notice.set({
        kind: "info",
        text: `已匯出 ${this.sortedRows().length} 筆 ${resource.label} 至 Excel。`,
      });
    } catch (error) {
      console.error("Excel export failed", error);
      this.notice.set({
        kind: "error",
        text: `Excel 匯出失敗：${this.exportFailureReason(error)}。請改用 Export JSON，或聯絡系統管理員。`,
      });
    } finally {
      this.exportBusy.set(false);
    }
  }

  private exportColumns(resource: UiResource): readonly ExportColumn[] {
    return (
      resource.exportColumns ??
      resource.columns.flatMap((column) =>
        column.path
          ? [{ path: column.path, label: column.label }]
          : (column.paths ?? []).map((path) => ({ path, label: path })),
      )
    );
  }

  private styleHeader(sheet: ExcelWorksheet): void {
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF17363D" },
      };
      cell.alignment = { vertical: "middle" };
    });
    sheet.getRow(1).height = 24;
  }

  private addDataSheet(
    workbook: ExcelWorkbook,
    resource: UiResource,
    rows: readonly Row[],
  ): void {
    const sheet = workbook.addWorksheet(resource.label.slice(0, 31), {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    const columns = this.exportColumns(resource);
    sheet.columns = columns.map((column, index) => ({
      header: column.label,
      key: `column${index}`,
      width: Math.max(14, Math.min(42, column.label.length + 8)),
    }));
    for (const row of rows)
      sheet.addRow(
        Object.fromEntries(
          columns.map((column, index) => [
            `column${index}`,
            this.value(row, column.path),
          ]),
        ),
      );
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, sheet.rowCount), column: columns.length },
    };
    this.styleHeader(sheet);
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 1) return;
      row.font = { name: "Arial", size: 10 };
      if (rowNumber % 2 === 0)
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF1F5F2" },
          };
        });
    });
    for (let index = 1; index <= columns.length; index += 1) {
      const column = sheet.getColumn(index);
      let width = 14;
      column.eachCell({ includeEmpty: true }, (cell) => {
        width = Math.max(
          width,
          Math.min(42, scalarText(cell.value).length + 2),
        );
      });
      column.width = width;
    }
  }

  private addApplicabilitySheet(
    workbook: ExcelWorkbook,
    rows: readonly Row[],
  ): void {
    const sheet = workbook.addWorksheet("SSI Applicability", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    const headers = [
      "SSI ID",
      "Consumer",
      "Product",
      "Business Function",
      "Payment Leg",
      "Direction",
      "Status",
      "Effective From",
      "Effective To",
      "Version",
    ];
    sheet.columns = headers.map((header, index) => ({
      header,
      key: `column${index}`,
      width: Math.max(14, header.length + 8),
    }));
    for (const row of rows) {
      const links = Array.isArray(row["applicability"])
        ? (row["applicability"] as Record<string, unknown>[])
        : [];
      for (const link of links)
        sheet.addRow({
          column0: this.value(row, "route.ssiCode"),
          column1: link["consumer"],
          column2: link["product"],
          column3: link["businessFunction"],
          column4: link["paymentLeg"],
          column5: link["direction"],
          column6: link["status"],
          column7: link["validFrom"],
          column8: link["validTo"],
          column9: link["version"],
        });
    }
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, sheet.rowCount), column: headers.length },
    };
    this.styleHeader(sheet);
  }

  private addMetadataSheet(
    workbook: ExcelWorkbook,
    resource: UiResource,
    rowCount: number,
  ): void {
    const sheet = workbook.addWorksheet("Export Metadata");
    sheet.addRows([
      ["Field", "Value"],
      ["Resource", resource.label],
      ["Status filter", this.statusFilter()],
      [
        "Sort",
        this.sortPath()
          ? `${this.sortPath()} ${this.sortDirection()}`
          : "API order",
      ],
      ["Exported records", rowCount],
      ["Generated at", new Date().toISOString()],
      [
        "Source",
        "Local synthetic prototype data; never use as payment instructions.",
      ],
    ]);
    sheet.getColumn(1).width = 24;
    sheet.getColumn(2).width = 72;
    sheet.eachRow((row, index) => {
      row.font = { name: "Arial", bold: index === 1 };
    });
  }

  exportJson(): void {
    const resource = this.resource();
    if (!resource || this.exportBusy()) return;
    this.exportBusy.set(true);
    try {
      const generatedAt = new Date().toISOString();
      const payload = {
        metadata: {
          schemaVersion: "1.0",
          resourceId: resource.id,
          resourceLabel: resource.label,
          endpoint: resource.endpoint,
          statusFilter: this.statusFilter(),
          sort: this.sortPath()
            ? { path: this.sortPath(), direction: this.sortDirection() }
            : null,
          exportedRecords: this.sortedRows().length,
          generatedAt,
          encoding: "UTF-8",
          source: "Local synthetic prototype data",
          disclaimer:
            "Synthetic prototype data only; never use as payment instructions.",
        },
        records: this.sortedRows(),
      };
      const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
      this.download(
        new Blob([bytes], { type: "application/json;charset=utf-8" }),
        this.exportFileName(resource.id, "json"),
      );
      this.notice.set({
        kind: "info",
        text: `已匯出 ${this.sortedRows().length} 筆 ${resource.label} 至 UTF-8 JSON。`,
      });
    } catch (error) {
      console.error("JSON export failed", error);
      this.notice.set({
        kind: "error",
        text: `JSON 匯出失敗：${this.exportFailureReason(error)}。請重試或聯絡系統管理員。`,
      });
    } finally {
      this.exportBusy.set(false);
    }
  }

  value(row: Row, path: string): string {
    const value = this.getPath(row, path);
    if (path === "status" && value === "PENDING_APPROVAL") return "SUBMITTED";
    if (path === "status" && value === "WIP") return "IN PROGRESS";
    if (path === "scope") {
      if (value === "REUSABLE") return "STANDING";
      if (value === "TRANSACTION_ONLY") return "TRANSACTION_SPECIFIC";
    }
    return Array.isArray(value) ? value.join(", ") : scalarText(value, "—");
  }
  columnValue(row: Row, column: UiColumn): string {
    return column.path
      ? this.value(row, column.path)
      : (column.paths ?? [])
          .map((path) => this.value(row, path))
          .join(column.separator ?? " · ");
  }
  isRmaMessageColumn(column: UiColumn): boolean {
    return this.resourceId() === "rma" && column.path === "messageTypes";
  }
  rmaMessagePreview(row: Row): readonly string[] {
    const value = row["messageTypes"];
    if (!Array.isArray(value)) return [scalarText(value, "—")];
    const messages = value.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
    return messages.length > 2
      ? [...messages.slice(0, 2), "..."]
      : messages.length
        ? messages
        : ["—"];
  }
  columnPath(column: UiColumn): string {
    return column.path ?? column.paths?.[0] ?? "id";
  }
  displayStatus(status: string): string {
    return status === "PENDING_APPROVAL" ? "SUBMITTED" : status;
  }
  currentStatusLabel(row: Row): string {
    return currentStatusLabel(
      (row["currentStatus"] ?? "EMPTY") as CurrentStatus,
    );
  }
  workflowActionLabel(row: Row): string {
    if (this.canAct(row, "submit")) return "Submit";
    if (this.canAct(row, "approve")) return "Approve";
    return "";
  }
  editActionLabel(row: Row): string {
    if (
      (row.status === "DRAFT" || row.status === "WIP") &&
      row["changeType"] !== "SUPPRESSION"
    )
      return "Edit";
    if (row.status === "ACTIVE" && row["currentStatus"] === "EMPTY")
      return "Revise";
    return "";
  }
  canSuppress(row: Row): boolean {
    return row.status === "ACTIVE" && row["currentStatus"] === "EMPTY";
  }
  canRevokeDraft(row: Row): boolean {
    return row.status === "DRAFT";
  }
  isActionPresented(action: MaintenanceIndexActionId, row: Row): boolean {
    return this.actionAdapter().isPresented(action, row);
  }
  requestTypeLabel(row: Row): "ADD" | "EDIT" | "SUPPRESSED" {
    const changeType = row["changeType"];
    if (changeType === "SUPPRESSION") return "SUPPRESSED";
    if (changeType === "REVISION" || row["amendmentOfId"]) return "EDIT";
    return "ADD";
  }
  messageTypeChanges(row: Row): MessageTypeChanges | null {
    if (this.resourceId() !== "rma") return null;
    const raw = row["messageTypeChanges"];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const changes = raw as Record<string, unknown>;
    const values = (key: string): readonly string[] =>
      Array.isArray(changes[key])
        ? changes[key].filter(
            (value): value is string => typeof value === "string",
          )
        : [];
    return {
      unchanged: values("unchanged"),
      added: values("added"),
      suppressed: values("suppressed"),
    };
  }
  private sortValue(row: Row, path: string): unknown {
    if (path === "__requestType") return this.requestTypeLabel(row);
    if (path === "__openRevisionStatus") return this.currentStatusLabel(row);
    if (path === "__workflowAction") return this.workflowActionLabel(row);
    if (path === "__editAction") return this.editActionLabel(row);
    if (path === "__revokeAction")
      return this.canSuppress(row) ? "Suppress" : "";
    if (path === "__revokeDraftAction")
      return this.canRevokeDraft(row) ? "Revoke Draft" : "";
    return this.getPath(row, path);
  }
  setStatusFilter(filter: StatusFilter): void {
    if (
      !this.actionAdapter().isVisibleSort(
        filter as MaintenanceIndexTab,
        this.sortPath(),
      )
    ) {
      this.sortPath.set(null);
      this.sortDirection.set("asc");
    }
    this.statusFilter.set(filter);
    this.page.set(1);
    this.detailTarget.set(null);
    void this.refresh();
  }

  async rejectFromChecker(row: Row): Promise<void> {
    const resource = this.resource();
    const reason = this.checkerRejectReason().trim();
    if (!resource || !this.checkerMode() || reason.length < 5) return;
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/${resource.endpoint}/${row.id}/reject`, {
          actor: "checker.demo",
          reason,
        }),
      );
      this.notice.set({
        kind: "info",
        text: `${resource.label} 已由 Checker Reject；原因已寫入稽核紀錄。`,
      });
      this.checkerRejectReason.set("");
      this.cancelWork();
      await this.refresh();
    } catch {
      this.notice.set({
        kind: "error",
        text: "Reject 被生命週期／四眼控制拒絕。",
      });
    } finally {
      this.busy.set(false);
    }
  }
  movePage(delta: number): void {
    this.page.set(
      Math.min(this.totalPages(), Math.max(1, this.page() + delta)),
    );
    void this.refresh();
  }
  toggleSort(path: string): void {
    if (this.sortPath() === path)
      this.sortDirection.update((direction) =>
        direction === "asc" ? "desc" : "asc",
      );
    else {
      this.sortPath.set(path);
      this.sortDirection.set("asc");
    }
  }
  sortIndicator(path: string): string {
    if (this.sortPath() !== path) return "";
    return this.sortDirection() === "asc" ? "▲" : "▼";
  }
  private configureFields(
    currencies: readonly CurrencyReference[],
    messageTypePolicy: RmaMessageTypePolicy,
  ): void {
    const resource = this.resource();
    if (!resource) return;
    this.fields.set(
      resource.fields.map((field) =>
        this.formlyField(field, currencies, messageTypePolicy),
      ),
    );
  }

  private formlyField(
    field: UiField,
    currencies: readonly CurrencyReference[],
    messageTypePolicy: RmaMessageTypePolicy,
  ): FormlyFieldConfig {
    const config: FormlyFieldConfig = {
      key: field.key,
      type: field.type,
      props: this.fieldProps(field, currencies, messageTypePolicy),
    };
    if (field.defaultValue !== undefined)
      config.defaultValue = field.defaultValue;
    if (field.type === "multicheckbox")
      config.validators = {
        messageTypes: { expression: this.validMessageTypes },
      };
    const requiredWhen = field["x-required-when"];
    const disabledWhen = field["x-disabled-when"];
    if (requiredWhen || disabledWhen)
      config.expressions = {
        ...(requiredWhen
          ? {
              "props.required": (formlyField: FormlyFieldConfig) =>
                this.getPath(
                  (formlyField.model as Record<string, unknown>) ?? {},
                  requiredWhen.path,
                ) === requiredWhen.equals,
            }
          : {}),
        ...(disabledWhen
          ? {
              "props.disabled": (formlyField: FormlyFieldConfig) =>
                this.getPath(
                  (formlyField.model as Record<string, unknown>) ?? {},
                  disabledWhen.path,
                ) === disabledWhen.equals,
            }
          : {}),
      };
    return config;
  }

  private fieldProps(
    field: UiField,
    currencies: readonly CurrencyReference[],
    messageTypePolicy: RmaMessageTypePolicy,
  ): NonNullable<FormlyFieldConfig["props"]> {
    const props: NonNullable<FormlyFieldConfig["props"]> = {
      label: field.label,
      required: Boolean(field.required),
      options:
        field.optionsSource === "reference/currencies"
          ? currencies.map(({ code, decimals }) => ({
              label: `${code} · ${decimals} decimals`,
              value: code,
            }))
          : field.optionsSource === "rma-authorisations/message-types"
            ? messageTypePolicy.supportedMessageTypes.map((value) => ({
                label: value,
                value,
              }))
            : (field.options ?? []).map((value) => ({ label: value, value })),
    };
    const optionalProps: Array<
      [keyof NonNullable<FormlyFieldConfig["props"]>, unknown]
    > = [
      ["type", field.inputType],
      ["pattern", field.pattern],
      ["minLength", field.minLength],
      ["maxLength", field.maxLength],
      ["min", field.minimum],
      ["max", field.maximum],
      ["description", field.description],
    ];
    for (const [key, value] of optionalProps)
      if (value !== undefined) props[key] = value as never;
    if (field.type === "multicheckbox") {
      props.description =
        "從受控清單選擇；Popup 以相同參數並排顯示 INBOUND／OUTBOUND。";
      props["messageTypeCategories"] = messageTypePolicy.categories;
      props["messageTypeItems"] = messageTypePolicy.items;
      props["messageTypeOperation"] = () => (this.editingId() ? "EDIT" : "ADD");
      props["messageTypeSelectionForDirection"] = (
        model: Record<string, unknown>,
        direction: "INBOUND" | "OUTBOUND",
      ) => this.rmaMessageTypesForDirection(model, direction);
    }
    if (field.referenceSource === "reference/banks") {
      props.readonly = true;
      props.showPicker = true;
      props.pickerLabel = "Bank Service";
      props.pickerAction = () => void this.openBankPicker(field);
      props.description =
        field.description ?? "由 Bank Service 選擇並回填受控 SWIFT BIC。";
    }
    return props;
  }

  private readonly validMessageTypes = (control: AbstractControl): boolean =>
    scalarText(control.value)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .every((value) =>
        /^(MT\d{3}(?:COV)?|pacs\.[A-Za-z0-9.]+|\*)$/.test(value),
      );

  private rmaMessageTypesForDirection(
    model: Record<string, unknown>,
    direction: "INBOUND" | "OUTBOUND",
  ): readonly string[] {
    if (model["direction"] === direction)
      return this.messageTypesFrom(model["messageTypes"]);
    return (
      this.rmaDirectionMessageTypes.get(
        this.rmaDirectionKey(model, direction),
      ) ?? []
    );
  }

  private cacheRmaDirectionMessageTypes(rows: readonly Row[]): void {
    if (this.resourceId() !== "rma") return;
    const candidates = new Map<string, Row[]>();
    for (const row of rows) {
      const direction = row["direction"];
      if (direction !== "INBOUND" && direction !== "OUTBOUND") continue;
      const key = this.rmaDirectionKey(row, direction);
      const group = candidates.get(key) ?? [];
      group.push(row);
      candidates.set(key, group);
    }
    for (const [key, group] of candidates)
      this.rmaDirectionMessageTypes.set(
        key,
        this.messageTypesFrom(this.preferredRmaRow(group)["messageTypes"]),
      );
  }

  private async hydrateRmaDirectionMessageTypes(row: Row): Promise<void> {
    if (this.resourceId() !== "rma") return;
    this.cacheRmaDirectionMessageTypes([row]);
    const counterpartyBic = scalarText(row["counterpartyBic"]).trim();
    if (!counterpartyBic) return;
    try {
      const ownBic = scalarText(row["ownBic"]).trim().toLocaleUpperCase();
      const query = new URLSearchParams({ ownBic, counterpartyBic });
      const pairState = await firstValueFrom(
        this.http.get<RmaPairState>(
          `${this.api}/rma-authorisations/pair-state?${query.toString()}`,
        ),
      );
      this.cacheRmaDirectionMessageTypes(
        Object.values(pairState.directions).filter(
          (candidate): candidate is Row => candidate !== null,
        ),
      );
    } catch {
      this.notice.set({
        kind: "warning",
        text: "另一方向的 RMA Message Types 暫時無法載入；目前方向仍可查看。",
      });
    }
  }

  private preferredRmaRow(rows: readonly Row[]): Row {
    const statusPriority: Record<string, number> = {
      WIP: 4,
      DRAFT: 3,
      PENDING_APPROVAL: 2,
      ACTIVE: 1,
    };
    return [...rows].sort(
      (left, right) =>
        (statusPriority[right.status] ?? 0) -
          (statusPriority[left.status] ?? 0) || right.version - left.version,
    )[0]!;
  }

  private rmaDirectionKey(
    model: Record<string, unknown>,
    direction: "INBOUND" | "OUTBOUND",
  ): string {
    return [
      scalarText(model["ownBic"]).trim().toLocaleUpperCase(),
      scalarText(model["counterpartyBic"]).trim().toLocaleUpperCase(),
      direction,
    ].join("|");
  }

  private messageTypesFrom(value: unknown): readonly string[] {
    const values = Array.isArray(value) ? value : scalarText(value).split(",");
    return values.map((item) => scalarText(item).trim()).filter(Boolean);
  }
  private toFormValue(value: unknown, field: UiField): unknown {
    return field.type === "multicheckbox" && Array.isArray(value)
      ? value.join(", ")
      : value;
  }
  private toApiPayload(resource: UiResource): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const field of resource.fields) {
      const raw = this.getPath(this.model, field.key);
      const value = this.apiFieldValue(raw, field);
      this.setPath(payload, field.key, value);
    }
    return payload;
  }
  private apiFieldValue(raw: unknown, field: UiField): unknown {
    if (field.type === "multicheckbox") {
      return scalarText(raw)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (field.inputType === "number") return Number(raw);
    return raw;
  }
  private getPath(source: Record<string, unknown>, path: string): unknown {
    return path
      .split(".")
      .reduce<unknown>(
        (value, key) =>
          value && typeof value === "object"
            ? (value as Record<string, unknown>)[key]
            : undefined,
        source,
      );
  }
  private compare(left: unknown, right: unknown): number {
    if (typeof left === "number" && typeof right === "number")
      return left - right;
    return scalarText(left).localeCompare(scalarText(right), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }
  private exportFileName(
    resourceId: string,
    extension: "xlsx" | "json",
  ): string {
    return `${resourceId}-${this.statusFilter().toLowerCase()}-${new Date().toISOString().slice(0, 10)}.${extension}`;
  }
  private download(blob: Blob, fileName: string): void {
    const view = this.document.defaultView;
    if (!view) throw new Error("瀏覽器下載服務不可用");
    const url = view.URL.createObjectURL(blob);
    const link = this.document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.hidden = true;
    this.document.body.appendChild(link);
    link.click();
    link.remove();
    view.setTimeout(() => view.URL.revokeObjectURL(url), 1000);
  }
  private exportFailureReason(error: unknown): string {
    if (error instanceof Error && error.message.trim())
      return error.message.trim();
    return "瀏覽器無法建立下載檔案";
  }
  private setPath(
    target: Record<string, unknown>,
    path: string,
    value: unknown,
  ): void {
    const keys = path.split(".");
    let cursor = target;
    for (const key of keys.slice(0, -1)) {
      const child = cursor[key];
      if (!child || typeof child !== "object" || Array.isArray(child))
        cursor[key] = {};
      cursor = cursor[key] as Record<string, unknown>;
    }
    cursor[keys.at(-1)!] = value;
  }
}
