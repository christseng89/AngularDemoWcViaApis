import { inject, Injectable, signal, type WritableSignal } from "@angular/core";
import { FormGroup } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { SwiftDataApiService } from "./swift-data-api.service";
import { SwiftDataFieldMapper } from "./swift-data-field-mapper";
import { SwiftDataIndexStore } from "./swift-data-index.store";
import { SwiftDataRevisionSession } from "./swift-data-revision-session";
import type { Row, UiResource } from "./swift-data.models";

export type SwiftDataNotice = { kind: "info" | "warning" | "error"; text: string };
export interface SwiftDataEditorPorts {
  readonly busy: WritableSignal<boolean>;
  notify(notice: SwiftDataNotice): void;
  refresh(): Promise<void>;
  hydrateRmaSelection(row: Row): Promise<void>;
  cancelWork(): Promise<void>;
}

/** Form, draft and maintenance actions only; index, RMA pair state and transport remain separate. */
@Injectable()
export class SwiftDataEditorSession {
  private readonly api = inject(SwiftDataApiService);
  private readonly mapper = inject(SwiftDataFieldMapper);
  private index!: SwiftDataIndexStore;
  private revision!: SwiftDataRevisionSession;
  readonly form = new FormGroup({});
  readonly editingId = signal<string | null>(null);
  readonly savedDraftId = signal<string | null>(null);
  readonly formVisible = signal(false);
  readonly revokeTarget = signal<Row | null>(null);
  readonly revokeReason = signal("");
  readonly checkerRejectReason = signal("");
  readonly importResult = signal<unknown>(null);
  model: Record<string, unknown> = {};

  connect(index: SwiftDataIndexStore, revision: SwiftDataRevisionSession): void {
    this.index = index;
    this.revision = revision;
  }

  startCreate(resource: UiResource): void {
    this.model = {};
    for (const field of resource.fields)
      if (field.defaultValue !== undefined)
        this.mapper.setPath(this.model, field.key, field.defaultValue);
    this.editingId.set(null);
    this.form.reset(this.model);
    this.formVisible.set(true);
  }

  async edit(row: Row, resource: UiResource, ports: SwiftDataEditorPorts): Promise<void> {
    if (row["changeType"] === "SUPPRESSION") return;
    await ports.hydrateRmaSelection(row);
    this.model = {};
    for (const field of resource.fields)
      this.mapper.setPath(
        this.model,
        field.key,
        this.mapper.toFormValue(this.mapper.getPath(row, field.key), field),
      );
    this.editingId.set(row.id);
    this.form.reset(this.model);
    this.formVisible.set(true);
  }

