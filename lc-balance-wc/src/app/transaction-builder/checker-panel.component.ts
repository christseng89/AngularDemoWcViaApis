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
 * A pending sync request for the Checker's own independent search, mirroring
 * `TransactionBuilderComponent.syncCheckerToContext()`'s pre-extraction body exactly — see this
 * component's own `ngOnChanges()` doc comment for why a plain `@Input()` string pair isn't enough on
 * its own.
 */
export interface CheckerSyncSignal {
  lcNumber: string;
  secondaryRef: string | null;
}

/**
 * BAL-003 "Feature Components + Facade" pilot #2 (2026-08-19, desiger-comments.md — user-directed
 * "CheckerPanelComponent" extraction, Phase 1 of an 8-phase architecture proposal). Owns the Checker's
 * OWN independent search box + PENDING-movement queue picker (business instruction 2026-08-15 — see
 * `syncFromContext()`'s own doc comment for the "genuinely separate from the Maker's own selection"
 * design principle this preserves verbatim). Deliberately does NOT own the Release/Reject/Approve
 * ACTION buttons or their own busy/error/compound-routing state (`checkerBusy`/`checkerError`/
 * `checkerId`/`checkerAct()`/`release()`/`reject()`/`approveArrival()`/`isCheckerCompoundOwnSubmission`)
 * — those stayed on `TransactionBuilderComponent`. See that component's own doc comment on
 * `onCheckerMovementPicked()` for the full reasoning: the action layer reads deep Maker-side context
 * (`submitResult`, `selectedFunctionStrategy`, 4 compound movementIds) already funneled through the
 * existing `CheckerActionContext`/`CheckerActionOutcome` DTOs, and its own "release succeeds -> reset
 * the whole Maker screen via `selectFunction()`" side effect is fundamentally a Maker-side concern —
 * extracting it too would mean either duplicating that whole context surface as `@Input()`s for no real
 * decoupling gain, or rewriting the ~40 existing compound-release tests in `.actions.spec.ts` (A3S/A6/
 * B4/B5's own multi-leg release chains) that already exercise this exact context/outcome shape
 * end-to-end. A narrower, honestly-scoped first cut (this component) proves the "real `@Component`, no
 * TestBed" pattern the user's own proposal asked to validate, without that larger, separately-scoped
 * risk.
 */
@Component({
  selector: 'app-checker-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, IndexPickerComponent],
  templateUrl: './checker-panel.component.html',
  styleUrl: './checker-panel.component.scss',
})
export class CheckerPanelComponent implements OnChanges {
  /** Needed for `instrumentType` (the search's own resolveContract call) and `checkerSecondaryField`/`checkerSecondaryLabel` (function-policy.ts, unchanged). */
  @Input() selectedFunction: TransactionFunction | null = null;
  /**
   * Business instruction 2026-08-15 ("Look Up Current Balance should use the existing LC Number on
   * Screen... Once Maker Submit or Checker display, it will just use the LC Number instead of keyin") —
   * the Maker-side `syncCheckerToContext()` trigger, now crossing a real component boundary. A PLAIN
   * `@Input()` pair re-evaluated every change-detection cycle is not enough on its own: Angular's
   * `ngOnChanges()` only fires when the bound value differs (by reference, for an object) from the
   * PREVIOUS cycle's value — but the original `syncCheckerToContext()` re-searches UNCONDITIONALLY on
   * every one of its ~9 call sites, even when the target LC Number happens to be unchanged from before
   * (e.g. `submitA4()`'s own success callback re-syncs to refresh `checkerItems` after finalizing the
   * SAME already-selected LC's own movement — the LC Number never changes, but the queue's own CONTENTS
   * genuinely need reloading). The parent constructs a BRAND NEW object literal at every trigger point
   * (see `TransactionBuilderComponent.syncCheckerToContext()`'s own doc comment) specifically so
   * reference inequality reliably fires `ngOnChanges()` regardless of whether the field values inside it
   * happen to match the previous call — the object itself is the signal, not (only) its contents.
   */
  @Input() syncSignal: CheckerSyncSignal | null = null;
  /**
   * `TransactionBuilderComponent.selectFunction()`'s own per-function reset, crossing the same boundary
   * — a plain incrementing counter (any change in value, by `!==`, is the signal) rather than a boolean,
   * since two resets in a row (e.g. switching A2 -> A2 again is impossible, but A2 -> A9 -> A2 is not)
   * must each independently re-trigger `resetPanel()`, which a toggling boolean could miss on an
   * even-numbered sequence of resets.
   */
  @Input() resetTrigger: number | null = null;

  /**
   * Fires whenever the panel's own idea of "which PENDING movement is picked" changes — either a real
   * user click (`onSelectCheckerMovement()`) or an implicit clear at the top of a fresh
   * `searchCheckerLc()`/`loadCheckerQueue()` (mirrors the original inline component's own unconditional
   * `this.selectedCheckerMovement = null` resets at both those points, byte-for-byte). The parent keeps
   * its OWN mirror of this value (`TransactionBuilderComponent.selectedCheckerMovement`) — `checkerAct()`/
   * `release()`/`reject()`/`isCheckerCompoundOwnSubmission` etc. all still read a plain field, unchanged
   * internally; only WHAT WRITES it changed, from a direct component method to this event.
   */
  @Output() movementPicked = new EventEmitter<BalanceMovement | null>();
  /** Fires at the top of every `loadCheckerQueue()` run — the parent clears its OWN `checkerError` (a stale Release/Reject error from before a fresh reload) in response, mirroring the original inline `loadCheckerQueue()`'s own unconditional `checkerError = null`. */
  @Output() queueReloaded = new EventEmitter<void>();
  /** Fires once `loadCheckerQueue()`'s own `listMovements` call succeeds — the parent calls its own (still-private) `syncLookupToContext()` in response, mirroring the original inline success callback exactly. */
  @Output() queueLoadSucceeded = new EventEmitter<void>();

