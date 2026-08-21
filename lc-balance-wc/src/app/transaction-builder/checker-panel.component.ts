import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BalanceComponentApiService, BalanceContract, BalanceMovement } from './balance-component-api.service';
import { IndexPickerComponent } from './index-picker.component';
import { TbIconComponent } from '../tb-icon.component';
import {
  TransactionFunction,
  displayMovementType as displayMovementTypeRule,
  displayMovementAmount as displayMovementAmountRule,
} from './balance-component.model';
import { describeApiError as describeApiErrorShared } from './api-error';
import * as policy from './function-policy';
import { deriveFunctionStrategy, movementTypeMatchesFunction } from './function-strategy';

/**
 * A pending sync request for the Checker's own independent search — see `ngOnChanges()`'s own doc
 * comment for why a plain `@Input()` string pair isn't enough on its own.
 */
export interface CheckerSyncSignal {
  lcNumber: string;
  secondaryRef: string | null;
}

/**
 * Owns the Checker's own independent search box + PENDING-movement queue picker. Deliberately does NOT
 * own the Release/Reject/Approve action buttons or their busy/error/compound-routing state (those stay
 * on `TransactionBuilderComponent`) — the action layer reads deep Maker-side context already funneled
 * through `CheckerActionContext`/`CheckerActionOutcome`, and a successful release resets the whole Maker
 * screen, both fundamentally Maker-side concerns extracting here would only relocate, not remove.
 */
@Component({
  selector: 'app-checker-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, IndexPickerComponent, TbIconComponent],
  templateUrl: './checker-panel.component.html',
  styleUrl: './checker-panel.component.scss',
})
export class CheckerPanelComponent implements OnChanges {
  /** Drives `resolveContract`'s instrumentType and the checkerSecondaryField/Label getters below. */
  @Input() selectedFunction: TransactionFunction | null = null;
  /**
   * The Maker-side "current LC" sync trigger. A plain `@Input()` isn't enough on its own: `ngOnChanges()`
   * only fires on reference change, but the parent must re-search even when the LC Number is unchanged
   * (e.g. re-syncing the queue after finalizing a movement on the same LC) — so the parent always
   * constructs a fresh object literal per trigger; the object itself is the signal, not its contents.
   */
  @Input() syncSignal: CheckerSyncSignal | null = null;
  /**
   * Per-function reset trigger. A counter, not a boolean — two resets in a row (e.g. A2 -> A9 -> A2)
   * must each independently fire `resetPanel()`, which a toggling boolean could miss.
   */
  @Input() resetTrigger: number | null = null;
  /**
   * Restored 2026-08-20 ("A3 A3S 交易 Approve 過後 不要再顯示") — reloads the queue IN PLACE (keeps the
   * current search/contract, unlike resetTrigger) after a successful Checker acknowledgment, so an
   * already-approved A3/A3S item stops reappearing. A counter, same reasoning as resetTrigger above.
   */
  @Input() queueRefreshTrigger: number | null = null;

  /**
   * Fires whenever the picked PENDING movement changes — a real click, or an implicit clear at the top
   * of a fresh search/queue-reload. The parent keeps its own mirror (used by checkerAct()/release()/
   * reject()); only what writes it changed.
   */
  @Output() movementPicked = new EventEmitter<BalanceMovement | null>();
  /** Fires at the top of every `loadCheckerQueue()` run — parent clears its own stale Release/Reject error. */
  @Output() queueReloaded = new EventEmitter<void>();
  /** Fires once `listMovements` succeeds — parent calls its own `onCheckerQueueLoadSucceeded()`. */
  @Output() queueLoadSucceeded = new EventEmitter<void>();

  checkerLcNumber = '';
  checkerSecondaryRef = '';
  checkerContract: BalanceContract | null = null;
  checkerSearching = false;
  checkerSearchError: string | null = null;
  checkerItems: BalanceMovement[] = [];
  checkerLoading = false;
  /** This panel's own copy, for `app-index-picker`'s `[selectedId]` highlighting. */
  selectedCheckerMovement: BalanceMovement | null = null;

  constructor(private readonly api: BalanceComponentApiService) {}

