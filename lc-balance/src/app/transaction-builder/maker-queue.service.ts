import { Injectable } from '@angular/core';
import { BalanceComponentApiService, BalanceContract, BalanceMovement } from './balance-component-api.service';
import { TransactionFunction } from './balance-component.model';
import { resolveFunctionForMovement } from './function-strategy';
import { describeApiError } from './api-error';
import { PagedListState } from './paged-list-state';

/** One row of the Maker Queue — pairs a movement with its own contract, same shape the API returns. */
export interface MakerQueueRow {
  movement: BalanceMovement;
  contract: BalanceContract;
}

/**
 * Fix Pending/Delete Pending Phase 2 (analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md
 * §2.1) — the Maker's own "My Pending/My Rejected" worklist, mirroring `CheckerPanelComponent`'s own
 * search+queue role but for the Maker side: without this, a Checker Reject only stays actionable within
 * the same browser session's own Maker Result panel (`submitResult`) — this service lets the Maker find
 * it again independent of that in-memory state.
 *
 * Server-side paginated (`GET /balance-movements?createdBy=&status=`, `BalanceComponentApiService.
 * listMyMovements()`), same convention as `InquireEventsService.loadIndex()`.
 *
 * `@Injectable()`, no `providedIn` — per-component-instance mutable state, not a singleton; same
 * reasoning as `LookUpPanelService`/`InquireEventsService`.
 */
@Injectable()
export class MakerQueueService {
  constructor(private readonly api: BalanceComponentApiService) {}

  /** No real auth in this demo app (same posture as every other hardcoded 'maker1'/'checker1' actor literal throughout this sub-project) — a plain overridable text field, not a login. */
  createdBy = 'maker1';
  items: MakerQueueRow[] = [];
  loading = false;
  error: string | null = null;
  readonly paging = new PagedListState(10);

  load(page: number = 1): void {
    if (!this.createdBy) return;
    this.loading = true;
    this.error = null;
    this.api.listMyMovements({ createdBy: this.createdBy, statuses: ['PENDING', 'REJECTED'], page, pageSize: this.paging.pageSize }).subscribe({
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
    if (target) this.load(target);
  }

  nextPage(): void {
    const target = this.paging.nextTarget();
    if (target) this.load(target);
  }

  functionFor(row: MakerQueueRow): TransactionFunction | undefined {
    return resolveFunctionForMovement(row.contract.instrumentType, row.movement.movementType);
  }

  /**
   * A3S/B4/B5 compound submissions — excluded from Delete Pending here (proposal §2.5): the cascade
   * cleanup `deleteMakerPending()` (checker-actions.service.ts) needs relies on same-session-only
   * compound-leg movementIds (`arrivalSgRedeemMovementId` etc.) this cross-session queue has no way to
   * reconstruct without a new `resolveLinkedMovementId()`-style lookup — deferred to Phase 4.
   *
   * Deliberately keyed off `movement.businessEventId` presence, NOT `resolveFunctionForMovement()`'s own
   * Strategy lookup — that resolution is ambiguous by its own documented design for exactly this shape
   * (IPLC_LC/UTILIZE matches both A3 and A3S, first-registry-match always wins, i.e. always resolves to
   * plain A3 here). Every compound submission (`maker-submit.service.ts`'s own
   * submitDocumentArrivalWithSg/submitConfirmationHonourWithReceivable/
   * submitConfirmationAcceptWithReceivable/submitAcceptanceSettleWithReceivable) stamps a fresh
   * `businessEventId` on every leg it creates; `submitPlain()` (every single-leg function) never sets it
   * at all — a direct, unambiguous signal already used the same way by `checker-actions.service.ts`'s
   * own compound-release routing.
   */
  isCompoundShape(row: MakerQueueRow): boolean {
    return !!row.movement.businessEventId;
  }

  /** Single-leg functions only (see isCompoundShape()) — calls /cancel directly, same MAKER_EC reason the same-session Delete Pending button already uses, but without checker-actions.service.ts's own cascade machinery (nothing to cascade for a single-leg movement). */
  deletePending(row: MakerQueueRow): void {
    this.error = null;
    this.api.cancel(row.movement.movementId, this.createdBy, 'MAKER_EC').subscribe({
      next: () => this.load(this.paging.page),
      error: (err) => {
        this.error = describeApiError(err);
      },
    });
  }
}