  async save(resource: UiResource, ports: SwiftDataEditorPorts): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      ports.notify({ kind: "warning", text: "請修正 OAS／SWIFT 標準驗證錯誤。" });
      return;
    }
    const payload = this.mapper.toApiPayload(resource, this.model);
    ports.busy.set(true);
    try {
      const id = this.editingId();
      const saved = await firstValueFrom(this.api.save(resource.endpoint, id, payload));
      this.editingId.set(saved.id);
      ports.notify({
        kind: "info",
        text: `${resource.label} DRAFT 已${id ? "更新" : "建立"}；仍須 Maker submit 與獨立 Checker approve。`,
      });
      this.savedDraftId.set(saved.id);
      this.revision.reservationId.set(null);
      this.editingId.set(null);
      this.formVisible.set(false);
      this.index.statusFilter.set("DRAFT");
      this.index.indexSearch.set("");
      this.index.page.set(1);
      await ports.refresh();
    } catch (error) {
      const response = error !== null && typeof error === "object"
        ? (error as { error?: { message?: unknown } }) : null;
      const conflict = response?.error?.message === "RMA_INDEX_ALREADY_EXISTS";
      ports.notify({
        kind: "error",
        text: conflict
          ? "此 BIC 已有 ACTIVE 或進行中的 RMA；請從原 index 使用 EDIT 或 SUPPRESSED。"
          : "儲存被拒絕；請檢查 SWIFT 格式、有效期與 Maker 權限。",
      });
    } finally {
      ports.busy.set(false);
    }
  }

  async act(
    resource: UiResource,
    row: Row,
    action: "submit" | "approve",
    ports: SwiftDataEditorPorts,
  ): Promise<void> {
    const actor = action === "submit" ? row.maker : "checker.demo";
    try {
      await firstValueFrom(this.api.act(resource.endpoint, row.id, action, actor));
      ports.notify({
        kind: "info",
        text: action === "submit"
          ? `${resource.label} 已提交審批。`
          : action === "approve"
            ? `${resource.label} 已由獨立 Checker 核准並啟用。`
            : `${resource.label} 已啟用。`,
      });
      await ports.refresh();
      if (action === "approve") void ports.cancelWork();
    } catch {
      ports.notify({ kind: "error", text: `${action} 被生命週期／四眼控制拒絕。` });
    }
  }

  async revise(
    resource: UiResource,
    row: Row,
    ports: SwiftDataEditorPorts,
  ): Promise<void> {
    try {
      const revision = await firstValueFrom(
        this.api.revise(resource.endpoint, row.id, "maker.revision"),
      );
      this.revision.reservationId.set(revision.id);
      await ports.refresh();
      await this.edit(revision, resource, ports);
    } catch {
      ports.notify({ kind: "error", text: "此紀錄無法建立修訂版本。" });
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

  async confirmSuppression(resource: UiResource, ports: SwiftDataEditorPorts): Promise<void> {
    const row = this.revokeTarget(), reason = this.revokeReason().trim();
    if (!row || reason.length < 5) return;
    try {
      if (row.status === "DRAFT") {
        await firstValueFrom(this.api.delete(resource.endpoint, row.id, { actor: row.maker, reason }));
      } else {
        await firstValueFrom(this.api.suppress(resource.endpoint, row.id, "maker.suppression", reason));
      }
      this.revokeTarget.set(null);
      this.revokeReason.set("");
      this.index.statusFilter.set(row.status === "DRAFT" ? "ACTIVE" : "DRAFT");
      this.index.page.set(1);
      await ports.refresh();
    } catch {
      await ports.refresh();
      ports.notify({
        kind: "error",
        text: "Suppression 建立失敗；狀態已重新檢查，可能已有進行中的工作。",
      });
    }
  }

  async upload(resource: UiResource, event: Event, dryRun: boolean, ports: SwiftDataEditorPorts): Promise<void> {
    const input = event.target as HTMLInputElement, file = input.files?.[0];
    if (!resource.importType || !file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const records = Array.isArray(parsed)
        ? parsed
        : (parsed as { records?: unknown[] }).records;
      if (!Array.isArray(records)) throw new Error("records array required");
      this.importResult.set(await firstValueFrom(this.api.import(
        resource.importType,
        file.name,
        dryRun,
        `portal-${resource.id}-${file.name}-${file.lastModified}-${dryRun}`,
        records,
      )));
      if (!dryRun) await ports.refresh();
      ports.notify({
        kind: "info",
        text: dryRun
          ? "檔案已完成 dry-run 驗證；未寫入資料。"
          : "檔案已導入為 DRAFT；不會自動啟用。",
      });
    } catch {
      ports.notify({
        kind: "error",
        text: "匯入失敗：必須是 OAS 定義的 JSON records，且通過逐列驗證。",
      });
    } finally {
      input.value = "";
    }
  }

  async rejectFromChecker(resource: UiResource, row: Row, checkerMode: boolean, ports: SwiftDataEditorPorts): Promise<void> {
    const reason = this.checkerRejectReason().trim();
    if (!checkerMode || reason.length < 5) return;
    ports.busy.set(true);
    try {
      await firstValueFrom(this.api.reject(resource.endpoint, row.id, "checker.demo", reason));
      ports.notify({
        kind: "info",
        text: `${resource.label} 已由 Checker Reject；原因已寫入稽核紀錄。`,
      });
      this.checkerRejectReason.set("");
      void ports.cancelWork();
      await ports.refresh();
    } catch {
      ports.notify({ kind: "error", text: "Reject 被生命週期／四眼控制拒絕。" });
    } finally {
      ports.busy.set(false);
    }
  }
}
