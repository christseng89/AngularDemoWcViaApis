import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
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
  defaultValue?: unknown;
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
type StatusFilter = "ACTIVE" | "DRAFT" | "SUPERSEDED" | "ALL";
type ExcelWorkbook = import("exceljs").Workbook;
type ExcelWorksheet = import("exceljs").Worksheet;
interface ExportColumn {
  path: string;
  label: string;
}

@Component({
  selector: "ssi-swift-data-crud",
  standalone: true,
  imports: [ReactiveFormsModule, FormlyForm, JsonPipe],
  templateUrl: "./swift-data-crud.component.html",
  styleUrl: "./swift-data-crud.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SwiftDataCrudComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly api = "http://localhost:3100/api";
  readonly contract = signal<OpenApiUiContract | null>(null);
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
  readonly indexSearch = signal("");
  readonly page = signal(1);
  readonly pageSize = 8;
  readonly filteredRows = computed(() => {
    const resource = this.resource();
    const query = this.indexSearch().trim().toLocaleUpperCase();
    const statusRows =
      this.statusFilter() === "ALL"
        ? this.rows()
        : this.rows().filter((row) => row.status === this.statusFilter());
    if (!resource || !query) return statusRows;
    return statusRows.filter((row) =>
      resource.columns.some((column) =>
        this.columnValue(row, column).toLocaleUpperCase().includes(query),
      ),
    );
  });
  readonly sortPath = signal<string | null>(null);
  readonly sortDirection = signal<"asc" | "desc">("asc");
  readonly sortedRows = computed(() => {
    const path = this.sortPath();
    if (!path) return this.filteredRows();
    const direction = this.sortDirection() === "asc" ? 1 : -1;
    return [...this.filteredRows()].sort(
      (left, right) =>
        this.compare(this.getPath(left, path), this.getPath(right, path)) *
        direction,
    );
  });
  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.sortedRows().length / this.pageSize)),
  );
  readonly pagedRows = computed(() => {
    const page = Math.min(this.page(), this.totalPages());
    const start = (page - 1) * this.pageSize;
    return this.sortedRows().slice(start, start + this.pageSize);
  });
  readonly form = new FormGroup({});
  readonly fields = signal<FormlyFieldConfig[]>([]);
  readonly editingId = signal<string | null>(null);
  readonly formVisible = signal(false);
  readonly busy = signal(false);
  readonly exportBusy = signal(false);
  readonly notice = signal<{
    kind: "info" | "warning" | "error";
    text: string;
  } | null>(null);
  readonly importResult = signal<unknown>(null);
  readonly detailTarget = signal<Row | null>(null);
  readonly revokeTarget = signal<Row | null>(null);
  readonly revokeReason = signal("");
  model: Record<string, unknown> = {};

  ngOnInit(): void {
    void this.initialise();
  }

  async initialise(): Promise<void> {
    try {
      const [contract, currencies] = await Promise.all([
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
      ]);
      this.contract.set(contract);
      this.configureFields(currencies);
      await this.refresh();
    } catch {
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
    this.statusFilter.set("ACTIVE");
    this.indexSearch.set("");
    this.page.set(1);
    const currencies = await firstValueFrom(
      this.http.get<CurrencyReference[]>(`${this.api}/reference/currencies`),
    );
    this.configureFields(currencies);
    await this.refresh();
  }

  searchIndex(value: string): void {
    this.indexSearch.set(value);
    this.page.set(1);
  }

  async refresh(): Promise<void> {
    const resource = this.resource();
    if (!resource) return;
    this.busy.set(true);
    try {
      this.rows.set(
        await firstValueFrom(
          this.http.get<Row[]>(`${this.api}/${resource.endpoint}`),
        ),
      );
      this.page.set(Math.min(this.page(), this.totalPages()));
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
    this.formVisible.set(false);
    this.detailTarget.set(null);
    this.editingId.set(null);
  }
  view(row: Row): void {
    this.detailTarget.set(row);
    this.formVisible.set(false);
  }
  openRowFromKeyboard(event: KeyboardEvent, row: Row): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.view(row);
    }
  }
  rowLabel(row: Row): string {
    const resource = this.resource();
    const identifier = resource?.columns[0];
    return `View ${resource?.label ?? "record"} ${identifier ? this.columnValue(row, identifier) : row.id}`;
  }
  coreFields(resource: UiResource): readonly UiField[] {
    const keys = new Set(
      resource.columns.flatMap((column) =>
        column.path ? [column.path] : (column.paths ?? []),
      ),
    );
    return resource.fields.filter((field) => keys.has(field.key));
  }
  detailFields(resource: UiResource): readonly UiField[] {
    const core = new Set(this.coreFields(resource).map((field) => field.key));
    return resource.fields.filter((field) => !core.has(field.key));
  }

  edit(row: Row): void {
    if (row.status !== "DRAFT") {
      void this.revise(row);
      return;
    }
    const resource = this.resource();
    if (!resource) return;
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
        text: `${resource.label} DRAFT 已${id ? "更新" : "建立"}；仍須 Maker submit、獨立 Checker approve 及 activate。`,
      });
      await this.refresh();
    } catch {
      this.notice.set({
        kind: "error",
        text: "儲存被拒絕；請檢查 SWIFT 格式、有效期與 Maker 權限。",
      });
    } finally {
      this.busy.set(false);
    }
  }

  async act(
    row: Row,
    action: "submit" | "approve" | "activate",
  ): Promise<void> {
    const resource = this.resource();
    if (!resource) return;
    const actor = action === "submit" ? row.maker : "checker.demo";
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/${resource.endpoint}/${row.id}/${action}`, {
          actor,
        }),
      );
      await this.refresh();
    } catch {
      this.notice.set({
        kind: "error",
        text: `${action} 被生命週期／四眼控制拒絕。`,
      });
    }
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
      await this.refresh();
      this.edit(revision);
    } catch {
      this.notice.set({ kind: "error", text: "此紀錄無法建立修訂版本。" });
    }
  }

  requestRevoke(row: Row): void {
    this.revokeTarget.set(row);
    this.revokeReason.set("");
  }
  async confirmRevoke(): Promise<void> {
    const resource = this.resource(),
      row = this.revokeTarget(),
      reason = this.revokeReason().trim();
    if (!resource || !row || reason.length < 5) return;
    try {
      await firstValueFrom(
        this.http.delete(`${this.api}/${resource.endpoint}/${row.id}`, {
          body: { actor: "checker.demo", reason },
        }),
      );
      this.revokeTarget.set(null);
      await this.refresh();
    } catch {
      this.notice.set({ kind: "error", text: "邏輯撤銷失敗。" });
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
  columnPath(column: UiColumn): string {
    return column.path ?? column.paths?.[0] ?? "id";
  }
  setStatusFilter(filter: StatusFilter): void {
    this.statusFilter.set(filter);
    this.page.set(1);
    this.detailTarget.set(null);
  }
  movePage(delta: number): void {
    this.page.set(
      Math.min(this.totalPages(), Math.max(1, this.page() + delta)),
    );
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
  private configureFields(currencies: readonly CurrencyReference[]): void {
    const resource = this.resource();
    if (!resource) return;
    this.fields.set(
      resource.fields.map((field) => this.formlyField(field, currencies)),
    );
  }

  private formlyField(
    field: UiField,
    currencies: readonly CurrencyReference[],
  ): FormlyFieldConfig {
    const config: FormlyFieldConfig = {
      key: field.key,
      type: field.type === "multicheckbox" ? "input" : field.type,
      props: this.fieldProps(field, currencies),
    };
    if (field.defaultValue !== undefined)
      config.defaultValue = field.defaultValue;
    if (field.type === "multicheckbox")
      config.validators = {
        messageTypes: { expression: this.validMessageTypes },
      };
    return config;
  }

  private fieldProps(
    field: UiField,
    currencies: readonly CurrencyReference[],
  ): NonNullable<FormlyFieldConfig["props"]> {
    const props: NonNullable<FormlyFieldConfig["props"]> = {
      label: field.label,
      required: Boolean(field.required),
      options: field.optionsSource
        ? currencies.map(({ code, decimals }) => ({
            label: `${code} · ${decimals} decimals`,
            value: code,
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
    if (field.type === "multicheckbox")
      props.description = "以逗號分隔；每項須為 MTnnn、pacs.* 或 *。";
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