  checkerLcNumber = '';
  checkerSecondaryRef = '';
  checkerContract: BalanceContract | null = null;
  checkerSearching = false;
  checkerSearchError: string | null = null;
  checkerItems: BalanceMovement[] = [];
  checkerLoading = false;
  /** This panel's own copy, for `app-index-picker`'s `[selectedId]` highlighting — see `movementPicked`'s own doc comment for how the parent's separate mirror stays in sync. */
  selectedCheckerMovement: BalanceMovement | null = null;

  constructor(private readonly api: BalanceComponentApiService) {}

  /**
   * Both `@Input()`s below are pure "something happened, react to it" SIGNALS, not the reacted-to VALUE
   * itself sitting passively in the template — `ngOnChanges()` is the correct, and only, place to
   * convert either into the same imperative call the original inline implementation made directly. Safe
   * to call directly from a test too (`new CheckerPanelComponent(mockApi).ngOnChanges({...})` — a plain
   * method, no `TestBed`/view-init lifecycle needed), matching this project's own established
   * `IndexPickerComponent`/`AccountEntriesDialogComponent` convention of testing `@Component` class logic
   * via direct construction; only the REAL template wiring (`[syncSignal]="checkerSyncSignal"` etc.
   * actually re-evaluating and firing this on a live change-detection cycle) needs `ng build`'s strict-
   * template check plus a live browser pass to verify, same as every other binding in this project.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['resetTrigger'] && !changes['resetTrigger'].firstChange) this.resetPanel();
    if (changes['syncSignal'] && this.syncSignal) this.syncFromContext(this.syncSignal.lcNumber, this.syncSignal.secondaryRef);
  }

  get checkerContractId(): string | null {
    return this.checkerContract?.balanceContractId ?? null;
  }

  /**
   * 2026-08-20 — same "B2's own AMEND reads as AMEND_INCREASE/AMEND_DECREASE everywhere a movement's
   * Type/Amount is shown" unification as `displayMovementType()`'s own doc comment
   * (`balance-component.model.ts`) describes. `checkerContract` (this panel's own single resolved
   * contract for the whole queue) supplies `instrumentType` — every row in `checkerItems` belongs to
   * this same contract, so there's no per-row instrumentType to thread through.
   */
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

  /**
   * Mirrors `TransactionBuilderComponent.selectFunction()`'s own pre-extraction reset block exactly —
   * `checkerLcNumber` is deliberately NOT cleared here, same reasoning as before extraction: a Checker
   * moving from one function to another very plausibly wants to keep checking the SAME LC; only the
   * resolved contract needs clearing, since it was resolved against the OLD function's own instrumentType.
   */
  private resetPanel(): void {
    this.checkerContract = null;
    this.checkerSearchError = null;
    this.checkerItems = [];
    this.selectedCheckerMovement = null;
  }

  /**
   * Convenience auto-fill for the Checker's OWN independent LC search (business instruction 2026-08-15)
   * — pre-fills `checkerLcNumber` from whatever the Maker just picked/typed/submitted and runs the
   * search, purely so a Maker who just submitted doesn't have to retype the same LC Number a second
   * time. The field and `searchCheckerLc()` stay fully usable on their own regardless — this is a
   * default, not a binding.
   */
  syncFromContext(lcNumber: string | null, secondaryRef: string | null): void {
    if (!lcNumber) return;
    this.checkerLcNumber = lcNumber;
    this.checkerSecondaryRef = secondaryRef ?? '';
    this.searchCheckerLc();
  }

  /**
   * Business instruction 2026-08-15 ("there is no way to Approve pending... Would it be possible to
   * have separate option in Amendment function to release those pending events? Same requirement for
   * all other functions.") — resolves via THIS function's own `instrumentType` (the static field,
   * available immediately on function selection), so a Checker can search and act on a PENDING item
   * without ever touching the Maker's own Direction/Parent-picker/natural-key flow.
   *
   * Business-reported gap 2026-08-15 ("Check[er] function is not working for Shipping Gtee (Issue)",
   * repro'd with LC S001 / SG G01): SHGT/Acceptance contracts are keyed by LC Number + SG/IB Number (one
   * LC can have multiple), so this second field is mandatory whenever `checkerSecondaryField` is set.
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
   * Business instruction 2026-08-15 ("Seperate Maker and Checker... allow Check to release unrelease
   * Pending events") — every PENDING movement on `checkerContractId`. Re-run after any action that could
   * change what's PENDING on this contract (a Maker Submit, or a Checker Release/Reject from this same
   * queue — both drive `syncSignal`/`resetTrigger`, see this component's own class doc comment).
   */
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
