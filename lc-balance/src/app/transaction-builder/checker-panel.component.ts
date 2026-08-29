import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { BalanceComponentApiService, BalanceContract, BalanceMovement } from './balance-component-api.service';
import { IndexPickerComponent } from './index-picker.component';
import { TbIconComponent } from '../tb-icon.component';
import {
  TransactionFunction,
  displayMovementType as displayMovementTypeRule,
  displayMovementAmount as displayMovementAmountRule,
  isEarmarkFunction,
} from './balance-component.model';
import { describeApiError as describeApiErrorShared, notFoundMessage } from './api-error';
import * as policy from './function-policy';
import { isCheckerActionableMovement } from './checker-eligibility-policy';
import { FeedbackMessageComponent } from '../shared/feedback/feedback-message.component';
import { UiMessage } from '../shared/feedback/ui-message.model';
import { presentApiError } from '../shared/feedback/api-error-presenter';

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
  imports: [CommonModule, FormsModule, IndexPickerComponent, TbIconComponent, FeedbackMessageComponent],
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
  /**
   * "Not Found Message — UI Width" rule (business-directed) — see `MakerPanelComponent.
   * searchErrorIsNotFound`'s own doc comment for the full rationale; same shape here. Reset alongside
   * `checkerSearchError` itself, set true only in `searchCheckerLc()`'s own 404 branch.
   */
  checkerSearchErrorIsNotFound = false;

  get checkerSearchFeedback(): UiMessage | null {
    if (!this.checkerSearchError) return null;
    const query = [this.checkerLcNumber, this.checkerSecondaryRef].filter(Boolean).join(' / ');
    const error = this.checkerSearchErrorIsNotFound
      ? { status: 404, message: this.checkerSearchError }
      : { message: this.checkerSearchError };
    return presentApiError(error, 'SEARCH', query || undefined);
  }
  checkerItems: BalanceMovement[] = [];
  checkerLoading = false;
  /** This panel's own copy, for `app-index-picker`'s `[selectedId]` highlighting. */
  selectedCheckerMovement: BalanceMovement | null = null;
  /**
   * Business-reported gap 2026-08-21 ("單獨執行 A9 Checker 輸入LC NUMBER 無法自動找到PENDING交易") —
   * populated when `searchCheckerLc()` is run with the SG/IB Number left blank AND more than one
   * candidate exists under this LC (so which one is genuinely ambiguous, not knowable server-side).
   * Non-empty only while awaiting that pick; `onSelectSecondaryCandidate()`/a fresh search both clear it.
   */
  checkerSecondaryCandidates: BalanceContract[] = [];
  /** Set alongside a single-candidate auto-resolve — same "picked automatically" convention `app-index-picker`'s own `autoPickedHint` already uses elsewhere in this app. */
  checkerAutoPickedHint: string | null = null;

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

  /**
   * Business-reported gap 2026-08-27 (A6's own Pending Approvals row read "· earmarked ..." even though
   * A6 is a Final-Processing Function, not an Earmarking one — see CLAUDE.md's own "LC Balance Status
   * Rules" entry) — this row-sub label was a hardcoded literal, unlike every other status text in this
   * app, which already derives from `isEarmarkFunction()`. Every row in this queue shares the one
   * resolved `checkerContract`/`selectedFunction` (per-function-scoped Checker Queue, see CLAUDE.md), so
   * this only needs the row's own `movementType`, not a full phase/acknowledgedAt lookup — a raw queue
   * row is never itself a 'finalize'-phase split.
   */
  checkerRowVerb(movementType: string | null | undefined): string {
    return isEarmarkFunction(this.checkerContract?.instrumentType, movementType) ? 'earmarked' : 'submitted';
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
    this.checkerSearchErrorIsNotFound = false;
    this.checkerItems = [];
    this.selectedCheckerMovement = null;
    this.checkerSecondaryCandidates = [];
    this.checkerAutoPickedHint = null;
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
   * without touching the Maker's own selection flow. When the secondary field (IB/SG Number) is set
   * for this instrumentType (SHGT/Acceptance — LC Number alone doesn't identify which record) AND left
   * blank, this no longer hard-errors (business-reported gap 2026-08-21, "單獨執行 A9 Checker 輸入LC
   * NUMBER 無法自動找到PENDING交易") — `searchCheckerCandidatesByLcOnly()` browses every candidate under
   * this LC instead, auto-picking the sole one or offering a picker when genuinely ambiguous.
   */
  searchCheckerLc(): void {
    this.checkerSearchError = null;
    this.checkerSearchErrorIsNotFound = false;
    this.checkerContract = null;
    this.checkerItems = [];
    this.checkerSecondaryCandidates = [];
    this.checkerAutoPickedHint = null;
    this.selectedCheckerMovement = null;
    this.movementPicked.emit(null);
    if (!this.selectedFunction) return;
    if (!this.checkerLcNumber) {
      this.checkerSearchError = 'Type an LC Number to search.';
      return;
    }
    const secondaryField = this.checkerSecondaryField;
    if (secondaryField && !this.checkerSecondaryRef) {
      this.searchCheckerCandidatesByLcOnly(secondaryField);
      return;
    }
    this.checkerSearching = true;
    const naturalKey = {
      lcNumber: this.checkerLcNumber,
      ibNumber: secondaryField === 'ibNumber' ? this.checkerSecondaryRef : null,
      sgNumber: secondaryField === 'sgNumber' ? this.checkerSecondaryRef : null,
    };
    // F1 (external BA review, v1.19.0) — A11/B7 (Reopen) only. Every other function's own Checker search
    // target is still ACTIVE while its movement is PENDING (a CLOSE/EXPIRE hasn't taken effect until
    // Release) — but A11/B7's whole point is a movement PENDING against an ALREADY-CLOSED contract, so
    // the default ACTIVE-only resolveContract() would 404 here (real bug found via live testing:
    // "No Logical Contract exists yet for this natural key" even though a genuine PENDING REOPEN existed).
    const includeAnyStatus = !!this.selectedFunction.requiresReopenEligibility;
    this.api.resolveContract(this.selectedFunction.instrumentType, naturalKey, includeAnyStatus).subscribe({
      next: (contract) => {
        this.checkerSearching = false;
        this.checkerContract = contract;
        this.loadCheckerQueue();
      },
      error: (err) => {
        this.checkerSearching = false;
        // "Search — No Match Message" rule (business-directed, applies to every Search button, not just
        // the Maker's own) — a genuine 404 reads as "{query} not found", same wording/shape as the
        // Maker-side searches. Any OTHER error still falls back to describeApiErrorShared().
        const status = (err as { status?: number } | null)?.status;
        const query = [this.checkerLcNumber, this.checkerSecondaryRef || null].filter((v): v is string => !!v).join(' / ');
        this.checkerSearchErrorIsNotFound = status === 404;
        this.checkerSearchError = this.checkerSearchErrorIsNotFound ? notFoundMessage(query) : describeApiErrorShared(err);
      },
    });
  }

  /**
   * LC Number typed, SG/IB Number left blank — browses every ACTIVE candidate of this function's own
   * instrumentType under `checkerLcNumber` (same `catalog()` + exact-`lcNumber`-match convention the
   * Maker's own IB/SG Index pickers already use), rather than demanding the Checker already know the
   * exact secondary key. Zero candidates is a real error; exactly one auto-resolves (mirrors
   * `app-index-picker`'s own `autoPickedHint` "picked automatically" convention); more than one is
   * genuinely ambiguous and surfaces as a pick-one list (`checkerSecondaryCandidates`).
   *
   * Business-reported gap 2026-08-24 ("B3/A3/A3S 單獨使用 Checker，已經 earmarked 的交易不應該再被選出") —
   * a candidate with `status: 'ACTIVE'` at the CONTRACT level (e.g. a B3 Present Docs presentation whose
   * own CREATE is already Checker-Released — RELEASED, i.e. already earmarked) has nothing left for this
   * Checker to review, but was being listed here anyway since this method only ever checked contract
   * status, never movement status. Now fetches each candidate's own movements and keeps only the ones
   * with at least one genuinely actionable (EARMARKING) item, via `isCheckerActionable()` — the SAME
   * predicate `loadCheckerQueue()` itself uses, so this candidate list and the queue it leads into can
   * never disagree about what counts as actionable.
   */
  private searchCheckerCandidatesByLcOnly(secondaryField: 'ibNumber' | 'sgNumber'): void {
    if (!this.selectedFunction) return;
    const selectedFunction = this.selectedFunction;
    this.checkerSearching = true;
    this.api
      .catalog(selectedFunction.instrumentType, 'ACTIVE', undefined, 1, 100, this.checkerLcNumber)
      .pipe(
        switchMap((result) => {
          if (!result.items.length) return of([] as BalanceContract[]);
          return forkJoin(
            result.items.map((c) =>
              this.api.listMovements(c.balanceContractId).pipe(
                map((movements) => (movements.some((m) => isCheckerActionableMovement(m, selectedFunction)) ? c : null)),
                catchError(() => of(null)),
              ),
            ),
          ).pipe(map((results) => results.filter((c): c is BalanceContract => c !== null)));
        }),
      )
      .subscribe({
        next: (items) => {
          this.checkerSearching = false;
          if (items.length === 0) {
            this.checkerSearchError = `No ${this.checkerSecondaryLabel} record with an actionable PENDING item found under this LC.`;
            return;
          }
          if (items.length === 1) {
            this.resolveCheckerContract(items[0]);
            this.checkerAutoPickedHint = `Only one ${this.checkerSecondaryLabel} under this LC — picked automatically.`;
            return;
          }
          this.checkerSecondaryCandidates = items;
        },
        error: (err) => {
          this.checkerSearching = false;
          this.checkerSearchError = describeApiErrorShared(err);
        },
      });
  }

  /** A row click from the `checkerSecondaryCandidates` picker — `app-index-picker`'s `pick` emits the row's own `balanceContractId`, same convention as `onSelectCheckerMovement()` below. The contract itself is already in hand from `catalog()`, no extra `resolveContract()` round trip needed. */
  onSelectSecondaryCandidate(balanceContractId: string): void {
    const contract = this.checkerSecondaryCandidates.find((c) => c.balanceContractId === balanceContractId);
    this.checkerSecondaryCandidates = [];
    if (contract) this.resolveCheckerContract(contract);
  }

  /** Shared tail for both the single-candidate auto-resolve and a genuine pick from `checkerSecondaryCandidates` — mirrors what `searchCheckerLc()`'s own direct `resolveContract()` success handler does. */
  private resolveCheckerContract(contract: BalanceContract): void {
    const field = this.checkerSecondaryField;
    if (field) this.checkerSecondaryRef = contract.naturalKey[field] ?? '';
    this.checkerContract = contract;
    this.loadCheckerQueue();
  }

  /**
   * Every still-actionable PENDING movement on `checkerContractId`, per `isCheckerActionable()` below —
   * this method just re-fetches and applies it. Re-run after anything that could change what's PENDING
   * on this contract (a Maker Submit, or a Checker Release/Reject/acknowledge from this same queue). Two
   * opposite, function-scoped rules within `isCheckerActionable()` share the same EARMARKING(PENDING+no
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
    const selectedFunction = this.selectedFunction;
    this.api.listMovements(contractId).subscribe({
      next: (list: BalanceMovement[]) => {
        this.checkerLoading = false;
        this.checkerItems = list.filter((m) => isCheckerActionableMovement(m, selectedFunction));
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
