import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { forkJoin } from 'rxjs';
import { BalanceComponentApiService, BalanceContract, DeletePendingAuditRow } from './balance-component-api.service';
import { NATURAL_KEY_FIELDS_BY_INSTRUMENT, TransactionFunction } from './balance-component.model';
import { BuilderFieldsContext, buildFields, reconstructOriginalModel, toReadOnlyFields } from './builder-fields';
import { resolveFunctionForMovement } from './function-strategy';
import { BuilderModel } from './function-policy';
import { describeApiError } from './api-error';
import { PagedListState } from './paged-list-state';
import { LcCatalogIndexService } from './lc-catalog-index.service';
import { LcIndexRow, computeLcIndexRow } from './inquire-events.service';
import { ProtectedIdentityItem } from './protected-transaction-identity.policy';

/**
 * Merged Secondary Reference for one Delete Pending audit row — a NEW, more complete function than
 * InquireEventsService's own `secondaryReferenceForEvent()` (§11.2(b), business-confirmed 2026-08-27:
 * "用第一個方案"). That existing function only covers SHGT/EPLC_EXAMINATION and returns '—' for every
 * other instrumentType; this one covers the full picture Inquire Delete Pending needs to span A1–A11/
 * B1–B7: any instrumentType with a genuine secondary NATURAL KEY (per the same
 * NATURAL_KEY_FIELDS_BY_INSTRUMENT table `assertNaturalKeyFieldsRequired()` uses server-side — SHGT/
 * IPLC_ACCEPTANCE/EPLC_ACCEPTANCE/EPLC_EXAMINATION/the 3 asset-side instrumentTypes) shows that natural
 * key; everything else (IPLC_LC/EPLC_LC/EPLC_CONFIRMATION — Amendment No./IB Number/EB Number-labeled
 * fields, which ride sourceTransactionRef, not a natural key column) shows the audit row's own
 * sourceTransactionRef instead — already captured on delete_pending_audit itself, no join needed.
 */
export function secondaryReferenceForDeleteAudit(row: DeletePendingAuditRow): string {
  const keys = NATURAL_KEY_FIELDS_BY_INSTRUMENT[row.instrumentType];
  if (keys.includes('sgNumber')) return row.sgNumber ? `SG ${row.sgNumber}` : '—';
  if (keys.includes('ibNumber')) return row.ibNumber ?? '—';
  return row.sourceTransactionRef ?? '—';
}

/** The read-only "as it was when deleted" Original Transaction Screen state for one View click. */
export interface DeleteAuditView {
  row: DeletePendingAuditRow;
  function: TransactionFunction | null;
  fields: FormlyFieldConfig[];
  form: FormGroup;
  model: BuilderModel;
  identityItems: readonly ProtectedIdentityItem[];
}

/**
 * Inquire Delete Pending (analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md §11, BA &
 * business-directed 2026-08-27) — a dedicated, independent audit query over delete_pending_audit,
 * deliberately never merged with Inquire Events ("只查所有曾經發生過的 Delete Pending 操作，不混入
 * Resubmit/Fix/Approve/Reject"). Function is deliberately a CLIENT-side filter over the fetched page
 * (§11.2(c), business-confirmed) — Function has no column of its own, it's a display concept derived from
 * instrumentType+movementType (`resolveFunctionForMovement()`, same as Inquire Events/Maker Queue).
 *
 * UI/inquiry flow (business-directed 2026-08-27, "應與 INQUIRE EVENTS 保持一致，採用 Import/Export → LC
 * Catalog → Deleted Pending Events 的分層查詢方式", then "只有被 DELETE PENDING 過的才顯示") — the LC
 * Catalog step itself is delegated to `LcCatalogIndexService` (SOLID/DRY — extracted rather than
 * re-hand-rolling `InquireEventsService.loadIndex()`'s own side/search/paging shape a second time; see
 * that class's own doc comment for why `InquireEventsService` itself isn't ALSO migrated onto it in this
 * pass). `catalogIndex` is constructed with a CUSTOM `fetchPage` —
 * `BalanceComponentApiService.catalogWithDeletePendingHistory()`, not the general `catalog()` browse —
 * so only LC Numbers with at least one `delete_pending_audit` record ever appear here (deliberately the
 * OPPOSITE of `InquireEventsService.loadIndex()`'s own catalog, which now excludes exactly a CANCELLED
 * contract that's the kind of record this screen exists to surface); `decorate` reuses
 * `computeLcIndexRow()` (shared with `InquireEventsService`) for the Tenor Type/Currency/Last Event Date
 * columns, business-directed to match Inquire Events' own catalog columns minus Available Balance/Status
 * (this screen has no live-balance concern) — but with `amountSource: 'input'` (2026-08-29, "比較USER
 * FRIENDLY"), since "LC Amount" here means the typed amount of a since-cancelled transaction, not a
 * confirmed/RELEASED figure (which would always read `"0"` for exactly the rows this screen surfaces —
 * see `computeLcIndexRow()`'s own doc comment). `selectLcFromIndex()` scopes `search()` to
 * exactly that LC and switches `indexView` to `'AUDIT'`; `backToIndex()` returns.
 *
 * `@Injectable()`, no `providedIn` — per-component-instance mutable state, same convention as
 * `MakerQueueService`/`InquireEventsService`/`LookUpPanelService`.
 */
@Injectable()
export class InquireDeletePendingService {
  constructor(private readonly api: BalanceComponentApiService) {
    this.catalogIndex = new LcCatalogIndexService<LcIndexRow>(
      api,
      (contracts, side) => forkJoin(contracts.map((contract) => computeLcIndexRow(api, contract, side, 'input'))),
      false,
      (side, search, page, pageSize) => api.catalogWithDeletePendingHistory(side === 'IMPORT' ? 'IPLC_LC' : 'EPLC_CONFIRMATION', search, page, pageSize),
    );
  }

