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
import { scalarText } from "./scalar-text";
import { JsonPipe } from "@angular/common";
import { ReactiveFormsModule } from "@angular/forms";
import { FormlyForm, type FormlyFieldConfig } from "@ngx-formly/core";
import { firstValueFrom } from "rxjs";
import { AlertComponent } from "./alert.component";
import { GovernedRecordViewComponent } from "./governed-record-view.component";
import {
  BankServicePickerDialogComponent,
} from "./bank-service-picker-dialog.component";
import {
  createMaintenanceIndexActionAdapter,
  type MaintenanceIndexActionId,
  type MaintenanceIndexTab,
} from "./maintenance-index-action-policy";
import {
  currentStatusLabel,
  type CurrentStatus,
} from "./current-status-contract";
import type {
  CurrencyReference,
  MessageTypeChanges,
  OpenApiUiContract,
  RmaMessageTypePolicy,
  Row,
  StatusFilter,
  UiColumn,
  UiResource,
} from "./swift-data-feature/swift-data.models";
import { SwiftDataApiService } from "./swift-data-feature/swift-data-api.service";
import { SwiftDataBankPicker } from "./swift-data-feature/swift-data-bank-picker";
import { SwiftDataRmaSelection } from "./swift-data-feature/swift-data-rma-selection";
import { SwiftDataRevisionSession } from "./swift-data-feature/swift-data-revision-session";
import { SwiftDataFieldMapper } from "./swift-data-feature/swift-data-field-mapper";
import { SwiftDataIndexStore } from "./swift-data-feature/swift-data-index.store";
import { SwiftDataEditorSession, type SwiftDataEditorPorts } from "./swift-data-feature/swift-data-editor.session";
import {
  SwiftDataExportService,
  type SwiftDataExportContext,
} from "./swift-data-feature/swift-data-export.service";


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
  providers: [SwiftDataApiService, SwiftDataBankPicker, SwiftDataExportService, SwiftDataRmaSelection, SwiftDataRevisionSession, SwiftDataFieldMapper, SwiftDataIndexStore, SwiftDataEditorSession],
  templateUrl: "./swift-data-crud.component.html",
  styleUrl: "./swift-data-crud.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "(document:keydown.escape)": "cancelWork()",
  },
})
export class SwiftDataCrudComponent implements OnInit, OnChanges {
  private readonly api = inject(SwiftDataApiService);
  readonly bankPicker = inject(SwiftDataBankPicker);
  private readonly rmaSelection = inject(SwiftDataRmaSelection);
  readonly revision = inject(SwiftDataRevisionSession);
  private readonly exporter = inject(SwiftDataExportService);
  private readonly fieldMapper = inject(SwiftDataFieldMapper);
  readonly index = inject(SwiftDataIndexStore);
  readonly editor = inject(SwiftDataEditorSession);
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
  readonly rows = this.index.rows;
  readonly filteredRows = this.index.rows;
  readonly statusFilter = this.index.statusFilter;
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
  readonly indexSearch = this.index.indexSearch;
  readonly page = this.index.page;
  readonly pageSize = this.index.pageSize;
  readonly totalItems = this.index.totalItems;
  readonly serverTotalPages = this.index.serverTotalPages;
  readonly sortPath = this.index.sortPath;
  readonly sortDirection = this.index.sortDirection;
  readonly totalPages = this.index.totalPages;
  readonly sortedRows = this.index.sortedRows;
  readonly pagedRows = this.index.pagedRows;
  readonly form = this.editor.form;
  readonly fields = signal<FormlyFieldConfig[]>([]);
  readonly editingId = this.editor.editingId;
  readonly savedDraftId = this.editor.savedDraftId;
  readonly formVisible = this.editor.formVisible;
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
  readonly importResult = this.editor.importResult;
  readonly detailTarget = signal<Row | null>(null);
  readonly detailModel = computed<Record<string, unknown>>(() => {
    const row = this.detailTarget();
    const resource = this.resource();
    if (!row || !resource) return {};
    const model: Record<string, unknown> = {};
    for (const field of resource.fields) {
      this.fieldMapper.setPath(
        model,
        field.key,
        this.fieldMapper.toFormValue(this.fieldMapper.getPath(row, field.key), field),
      );
    }
    return model;
  });
  readonly revokeTarget = this.editor.revokeTarget;
  readonly revokeReason = this.editor.revokeReason;
  readonly checkerRejectReason = this.editor.checkerRejectReason;
  get model(): Record<string, unknown> { return this.editor.model; }
  set model(value: Record<string, unknown>) { this.editor.model = value; }

  constructor() {
    this.index.sortValue = (row, path) => this.sortValue(row, path);
    this.editor.connect(this.index, this.revision);
  }

