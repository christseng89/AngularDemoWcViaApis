import { computed, Injectable, inject, signal } from "@angular/core";
import type { FormlyFieldConfig } from "@ngx-formly/core";
import { firstValueFrom } from "rxjs";
import type { GovernanceTab } from "../app-view.models";
import { auditIndexColumns } from "../app-presentation";
import {
  auditGovernedSnapshot,
  auditPage,
  auditSsiSnapshot,
  presentAuditEvent,
  sortAuditRows,
  type AuditPresentation,
  type AuditRow,
  type AuditSortDirection,
  type AuditSortKey,
  type AuditSsiSnapshot,
} from "../audit-presentation";
import { presentOperationalIssue } from "../operational-issue";
import { governanceRecordValue } from "../governance-record-value";
import { scalarText } from "../scalar-text";
import { AuditApiService, type AuditParameterField } from "./audit-api.service";

export interface AuditMessageTypeChanges {
  readonly unchanged: readonly string[];
  readonly added: readonly string[];
  readonly suppressed: readonly string[];
}

@Injectable()
export class AuditFacade {
  private readonly api = inject(AuditApiService);
  readonly tab = signal<GovernanceTab>("rma");
  readonly rows = signal<readonly AuditRow[]>([]);
  readonly detail = signal<AuditPresentation | null>(null);
  readonly parameterFields = signal<readonly AuditParameterField[]>([]);
  readonly currencyOptions = signal<
    readonly { code: string; decimals: number }[]
  >([]);
  readonly resourceLabel = computed(() => {
    const labels: Record<GovernanceTab, string> = {
      rma: "RMA",
      entity: "Entities",
      nostro: "Nostro",
      ssi: "SSI",
    };
    return labels[this.tab()];
  });
  readonly onlineQueryDays = signal(7);
  readonly archiveAfterDays = signal(14);
  readonly archiveRetentionDays = signal(365);
  readonly scheduleIntervalHours = signal(12);
  readonly loading = signal(false);
  readonly error = signal("");
  readonly issue = computed(() =>
    this.error() ? presentOperationalIssue(this.error()) : null,
  );
  readonly sortKey = signal<AuditSortKey>("title");
  readonly sortDirection = signal<AuditSortDirection>("asc");
  readonly indexSortPath = signal<string | null>(null);
  readonly currentPage = signal(1);
  readonly pageSize = 10;
  readonly detailRecord = computed<Readonly<Record<string, unknown>>>(() => {
    const detail = this.detail();
    return detail ? (this.object(auditGovernedSnapshot(detail)) ?? {}) : {};
  });
  readonly detailStatus = computed(() =>
    scalarText(this.detailRecord()["status"]),
  );
  readonly detailVersion = computed(() =>
    Number(this.detailRecord()["version"] ?? 0),
  );
  readonly detailModel = computed<Record<string, unknown>>(() => {
    const record = this.detailRecord();
    return {
      ...record,
      ...(Array.isArray(record["messageTypes"])
        ? { messageTypes: record["messageTypes"].join(", ") }
        : {}),
    };
  });
  readonly detailFields = computed<FormlyFieldConfig[]>(() =>
    this.parameterFields().map((field) => ({
      key: field.key,
      type: field.type,
      props: this.fieldProps(field),
    })),
  );
  readonly sortedRows = computed(() => {
    const rows = sortAuditRows(
      this.rows(),
      this.sortKey(),
      this.sortDirection(),
    ).map(presentAuditEvent);
    const path = this.indexSortPath();
    if (!path) return rows;
    const direction = this.sortDirection() === "asc" ? 1 : -1;
    return [...rows].sort(
      (left, right) =>
        governanceRecordValue(this.record(left), path).localeCompare(
          governanceRecordValue(this.record(right), path),
          undefined,
          { numeric: true, sensitivity: "base" },
        ) * direction,
    );
  });
  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.sortedRows().length / this.pageSize)),
  );
  readonly pagedRows = computed(() =>
    auditPage(this.sortedRows(), this.currentPage(), this.pageSize),
  );
  readonly indexColumns = computed(() => auditIndexColumns(this.tab()));
  readonly indexRows = computed(() =>
    this.pagedRows().map((event) => {
      const record = this.record(event);
      return {
        id: event.eventId,
        cells: this.indexColumns().map((column) =>
          governanceRecordValue(record, column.path),
        ),
        trailing: [
          scalarText(record["maker"]),
          scalarText(record["createdAt"] ?? record["updatedAt"]),
          scalarText(record["checker"]),
          record["checker"] ? event.occurredAt : "",
        ],
        source: event,
      };
    }),
  );

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set("");
    try {
      const [rows, lifecycle, contract] = await Promise.all([
        firstValueFrom(this.api.events(this.tab())),
        firstValueFrom(this.api.lifecycle()),
        firstValueFrom(this.api.contract()),
      ]);
      this.rows.set(rows);
      this.parameterFields.set(
        contract["x-ui-resources"].find(
          (resource) => resource.id === this.tab(),
        )?.fields ?? [],
      );
      this.onlineQueryDays.set(lifecycle.onlineQueryDays);
      this.archiveAfterDays.set(lifecycle.archiveAfterDays);
      this.archiveRetentionDays.set(lifecycle.archiveRetentionDays);
      this.scheduleIntervalHours.set(lifecycle.scheduleIntervalHours);
      this.currentPage.set(1);
    } catch {
      this.error.set("AUDIT_SERVICE_UNAVAILABLE");
    } finally {
      this.loading.set(false);
    }
  }

  async selectTab(tab: GovernanceTab): Promise<void> {
    this.detail.set(null);
    this.tab.set(tab);
    this.indexSortPath.set(null);
    await this.load();
  }

  sortBy(key: AuditSortKey): void {
    if (this.sortKey() === key)
      this.sortDirection.update((direction) =>
        direction === "asc" ? "desc" : "asc",
      );
    else {
      this.sortKey.set(key);
      this.sortDirection.set("asc");
    }
    this.currentPage.set(1);
  }

  ariaSort(key: AuditSortKey): "ascending" | "descending" | "none" {
    if (this.sortKey() !== key) return "none";
    return this.sortDirection() === "asc" ? "ascending" : "descending";
  }

  movePage(delta: number): void {
    this.currentPage.set(
      Math.min(this.totalPages(), Math.max(1, this.currentPage() + delta)),
    );
  }

  sortIndex(path: string): void {
    if (this.indexSortPath() === path)
      this.sortDirection.update((direction) =>
        direction === "asc" ? "desc" : "asc",
      );
    else {
      this.indexSortPath.set(path);
      this.sortDirection.set("asc");
    }
    this.currentPage.set(1);
  }

  openDetail(detail: AuditPresentation): AuditSsiSnapshot | null {
    if (this.tab() === "ssi") {
      const snapshot = auditSsiSnapshot(detail);
      if (snapshot) return snapshot;
    }
    this.detail.set(detail);
    return null;
  }

  snapshot(detail: AuditPresentation): unknown {
    return auditGovernedSnapshot(detail);
  }

  messageTypeChanges(
    detail: AuditPresentation,
  ): AuditMessageTypeChanges | null {
    const changedFields = this.object(detail.changedFields);
    const messageTypes = this.object(changedFields?.["messageTypes"]);
    if (!messageTypes) return null;
    const values = (key: string): readonly string[] =>
      Array.isArray(messageTypes[key])
        ? messageTypes[key].filter(
            (value): value is string => typeof value === "string",
          )
        : [];
    return {
      unchanged: values("unchanged"),
      added: values("added"),
      suppressed: values("suppressed"),
    };
  }

  private record(event: AuditPresentation): Readonly<Record<string, unknown>> {
    return this.object(auditGovernedSnapshot(event)) ?? {};
  }

  private object(value: unknown): Readonly<Record<string, unknown>> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Readonly<Record<string, unknown>>)
      : null;
  }

  private fieldProps(
    field: AuditParameterField,
  ): NonNullable<FormlyFieldConfig["props"]> {
    const props: NonNullable<FormlyFieldConfig["props"]> = {
      label: field.label,
      required: Boolean(field.required),
      showPicker: false,
      options:
        field.optionsSource === "reference/currencies"
          ? this.currencyOptions().map(({ code, decimals }) => ({
              label: `${code} · ${decimals} decimals`,
              value: code,
            }))
          : (field.options ?? []).map((value) => ({ label: value, value })),
    };
    const description =
      field.type === "multicheckbox"
        ? "受控 Message Types；按 View Message Types 查看完整選擇。"
        : field.description;
    const optionalProps: Array<
      [keyof NonNullable<FormlyFieldConfig["props"]>, unknown]
    > = [
      ["type", field.inputType],
      ["description", description],
      ["pattern", field.pattern],
      ["minLength", field.minLength],
      ["maxLength", field.maxLength],
      ["min", field.minimum],
      ["max", field.maximum],
    ];
    for (const [key, value] of optionalProps)
      if (value !== undefined) props[key] = value as never;
    return props;
  }
}