  /** The Import/Export → LC Catalog step (side/search/rows/paging) — see this class's own doc comment. */
  readonly catalogIndex: LcCatalogIndexService<LcIndexRow>;
  /** 'INDEX' = browsing the LC Catalog; 'AUDIT' = drilled into one LC's own Delete Pending records. */
  indexView: 'INDEX' | 'AUDIT' = 'INDEX';
  selectedContract: BalanceContract | null = null;

  /** Set only via selectLcFromIndex() — the audit query is always scoped to exactly one selected LC, never free-typed. */
  lcNumber = '';
  deletedBy = '';
  from = '';
  to = '';
  /** Client-side-only filter over the current page's own items — see this class's own doc comment for why. Empty string = no filter. */
  functionFilter = '';

  items: DeletePendingAuditRow[] = [];
  loading = false;
  error: string | null = null;
  readonly paging = new PagedListState(10);

  viewing: DeleteAuditView | null = null;
  viewError: string | null = null;

  get filteredItems(): DeletePendingAuditRow[] {
    if (!this.functionFilter) return this.items;
    return this.items.filter((row) => this.functionFor(row)?.code === this.functionFilter);
  }

  loadIndex(page?: number): void {
    this.catalogIndex.load(page);
  }

  selectLcFromIndex(contract: BalanceContract): void {
    this.selectedContract = contract;
    this.indexView = 'AUDIT';
    this.lcNumber = contract.naturalKey.lcNumber;
    this.deletedBy = '';
    this.from = '';
    this.to = '';
    this.functionFilter = '';
    this.search(1);
  }

  backToIndex(): void {
    this.indexView = 'INDEX';
    this.selectedContract = null;
    this.items = [];
    this.paging.reset();
    this.viewing = null;
    this.viewError = null;
  }

  search(page: number = 1): void {
    this.loading = true;
    this.error = null;
    this.viewing = null;
    this.viewError = null;
    this.api
      .listDeletePendingAudit({
        lcNumber: this.lcNumber || undefined,
        deletedBy: this.deletedBy || undefined,
        from: this.from || undefined,
        to: this.to || undefined,
        page,
        pageSize: this.paging.pageSize,
      })
      .subscribe({
        next: (result) => {
          this.loading = false;
          this.items = result.items;
          this.paging.total = result.total;
          this.paging.page = result.page;
        },
        error: (err) => {
          this.loading = false;
          this.error = describeApiError(err);
          this.items = [];
          this.paging.total = 0;
        },
      });
  }

  prevPage(): void {
    const target = this.paging.prevTarget();
    if (target) this.search(target);
  }

  nextPage(): void {
    const target = this.paging.nextTarget();
    if (target) this.search(target);
  }

  functionFor(row: DeletePendingAuditRow): TransactionFunction | undefined {
    return resolveFunctionForMovement(row.instrumentType, row.movementType);
  }

  secondaryReferenceFor(row: DeletePendingAuditRow): string {
    return secondaryReferenceForDeleteAudit(row);
  }

  /**
   * BA requirement (§11 of the proposal doc, "開啟該次被刪除時的原始交易畫面，以 Read-only 顯示當時的
   * 輸入資料，以及 Delete Pending 的 audit information") — reuses the exact same
   * reconstructOriginalModel()/buildFields()/toReadOnlyFields() machinery InquireEventsService's own
   * `selectEvent()` uses for its Original Transaction Screen, deliberately WITHOUT that method's own
   * Balance Snapshot tabs (LC/Acceptance/SG) — Inquire Delete Pending's own ask is narrower: the frozen
   * input data plus the audit record itself (already on `row`, rendered by the component template), not
   * a live/point-in-time balance view. A CANCELLED movement's own field values are frozen forever from
   * the moment of creation (CANCELLED is terminal, statusTransition.ts — nothing ever mutates them
   * afterward), so this is a byte-for-byte faithful "what was actually submitted" reconstruction.
   */
  view(row: DeletePendingAuditRow): void {
    this.viewing = null;
    this.viewError = null;
    forkJoin({
      contract: this.api.getContract(row.balanceContractId),
      movements: this.api.listMovements(row.balanceContractId),
    }).subscribe({
      next: ({ contract, movements }) => {
        const movement = movements.find((m) => m.movementId === row.movementId);
        if (!movement) {
          this.viewError = `Movement ${row.movementId} not found under contract ${row.balanceContractId}.`;
          return;
        }
        const fn = resolveFunctionForMovement(contract.instrumentType, movement.movementType) ?? null;
        const model = reconstructOriginalModel(movement, contract);
        const ctx: BuilderFieldsContext = {
          model,
          selectedFunction: fn,
          selectedPayMovement: null,
          selectedContract: contract,
          selectedContractSnapshot: null,
          selectedParent: null,
          dynamicSecondaryRefLabel: fn?.secondaryRefLabel ?? (movement.sourceTransactionRef ? 'Reference No.' : null),
          readOnlyReconstruction: true,
        };
        this.viewing = {
          row,
          function: fn,
          fields: toReadOnlyFields(buildFields(ctx)),
          form: new FormGroup({}),
          model,
          identityItems: [{ label: 'LC Number', value: contract.naturalKey.lcNumber }],
        };
      },
      error: (err) => {
        this.viewError = describeApiError(err);
      },
    });
  }

  closeView(): void {
    this.viewing = null;
    this.viewError = null;
  }
}
