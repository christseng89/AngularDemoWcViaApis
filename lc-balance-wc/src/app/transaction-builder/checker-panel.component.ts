import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BalanceComponentApiService, BalanceContract, BalanceMovement } from './balance-component-api.service';
import { IndexPickerComponent } from './index-picker.component';
import {
  TransactionFunction,
  displayMovementType as displayMovementTypeRule,
  displayMovementAmount as displayMovementAmountRule,
} from './balance-component.model';
import { describeApiError as describeApiErrorShared } from './api-error';
import * as policy from './function-policy';

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
  imports: [CommonModule, FormsModule, IndexPickerComponent],
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

  /** Every PENDING movement on `checkerContractId`. Re-run after anything that could change what's PENDING on this contract (a Maker Submit, or a Checker Release/Reject from this same queue). */
  loadCheckerQueue(): void {
    this.selectedCheckerMovement = null;
    this.checkerItems = [];
    this.movementPicked.emit(null);
    this.queueReloaded.emit();
    const contractId = this.checkerContractId;
    if (!contractId) return;
    this.checkerLoading = true;
    this.api.listMovements(contractId).subscribe({
      next: (list: BalanceMovement[]) => {
        this.checkerLoading = false;
        this.checkerItems = list.filter((m) => m.status === 'PENDING');
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