  private editorPorts(): SwiftDataEditorPorts {
    return {
      busy: this.busy,
      notify: (notice) => this.notice.set(notice),
      refresh: () => this.refresh(),
      hydrateRmaSelection: (row) => this.hydrateRmaSelection(row),
      cancelWork: () => this.cancelWork(),
    };
  }

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
        firstValueFrom(this.api.contract()),
        firstValueFrom(this.api.currencies()),
        firstValueFrom(this.api.messageTypePolicy()),
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
    if (this.revision.reservationId() && !(await this.canDeactivate())) return;
    this.resourceId.set(id);
    this.formVisible.set(false);
    this.editingId.set(null);
    this.importResult.set(null);
    this.detailTarget.set(null);
    this.index.reset(this.checkerMode());
    const [currencies, messageTypePolicy] = await Promise.all([
      firstValueFrom(this.api.currencies()),
      firstValueFrom(this.api.messageTypePolicy()),
    ]);
    this.configureFields(currencies, messageTypePolicy);
    await this.refresh();
  }

  searchIndex(value: string): void {
    this.index.search(value);
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const resource = this.resource();
    if (!resource) return;
    this.busy.set(true);
    try {
      await this.index.refresh(resource, this.resourceId());
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
    this.editor.startCreate(resource);
  }
  async cancelWork(): Promise<void> {
    if (this.bankPicker.target()) {
      this.bankPicker.close();
      return;
    }
    const reservationId = this.revision.reservationId();
    if (reservationId && !(await this.canDeactivate())) return;
    this.formVisible.set(false);
    this.detailTarget.set(null);
    this.revokeTarget.set(null);
    this.revokeReason.set("");
    this.editingId.set(null);
  }

  async canDeactivate(): Promise<boolean> {
    const hadReservation = Boolean(this.revision.reservationId());
    const released = await this.revision.canDeactivate(
      this.resource()?.endpoint ?? null,
      () => this.refresh(),
      (notice) => this.notice.set(notice),
    );
    if (released && hadReservation) {
      this.formVisible.set(false);
      this.editingId.set(null);
    }
    return released;
  }
  async view(row: Row): Promise<void> {
    await this.hydrateRmaSelection(row);
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
    await this.editor.edit(row, resource, this.editorPorts());
  }

  async save(): Promise<void> {
    const resource = this.resource();
    if (!resource) return;
    await this.editor.save(resource, this.editorPorts());
  }

  async act(row: Row, action: "submit" | "approve"): Promise<void> {
    const resource = this.resource();
    if (!resource) return;
    await this.editor.act(resource, row, action, this.editorPorts());
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
    await this.editor.revise(resource, row, this.editorPorts());
  }

  requestSuppress(row: Row): void {
    this.editor.requestSuppress(row);
  }
  requestDraftRevoke(row: Row): void {
    this.editor.requestDraftRevoke(row);
  }
  async confirmSuppression(): Promise<void> {
    const resource = this.resource();
    if (!resource) return;
    await this.editor.confirmSuppression(resource, this.editorPorts());
  }

  async upload(event: Event, dryRun: boolean): Promise<void> {
    const resource = this.resource();
    if (!resource) return;
    await this.editor.upload(resource, event, dryRun, this.editorPorts());
  }

  async exportExcel(): Promise<void> {
    const resource = this.resource();
    if (!resource || this.exportBusy()) return;
    this.exportBusy.set(true);
    try {
      await this.exporter.excel(this.exportContext(resource));
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

  private exportContext(resource: UiResource): SwiftDataExportContext {
    return {
      resource,
      rows: this.sortedRows(),
      statusFilter: this.statusFilter(),
      sortPath: this.sortPath(),
      sortDirection: this.sortDirection(),
      value: (row, path) => this.value(row, path),
    };
  }

  exportJson(): void {
    const resource = this.resource();
    if (!resource || this.exportBusy()) return;
    this.exportBusy.set(true);
    try {
      this.exporter.json(this.exportContext(resource));
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
    const value = this.fieldMapper.getPath(row, path);
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
    return this.fieldMapper.getPath(row, path);
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
    if (!resource) return;
    await this.editor.rejectFromChecker(resource, row, this.checkerMode(), this.editorPorts());
  }
  movePage(delta: number): void {
    this.index.movePage(delta);
    void this.refresh();
  }
  toggleSort(path: string): void {
    this.index.toggleSort(path);
  }
  sortIndicator(path: string): string {
    return this.index.sortIndicator(path);
  }
  private configureFields(
    currencies: readonly CurrencyReference[],
    messageTypePolicy: RmaMessageTypePolicy,
  ): void {
    const resource = this.resource();
    if (!resource) return;
    this.fields.set(
      this.fieldMapper.fields(resource, currencies, messageTypePolicy, {
        editingId: () => this.editingId(),
        selectMessageTypes: (model, direction) =>
          this.rmaSelection.forDirection(model, direction),
        openBankPicker: (field) => void this.bankPicker.open(field),
      }),
    );
  }

  private async hydrateRmaSelection(row: Row): Promise<void> {
    if (!(await this.rmaSelection.hydrate(row, this.resourceId()))) {
      this.notice.set({
        kind: "warning",
        text: "另一方向的 RMA Message Types 暫時無法載入；目前方向仍可查看。",
      });
    }
  }
  private exportFailureReason(error: unknown): string {
    if (error instanceof Error && error.message.trim())
      return error.message.trim();
    return "瀏覽器無法建立下載檔案";
  }
}