  /** Both `@Input()`s are signals, not passive template values — `ngOnChanges()` converts each into an imperative call. Testable via a plain method call, no TestBed needed. */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['resetTrigger'] && !changes['resetTrigger'].firstChange) this.resetPanel();
    if (changes['syncSignal'] && this.syncSignal) this.syncFromContext(this.syncSignal.lcNumber, this.syncSignal.secondaryRef);
    if (changes['queueRefreshTrigger'] && !changes['queueRefreshTrigger'].firstChange && this.checkerContractId) this.loadCheckerQueue();
  }

  get checkerContractId(): string | null {
    return this.checkerContract?.balanceContractId ?? null;
  }

  /** Delegates to the shared display-rule in `balance-component.model.ts`; `checkerContract` supplies instrumentType since every queue row belongs to the one resolved contract. */
  displayMovementType(movementType: string | null | undefined, amount: string | null | undefined): string {
    return displayMovementTypeRule(this.checkerContract?.instrumentType, movementType, amount);
  }

  displayMovementAmount(movementType: string | null | undefined, amount: string | null | undefined): string {
    return displayMovementAmountRule(this.checkerContract?.instrumentType, movementType, amount);
  }

  get checkerSecondaryField(): 'ibNumber' | 'sgNumber' | null {
    return policy.checkerSecondaryField(this.selectedFunction);
  }

  get checkerSecondaryLabel(): string {
    return policy.checkerSecondaryLabel(this.selectedFunction);
  }

  /** `checkerLcNumber` is deliberately NOT cleared — a Checker switching functions likely wants to keep checking the same LC; only the resolved contract (tied to the OLD function's instrumentType) needs clearing. */
  private resetPanel(): void {
    this.checkerContract = null;
    this.checkerSearchError = null;
    this.checkerItems = [];
    this.selectedCheckerMovement = null;
  }

  /** Convenience auto-fill for the Checker's own independent search — pre-fills from the Maker's current LC and re-searches; the field stays fully usable on its own regardless, this is a default not a binding. */
  syncFromContext(lcNumber: string | null, secondaryRef: string | null): void {
    if (!lcNumber) return;
    this.checkerLcNumber = lcNumber;
    this.checkerSecondaryRef = secondaryRef ?? '';
    this.searchCheckerLc();
  }

  /**
   * Resolves via this function's own `instrumentType`, so a Checker can search/act on a PENDING item
   * without touching the Maker's own selection flow. The secondary field (IB/SG Number) is mandatory
   * whenever `checkerSecondaryField` is set — SHGT/Acceptance contracts are keyed by LC + SG/IB Number,
   * and one LC can have multiple.
   */
  searchCheckerLc(): void {
    this.checkerSearchError = null;
    this.checkerContract = null;
    this.checkerItems = [];
    this.selectedCheckerMovement = null;
    this.movementPicked.emit(null);
    if (!this.selectedFunction) return;
    if (!this.checkerLcNumber) {
      this.checkerSearchError = 'Type an LC Number to search.';
      return;
    }
    const secondaryField = this.checkerSecondaryField;
    if (secondaryField && !this.checkerSecondaryRef) {
      this.checkerSearchError = `Type a ${this.checkerSecondaryLabel} to search — this LC may have multiple ${this.checkerSecondaryLabel} records, and LC Number alone doesn't identify which one.`;
      return;
    }
    this.checkerSearching = true;
    const naturalKey = {
      lcNumber: this.checkerLcNumber,
      ibNumber: secondaryField === 'ibNumber' ? this.checkerSecondaryRef : null,
      sgNumber: secondaryField === 'sgNumber' ? this.checkerSecondaryRef : null,
    };
    this.api.resolveContract(this.selectedFunction.instrumentType, naturalKey).subscribe({
      next: (contract) => {
        this.checkerSearching = false;
        this.checkerContract = contract;
        this.loadCheckerQueue();
      },
      error: (err) => {
        this.checkerSearching = false;
        this.checkerSearchError = describeApiErrorShared(err);
      },
    });
  }

  /**
   * Every still-actionable PENDING movement on `checkerContractId`. Re-run after anything that could
   * change what's PENDING on this contract (a Maker Submit, or a Checker Release/Reject/acknowledge from
   * this same queue). Two opposite, function-scoped filters share the same EARMARKING(PENDING+no
   * acknowledgedAt)/EARMARKED(PENDING+acknowledgedAt) split (business instruction 2026-08-20):
   *
   * - A3/A3S (deferSettlement) — excludes an already-`acknowledgedAt` UTILIZE ("A3 A3S 交易 Approve 過後
   *   不要再顯示"): once A3's own Checker has acknowledged it, re-offering it on the A3/A3S screen is
   *   pointless (A4/A6 finalizes it for real later, on THEIR OWN screen).
   * - A4 (`releasesExistingMovementInPlace`) — the OPPOSITE: excludes a still-EARMARKING UTILIZE with no
   *   `acknowledgedAt` yet ("Import A4 Checker Search 也要濾掉EARMARKING的交易") — A4's own Checker has
   *   nothing legitimate to Release until A3's own Checker has confirmed it first (genuine 4-eyes: a
   *   still-EARMARKING item must not appear as actionable in the NEXT transaction). ALSO excludes an
   *   EARMARKED UTILIZE that A4's own Maker hasn't Submitted yet (`!m.makerSubmittedAt` — business
   *   instruction "A4 需要 SUBMIT 後 才能 APPROVE"): `release()` already 409s server-side for this case
   *   (BAL-123), but the item must not even be selectable/approvable in the Checker Queue before then —
   *   same reasoning as the picker-side `!m.makerSubmittedAt` exclusion in `document-arrival-hints.
   *   service.ts`/`picker-selection.service.ts` (that one stops the SAME item being re-Submitted twice;
   *   this one stops it being Approved before being Submitted even once).
   *
   * Every other function is unaffected by the EARMARKING/EARMARKED split (plain `status === 'PENDING'`)
   * — A6/B4 etc. search a different instrumentType/movementType entirely (the new Acceptance/asset
   * record, not the source UTILIZE).
   *
   * Business instruction 2026-08-20 ("各功能 RELEASE 自己產生的 PENDING 或 EARMARKING 交易" — "A2 不該看到
   * UTILIZED 交易"): several instrumentTypes are shared by more than one function (IPLC_LC: A1/A2/A3/
   * A3S/A4; IPLC_ACCEPTANCE: A6/A7; SHGT: A8/A9; EPLC_CONFIRMATION: B1/B2/B4) — without a per-function
   * movementType filter, e.g. A2's own Checker Queue would also show an unrelated A3 UTILIZE sitting
   * PENDING on the same LC. `movementTypeMatchesFunction()` (`function-strategy.ts`, already used by
   * Inquire Events to answer the same "could this function have produced this movement" question) scopes
   * every function's own queue to movements it could genuinely have produced.
   */
  loadCheckerQueue(): void {
    this.selectedCheckerMovement = null;
    this.checkerItems = [];
    this.movementPicked.emit(null);
    this.queueReloaded.emit();
    const contractId = this.checkerContractId;
    if (!contractId) return;
    this.checkerLoading = true;
    const strategy = this.selectedFunction ? deriveFunctionStrategy(this.selectedFunction) : null;
    const deferMovementType = strategy?.checkerRelease.deferSettlement ? (this.selectedFunction?.deferSettlementMovementType ?? 'UTILIZE') : null;
    const requiresEarmarked = !!strategy?.checkerRelease.releasesExistingMovementInPlace;
    const selectedFunction = this.selectedFunction;
    this.api.listMovements(contractId).subscribe({
      next: (list: BalanceMovement[]) => {
        this.checkerLoading = false;
        this.checkerItems = list.filter((m) => {
          if (m.status !== 'PENDING') return false;
          if (selectedFunction && !movementTypeMatchesFunction(selectedFunction, m.movementType)) return false;
          if (deferMovementType && m.movementType === deferMovementType && m.acknowledgedAt) return false;
          if (requiresEarmarked && m.movementType === 'UTILIZE' && (!m.acknowledgedAt || !m.makerSubmittedAt)) return false;
          return true;
        });
        this.queueLoadSucceeded.emit();
      },
      error: () => {
        this.checkerLoading = false;
        this.checkerItems = [];
      },
    });
  }

  onSelectCheckerMovement(movementId: string): void {
    this.selectedCheckerMovement = this.checkerItems.find((m) => m.movementId === movementId) ?? null;
    this.movementPicked.emit(this.selectedCheckerMovement);
  }
}
