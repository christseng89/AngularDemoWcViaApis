import { computed, Injectable, inject, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import type { GovernanceTab } from "../app-view.models";
import { auditIndexColumns } from "../app-presentation";
import { governanceRecordValue } from "../governance-record-value";
import { assertMaintenanceServerPage } from "../maintenance-index-server-page";
import type {
  SsiIndexSummary,
  SsiPage,
  SsiRow,
} from "../ssi-maintenance.types";
import {
  CheckerApiService,
  type GovernedPendingRow,
} from "./checker-api.service";
import { CheckerSessionState } from "./checker-session-state";

const EMPTY_SUMMARY: SsiIndexSummary = {
  currentOwn: 0,
  pendingApproval: 0,
  active: 0,
  archived: 0,
};

@Injectable()
export class CheckerFacade {
  private readonly api = inject(CheckerApiService);
  private readonly session = inject(CheckerSessionState);
  private requestSequence = 0;
  readonly tab = this.session.tab;
  readonly sortPath = this.session.sortPath;
  readonly sortDirection = this.session.sortDirection;
  readonly currentPage = this.session.currentPage;
  readonly pageSize = 10;
  readonly rows = signal<readonly SsiRow[]>([]);
  readonly summary = signal<SsiIndexSummary>(EMPTY_SUMMARY);
  readonly governedPending = signal<readonly GovernedPendingRow[]>([]);
  readonly loading = signal(false);
  readonly warning = signal("");
  readonly pending = computed(() =>
    this.rows().filter((row) => row.status === "PENDING_APPROVAL"),
  );
  readonly count = computed(
    () => this.summary().pendingApproval + this.governedPending().length,
  );
  readonly indexColumns = computed(() => auditIndexColumns(this.tab()));
  readonly sortedRows = computed(() => {
    const path = this.sortPath();
    if (!path) return this.pending();
    const direction = this.sortDirection() === "asc" ? 1 : -1;
    return [...this.pending()].sort(
      (left, right) =>
        governanceRecordValue(left, path).localeCompare(
          governanceRecordValue(right, path),
          undefined,
          { numeric: true, sensitivity: "base" },
        ) * direction,
    );
  });
  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.sortedRows().length / this.pageSize)),
  );
  readonly indexRows = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.sortedRows()
      .slice(start, start + this.pageSize)
      .map((record) => ({
        id: record.id,
        record,
        cells: this.indexColumns().map((column) =>
          governanceRecordValue(record, column.path),
        ),
        trailing: [record.maker, record.updatedAt || record.createdAt || "—"],
        source: record,
      }));
  });

  async load(): Promise<void> {
    const sequence = ++this.requestSequence;
    this.loading.set(true);
    this.warning.set("");
    await Promise.all([this.loadSsi(sequence), this.loadGoverned(sequence)]);
    if (sequence === this.requestSequence) this.loading.set(false);
  }

  selectTab(tab: GovernanceTab): void {
    this.tab.set(tab);
    this.sortPath.set(null);
    this.currentPage.set(1);
  }

  sortIndex(path: string): void {
    if (this.sortPath() === path)
      this.sortDirection.update((direction) =>
        direction === "asc" ? "desc" : "asc",
      );
    else {
      this.sortPath.set(path);
      this.sortDirection.set("asc");
    }
    this.currentPage.set(1);
  }

  movePage(delta: number): void {
    this.currentPage.update((page) =>
      Math.min(this.totalPages(), Math.max(1, page + delta)),
    );
  }

  async decide(
    row: SsiRow,
    decision: "approve" | "reject",
    reason: string,
  ): Promise<boolean> {
    if (decision === "reject" && reason.trim().length < 5) return false;
    await firstValueFrom(this.api.decideSsi(row.id, decision, reason.trim()));
    await this.load();
    return true;
  }

  private async loadSsi(sequence: number): Promise<void> {
    try {
      const [response, summary] = await Promise.all([
        firstValueFrom(this.api.pendingSsi()),
        firstValueFrom(this.api.summary()),
      ]);
      const page: SsiPage = Array.isArray(response)
        ? {
            items: response,
            page: 1,
            pageSize: response.length || 10,
            totalItems: response.length,
            totalPages: 1,
            hasPrevious: false,
            hasNext: false,
            distinctCurrencyCount: new Set(
              response.map((row) => row.route["currency"]).filter(Boolean),
            ).size,
          }
        : (response as SsiPage);
      assertMaintenanceServerPage(page.items, "PENDING_APPROVAL");
      if (sequence !== this.requestSequence) return;
      this.rows.set(page.items);
      this.summary.set(summary);
    } catch {
      if (sequence !== this.requestSequence) return;
      this.rows.set([]);
      this.warning.set("BFF 尚未啟動；啟動後重新整理即可。");
    }
  }

  private async loadGoverned(sequence: number): Promise<void> {
    try {
      const contract = await firstValueFrom(this.api.governedContract());
      const resources = contract["x-ui-resources"].filter(
        (resource) =>
          resource.id !== "ssi" && resource["x-lifecycle"].includes("approve"),
      );
      const results = await Promise.all(
        resources.map(async (resource) => ({
          resource,
          rows: await firstValueFrom(
            this.api.governedPending(resource.endpoint),
          ),
        })),
      );
      if (sequence !== this.requestSequence) return;
      this.governedPending.set(
        results.flatMap(({ resource, rows }) =>
          rows
            .filter(({ status }) => status === "PENDING_APPROVAL")
            .map((row) => ({
              ...row,
              resourceId: resource.id,
              resourceLabel: resource.label,
              endpoint: resource.endpoint,
            })),
        ),
      );
    } catch {
      if (sequence !== this.requestSequence) return;
      this.governedPending.set([]);
      this.warning.set("Checker Queue 暫時無法載入全部受控資料資源。");
    }
  }
}
