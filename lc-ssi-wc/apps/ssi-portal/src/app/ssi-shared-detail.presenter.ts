import { computed, inject, Injectable, signal } from "@angular/core";
import { FormGroup } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { requestTypeLabel as presentRequestTypeLabel } from "./governance-record-value";
import { ReferenceLookupApiService } from "./reference-lookup-api.service";
import { readonlyFormFields, ssiFormModel } from "./ssi-form-presentation";
import { buildSsiMakerFields } from "./ssi-maintenance-feature/ssi-maker-fields";
import type { SsiRow } from "./ssi-maintenance.types";

interface CurrencyReference {
  code: string;
  decimals: number;
  standard: string;
}

type Notice = {
  kind: "info" | "warning" | "error";
  text: string;
};

type CheckerDecision = (
  row: SsiRow,
  decision: "approve" | "reject",
  reason: string,
) => Promise<boolean>;

/** Presentation state for the one shared SSI read-only detail surface. */
@Injectable()
export class SsiSharedDetailPresenter {
  private readonly referenceApi = inject(ReferenceLookupApiService);
  private currencyConsumer:
    | ((options: readonly { code: string; decimals: number }[]) => void)
    | null = null;
  private decisionPort: CheckerDecision | null = null;
  private noticeSink: ((notice: Notice) => void) | null = null;

  readonly currenciesLoading = signal(false);
  readonly currencies = signal<readonly CurrencyReference[]>([]);
  readonly readonlyFields = computed(() =>
    readonlyFormFields(buildSsiMakerFields(this.currencies(), () => undefined)),
  );
  readonly target = signal<SsiRow | null>(null);
  readonly form = new FormGroup({});
  readonly model = computed<Record<string, unknown>>(() => {
    const row = this.target();
    return row ? this.modelForRow(row) : {};
  });
  readonly checkerRejectReason = signal("");

  setNoticeSink(sink: ((notice: Notice) => void) | null): void {
    this.noticeSink = sink;
  }

  setCurrencyConsumer(
    consumer:
      | ((options: readonly { code: string; decimals: number }[]) => void)
      | null,
  ): void {
    this.currencyConsumer = consumer;
    this.currencyConsumer?.(this.currencies());
  }

  acceptCurrencies(items: readonly CurrencyReference[]): void {
    this.currencies.set(items);
    this.currencyConsumer?.(items);
  }

  setDecisionPort(port: CheckerDecision | null): void {
    this.decisionPort = port;
  }

  async open(row: SsiRow): Promise<void> {
    if (this.currencies().length === 0 && !this.currenciesLoading())
      await this.loadCurrencies();
    this.form.reset(this.modelForRow(row));
    this.checkerRejectReason.set("");
    this.target.set(row);
  }

  /** Audit snapshots were already resolved by their owning route. */
  showSnapshot(row: SsiRow): void {
    this.target.set(row);
  }

  close(): void {
    this.target.set(null);
  }

  async decide(row: SsiRow, decision: "approve" | "reject"): Promise<void> {
    const reason = this.checkerRejectReason().trim();
    if (decision === "reject" && reason.length < 5) {
      this.noticeSink?.({
        kind: "warning",
        text: "Reject 必須輸入至少 5 個字元的退回原因。",
      });
      return;
    }
    try {
      if (!this.decisionPort) throw new Error("Checker route is not active");
      if (!(await this.decisionPort(row, decision, reason))) return;
      this.close();
      this.checkerRejectReason.set("");
      this.noticeSink?.({
        kind: "info",
        text:
          decision === "approve"
            ? "SSI 已由獨立 Checker 核准並啟用。"
            : "SSI 已退回 Maker 的 DRAFT 工作清單。",
      });
    } catch {
      this.noticeSink?.({
        kind: "error",
        text: `Checker ${decision === "approve" ? "Approve" : "Reject"} 被生命週期／四眼控制拒絕。`,
      });
    }
  }

  requestTypeLabel(row: SsiRow): "ADD" | "EDIT" | "SUPPRESSED" {
    return presentRequestTypeLabel(row);
  }

  displayStatus(status: string): string {
    return status === "PENDING_APPROVAL" ? "SUBMITTED" : status;
  }

  async loadCurrencies(): Promise<void> {
    this.currenciesLoading.set(true);
    try {
      const currencies = await firstValueFrom(
        this.referenceApi.currencies<CurrencyReference[]>(),
      );
      this.acceptCurrencies(currencies);
    } catch {
      this.noticeSink?.({
        kind: "warning",
        text: "Currency 參考服務暫時不可用。",
      });
    } finally {
      this.currenciesLoading.set(false);
    }
  }

  private modelForRow(row: SsiRow): Record<string, unknown> {
    const ownership =
      row.ownershipType ??
      (row.route["counterpartyBic"] === "ANY" ? "OWN" : "COUNTERPARTY");
    return ssiFormModel(row, ownership);
  }
}
