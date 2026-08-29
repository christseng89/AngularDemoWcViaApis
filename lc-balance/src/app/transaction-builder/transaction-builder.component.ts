import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { FormlyModule } from '@ngx-formly/core';
import { IndexPickerComponent } from './index-picker.component';
import { TbIconComponent } from '../tb-icon.component';
import { BalanceComponentApiService, BalanceMovement, EditMovementRequest } from './balance-component-api.service';
import { CheckerActionContext, CheckerActionOutcome, CheckerActionsService } from './checker-actions.service';
import { LookUpPanelService } from './look-up-panel.service';
import { InquireEventsService } from './inquire-events.service';
import { InquireEventsComponent, InquireOpenAccountEntriesEvent } from './inquire-events.component';
import { MakerQueueRow, MakerQueueService } from './maker-queue.service';
import { MakerQueueComponent } from './maker-queue.component';
import { InquireDeletePendingService } from './inquire-delete-pending.service';
import { InquireDeletePendingComponent } from './inquire-delete-pending.component';
import { BalanceSnapshotBoxComponent } from './balance-snapshot-box.component';
import { describeApiError as describeApiErrorShared } from './api-error';
import {
  EXPORT_FUNCTIONS,
  IMPORT_FUNCTIONS,
  InstrumentType,
  TransactionFunction,
  displayStatus as displayStatusShared,
  statusBadgeClass as statusBadgeClassShared,
  contractStatusBadgeClass as contractStatusBadgeClassShared,
  displayMovementType as displayMovementTypeShared,
  displayMovementAmount as displayMovementAmountShared,
  functionActionIcon as functionActionIconShared,
  statusBadgeIcon as statusBadgeIconShared,
} from './balance-component.model';
import { AccountEntriesDialogComponent } from './account-entries-dialog.component';
import { CheckerPanelComponent, CheckerSyncSignal } from './checker-panel.component';
import { MakerCheckerContext, MakerPanelComponent, MakerSyncRequest } from './maker-panel.component';
import { deriveFunctionStrategy } from './function-strategy';
import { FeedbackMessageComponent } from '../shared/feedback/feedback-message.component';
import { UiMessage } from '../shared/feedback/ui-message.model';
import { presentApiError } from '../shared/feedback/api-error-presenter';

/**
 * Named Import (A-series) / Export (B-series) business functions, not a raw instrumentType/
 * movementType picker — see balance-component.model.ts's IMPORT_FUNCTIONS/EXPORT_FUNCTIONS
 * (Design doc §5).
 */
@Component({
  selector: 'app-transaction-builder',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FormlyModule,
    IndexPickerComponent,
    AccountEntriesDialogComponent,
    CheckerPanelComponent,
    MakerPanelComponent,
    TbIconComponent,
    InquireEventsComponent,
    BalanceSnapshotBoxComponent,
    MakerQueueComponent,
    InquireDeletePendingComponent,
    FeedbackMessageComponent,
  ],
  templateUrl: './transaction-builder.component.html',
  styleUrl: './transaction-builder.component.scss',
  providers: [LookUpPanelService, InquireEventsService, MakerQueueService, InquireDeletePendingService],
})
export class TransactionBuilderComponent {
  readonly importFunctions = IMPORT_FUNCTIONS;
  readonly exportFunctions = EXPORT_FUNCTIONS;

  /**
   * User-reported live ("A3交易 SUBMIT後 CHECKER沒顯示" → confirmed via direct DOM inspection: the
   * Checker panel WAS always correctly rendered/populated, just positioned well below the fold on a
   * normal viewport height — every function's own Maker form (fields + Maker Result panel) sits above
   * it, so a Checker panel a Maker just became eligible to act on required scrolling down to discover at
   * all) — scrolled into view automatically in `onMakerSyncRequested()` below, on the SAME
   * `alsoSyncLookup` signal that already means "a genuine Submit/Fix Pending Save/Release/Reject just
   * succeeded", not on a mere selection pick.
   */
  @ViewChild('checkerPanelEl') private checkerPanelEl?: ElementRef<HTMLElement>;

  activeFunctionSide: 'IMPORT' | 'EXPORT' = 'IMPORT';
  activeMode: 'PROCESSING' | 'INQUIRE' | 'MAKER_QUEUE' | 'DELETE_PENDING_AUDIT' = 'PROCESSING';
  selectedFunction: TransactionFunction | null = null;

  get selectedFunctionStrategy() {
    return this.selectedFunction ? deriveFunctionStrategy(this.selectedFunction) : null;
  }

  /** Checker release/reject targets — CheckerPanelComponent owns search/queue. */
  selectedCheckerMovement: BalanceMovement | null = null;
  checkerBusy = false;
  checkerError: string | null = null;
  get checkerFeedback(): UiMessage | null {
    if (!this.checkerError) return null;
    return { ...presentApiError({ message: this.checkerError }, 'APPROVE'), retryable: false };
  }
  checkerId = 'checker1';
  checkerSyncSignal: CheckerSyncSignal | null = null;
  /** Public for template binding — shared reset trigger for both CheckerPanelComponent and MakerPanelComponent. */
  checkerResetNonce = 0;
  /** Public for template binding — reloads CheckerPanelComponent's own queue in place (keeps its search) after a successful acknowledgeArrival(), so an already-approved A3/A3S item stops reappearing (business instruction 2026-08-20, "A3 A3S 交易 Approve 過後 不要再顯示"). */
  checkerQueueRefreshNonce = 0;

  actionBusy = false;
  releaseSuccessHint: string | null = null;
  arrivalApproved = false;

  /** Read-only mirror of `MakerPanelComponent`'s own state, needed by `buildCheckerActionContext()`. See `MakerCheckerContext`. */
  private makerContext: MakerCheckerContext = {
    submitResult: null,
    selectedPayMovement: null,
    matchedReceivableMovementId: null,
    dueFromIssuingBankMovementId: null,
    acceptanceMovementId: null,
    acceptanceReimbReceivableMovementId: null,
    arrivalSgRedeemMovementId: null,
    createdBy: 'maker1',
  };

  /** Forwarded to `MakerPanelComponent`'s `externalCheckerOutcome` `@Input()` (a fresh object per emission, read via `ngOnChanges()`) for every release/reject/delete outcome except the whole-screen-reset case. */
  makerOutcomeSignal: CheckerActionOutcome | null = null;
  /** Forwarded to `MakerPanelComponent`'s `refreshRequested` `@Input()` — used by `checkerAct()`'s plain release/reject path instead of `makerOutcomeSignal`. */
  refreshNonce = 0;
  /** Forwarded to `MakerPanelComponent`'s `externalFixPendingRequest` `@Input()` — see `onMakerQueueFixPending()`'s own doc comment. */
  externalFixPendingRequest: BalanceMovement | null = null;
  /** Forwarded to `MakerPanelComponent`'s `externalDeletePendingReviewRequest` `@Input()` — see `onMakerQueueDeletePendingReview()`'s own doc comment. */
  externalDeletePendingReviewRequest: BalanceMovement | null = null;
  /** The original `MakerQueueRow` a Delete Pending review is currently open for — kept here (not just the bare movement above) so `onDeletePendingReviewConfirmed()` can call `MakerQueueService.deletePending()` with its own `siblingMovementIds`, cascade-aware for a compound row, rather than the generic same-session-only Checker-action deletion path. */
  pendingMakerQueueDeleteRow: MakerQueueRow | null = null;

  accountEntryDialogMovement: BalanceMovement | null = null;
  accountEntryDialogInstrumentType: InstrumentType | null = null;
  accountEntryDialogPhase: 'primary' | 'create' | 'finalize' | null = null;
  /** See `InquiredEvent.linkedMovement`'s own doc comment — A6's own cascade-linked second Account Entries set, only ever non-null via `onInquireOpenAccountEntries()`. */
  accountEntryDialogLinkedMovement: BalanceMovement | null = null;

  /** Constructor params default-construct their own service so `new TransactionBuilderComponent(mockApi)` still works in tests; `lookUp`/`inquireEvents` are also registered in `providers` above (not `providedIn: 'root'`). */
  constructor(
    private readonly api: BalanceComponentApiService,
    private readonly checkerActions: CheckerActionsService = new CheckerActionsService(api),
    readonly lookUp: LookUpPanelService = new LookUpPanelService(api),
    readonly inquireEvents: InquireEventsService = new InquireEventsService(api),
    readonly makerQueue: MakerQueueService = new MakerQueueService(api),
    readonly inquireDeletePending: InquireDeletePendingService = new InquireDeletePendingService(api),
  ) {}

  selectMode(mode: 'PROCESSING' | 'INQUIRE' | 'MAKER_QUEUE' | 'DELETE_PENDING_AUDIT'): void {
    this.activeMode = mode;
    this.accountEntryDialogMovement = null;
    this.accountEntryDialogInstrumentType = null;
    this.accountEntryDialogPhase = null;
    this.accountEntryDialogLinkedMovement = null;
    // Real bug found live 2026-08-28 ("✎ FIX PENDING... 🗑 DELETE PENDING — REVIEW..." both banners shown
    // together for the same movement): `<app-maker-panel>` only exists in the DOM while `activeMode ===
    // 'PROCESSING'` (the `*ngIf` wrapping the whole workspace) — leaving this mode DESTROYS that
    // component instance entirely, so re-entering it later creates a genuinely FRESH instance whose very
    // first `ngOnChanges()` reports EVERY currently-bound `@Input()` as changed, not just the one this
    // click meant to trigger. `externalFixPendingRequest`/`externalDeletePendingReviewRequest` are both
    // parent-level fields that otherwise never get cleared — a stale non-null value left over from an
    // EARLIER Maker-Queue-originated Fix Pending (or Delete Pending review) would silently re-fire
    // alongside a genuinely new one, setting `fixPendingMode`/`deletePendingReviewMode` both `true` at
    // once. Cleared here, the one place every exit from 'PROCESSING' funnels through, rather than in each
    // of the two `onMakerQueueXxx()` methods individually (which only guards against THAT pair colliding
    // with each other, not against a THIRD future signal added the same way later).
    if (mode !== 'PROCESSING') {
      this.externalFixPendingRequest = null;
      this.externalDeletePendingReviewRequest = null;
      // The Delete Pending review is the only workflow allowed to hide the Checker panel. If the user
      // leaves Processing through navigation instead of the review's own Confirm/Cancel buttons, its
      // row must not leak into the next normal Function screen and keep Checker hidden there.
      this.pendingMakerQueueDeleteRow = null;
    }
    if (mode === 'INQUIRE') {
      this.inquireEvents.loadIndex();
    }
    if (mode === 'MAKER_QUEUE') {
      this.makerQueue.load();
    }
    if (mode === 'DELETE_PENDING_AUDIT') {
      this.inquireDeletePending.loadIndex();
    }
  }

  selectFunctionSide(side: 'IMPORT' | 'EXPORT'): void {
    this.activeFunctionSide = side;
    this.lookUp.resetForSide(side);
  }

  /**
   * Maker-side reset lives on `MakerPanelComponent.resetForFunction()`, triggered by the same
   * `checkerResetNonce` counter used for `CheckerPanelComponent`'s own reset. This method only resets
   * what stays parent-owned.
   */
  selectFunction(fn: TransactionFunction): void {
    // A direct Function selection always starts a normal transaction screen. Clear any abandoned
    // Delete Pending review first; onMakerQueueDeletePendingReview() intentionally assigns its row and
    // request again immediately after this call.
    this.pendingMakerQueueDeleteRow = null;
    this.externalDeletePendingReviewRequest = null;
    this.selectedFunction = fn;
    this.activeFunctionSide = fn.side;
    this.lookUp.resetForSide(fn.side);
    this.releaseSuccessHint = null;
    this.arrivalApproved = false;
    this.accountEntryDialogMovement = null;
    this.accountEntryDialogInstrumentType = null;
    this.accountEntryDialogPhase = null;
    this.accountEntryDialogLinkedMovement = null;
    this.makerContext = {
      submitResult: null,
      selectedPayMovement: null,
      matchedReceivableMovementId: null,
      dueFromIssuingBankMovementId: null,
      acceptanceMovementId: null,
      acceptanceReimbReceivableMovementId: null,
      arrivalSgRedeemMovementId: null,
      createdBy: 'maker1',
    };
    this.checkerResetNonce++;
    this.selectedCheckerMovement = null;
    this.checkerError = null;
  }

  /**
   * Maker Queue's own Fix Pending entry point (2026-08-28, "Maker Queue Need to provide Fix Pending
   * button as well") — jumps to Transaction Processing, selects this row's own resolved Function
   * (`MakerQueueService.fixPendingSupported()` already guarantees it's Fix-Pending-eligible and
   * single-leg only), then feeds the row's movement into `MakerPanelComponent`'s own
   * `externalFixPendingRequest` — the exact same "return to the real original-event screen" mechanism
   * the in-session Fix Pending button already drives, never a second, separately-built edit UI for
   * Maker Queue's own table. `selectFunction()` runs first, in this same synchronous call, so both its
   * own `resetTrigger` bump and this assignment land in `MakerPanelComponent`'s next `ngOnChanges()`
   * together (see that `@Input()`'s own doc comment for why ordering there is safe). Spread into a fresh
   * object — `row.movement` is a stable reference across multiple clicks on the same still-loaded row,
   * and `ngOnChanges()` only fires on a genuine reference change, same "fresh object per emission"
   * convention `externalCheckerOutcome` already uses.
   */
  onMakerQueueFixPending(row: MakerQueueRow): void {
    const fn = this.makerQueue.functionFor(row);
    if (!fn) return;
    this.selectMode('PROCESSING');
    this.selectFunction(fn);
    this.externalFixPendingRequest = { ...row.movement };
  }

  /**
   * "FIX PENDING OR DELETE PENDING 按CANCEL 回到原來的MAKER QUEUE畫面" (2026-08-28) — `cancelFixPending()`
   * emits `fixPendingCancelled` unconditionally, for both the in-session button and a Maker-Queue-
   * originated session; only THIS method decides which one it was, via whether `externalFixPendingRequest`
   * is still the non-null value `onMakerQueueFixPending()` set (never cleared except by `selectMode()`
   * leaving 'PROCESSING' — see that method's own doc comment). An in-session Cancel (opened from the
   * Maker Result panel after a normal same-session Submit) leaves it `null` and this is a no-op, matching
   * the existing "revert to read-only display in place" behavior exactly as before this feature existed.
   */
  onFixPendingCancelled(): void {
    if (!this.externalFixPendingRequest) return;
    this.externalFixPendingRequest = null;
    this.selectMode('MAKER_QUEUE');
  }

  /**
   * Maker Queue's own Delete Pending review entry point (2026-08-28, "Maker Queue Delete Pending 也要
   * 顯示交易畫面 確認刪除與否" — "CLICK DELETE PENDING BUTTON -> 顯示交易畫面 (ALL FIELDS PROTECTED) +
   * Confirm / Cancel Button"). Same navigation shape as `onMakerQueueFixPending()` above, but feeds
   * `MakerPanelComponent`'s own `externalDeletePendingReviewRequest` instead — a read-only reconstruction,
   * never editable — and keeps the ORIGINAL `row` (not just its movement) in `pendingMakerQueueDeleteRow`
   * so the eventual Confirm can cascade-delete a compound row's own sibling legs correctly.
   */
  onMakerQueueDeletePendingReview(row: MakerQueueRow): void {
    const fn = this.makerQueue.functionFor(row);
    if (!fn) return;
    this.selectMode('PROCESSING');
    this.selectFunction(fn);
    this.pendingMakerQueueDeleteRow = row;
    this.externalDeletePendingReviewRequest = { ...row.movement };
  }

  /**
   * The Maker confirmed on the review screen — now, and only now, does the actual delete call happen.
   * Routes through `MakerQueueService.deletePending()` (not the generic Checker-action deletion path)
   * specifically so a compound row's own `siblingMovementIds` — reconstructed server-side when the row
   * was first loaded, carried unchanged in `pendingMakerQueueDeleteRow` — cascade correctly; the generic
   * path's own cascade only works via same-session in-memory state this cross-session flow never has.
   * Stays on the reconstructed screen (busy state via `actionBusy`) until the delete call actually
   * settles, then returns to Maker Queue either way — same "wait for the async result before resetting
   * the screen" convention `release()` already follows, not an optimistic immediate navigation.
   */
  onDeletePendingReviewConfirmed(): void {
    const row = this.pendingMakerQueueDeleteRow;
    if (!row) return;
    this.actionBusy = true;
    this.makerQueue.deletePending(row, () => {
      this.actionBusy = false;
      this.pendingMakerQueueDeleteRow = null;
      this.selectMode('MAKER_QUEUE');
    });
  }

  /** The Maker reviewed and declined — no delete call was ever made. Discards the pending row and returns to Maker Queue. */
  onDeletePendingReviewCancelled(): void {
    this.pendingMakerQueueDeleteRow = null;
    this.selectMode('MAKER_QUEUE');
  }

  /** Kept current by `MakerPanelComponent`'s `contextChanged` output. */
  onMakerContextChanged(ctx: MakerCheckerContext): void {
    this.makerContext = ctx;
  }

  /** Caches the Maker's last-known lcNumber/instrumentType — needed once the Maker screen has already been reset (see `refreshLookUpForLastMakerContext()`), not just for `onCheckerQueueLoadSucceeded()`. */
  private lastMakerSync: { lcNumber: string; instrumentType: InstrumentType | undefined } | null = null;

  onMakerSyncRequested(e: MakerSyncRequest): void {
    this.checkerSyncSignal = { lcNumber: e.lcNumber, secondaryRef: e.secondaryRef };
    this.lastMakerSync = { lcNumber: e.lcNumber, instrumentType: e.instrumentType };
    if (e.alsoSyncLookup && e.instrumentType) {
      this.lookUp.syncFrom(e.lcNumber, e.instrumentType, () => this.closeAccountEntryDialog());
      this.scrollCheckerIntoView();
    }
  }

  /**
   * See `checkerPanelEl`'s own doc comment for the full "why". A no-op harmlessly whenever the Checker
   * panel is hidden (`pendingMakerQueueDeleteRow` — Maker Queue's own Delete Pending review, which
   * deliberately has no Checker panel at all) — the `@ViewChild` itself is simply `undefined` then.
   */
  private scrollCheckerIntoView(): void {
    this.checkerPanelEl?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Common Requirement: every successful Maker Submit or Checker Release refreshes Look Up Current
   * Balance. `MakerPanelComponent`'s own `emitCheckerAndLookupSync()` already covers every success path
   * that leaves the Maker screen populated (it reads the still-live `contextLcNumber`) — this helper
   * covers the one case where the screen was ALREADY reset first (a compound Checker Release's
   * `selectFunction()` call), using the cached `lastMakerSync` since the Maker's own state is gone by then.
   */
  private refreshLookUpForLastMakerContext(): void {
    if (this.lastMakerSync?.instrumentType) {
      this.lookUp.syncFrom(this.lastMakerSync.lcNumber, this.lastMakerSync.instrumentType, () => this.closeAccountEntryDialog());
    }
  }

  /**
   * Maker Result panel's "Account Entries" buttons, emitted from `MakerPanelComponent`.
   *
   * Business-confirmed 2026-08-27 ("Transaction Status 與 Account Entries Status 必須保持一致") — was
   * dropping `e.phase`, so the View Voucher dialog opened from A4's own MAKER RESULT panel kept showing
   * "EARMARKED" for an in-progress A4 record even after the Status line right above the button had
   * already been fixed — see `MakerPanelComponent.resultPhase`'s own doc comment. Now forwards it the
   * same way `onInquireOpenAccountEntries()` below already does.
   *
   * Business-reported gap 2026-08-28 ("A6 Maker Account Entries 只顯示一套") — same root cause and same
   * fix as the Checker's own pre-Release button (`openCheckerAccountEntryDialog()`'s own doc comment):
   * `e.movement` is the raw `createMovement()` response, never a merged `InquiredEvent`. Delegates to the
   * same shared `openAccountEntryDialogWithLinkedResolution()`.
   */
  onMakerOpenAccountEntries(e: { movement: BalanceMovement; instrumentType: InstrumentType | null; phase?: 'primary' | 'create' | 'finalize' | null }): void {
    this.openAccountEntryDialogWithLinkedResolution(e.movement, e.instrumentType, e.phase ?? undefined);
  }

  /** Inquire Events' own "Original Transaction Screen" Account Entries button, emitted from `InquireEventsComponent` — same convention as `onMakerOpenAccountEntries()` above. Forwards `e.linkedMovement` (A6's own cascade-linked second Account Entries set — see `InquiredEvent.linkedMovement`'s own doc comment) so the dialog can show both sets for one merged row. */
  onInquireOpenAccountEntries(e: InquireOpenAccountEntriesEvent): void {
    this.openAccountEntryDialog(e.movement, e.instrumentType, e.phase, e.linkedMovement ?? null);
  }

  private describeApiError(err: any): string {
    return describeApiErrorShared(err);
  }

  displayStatus(
    status: string,
    instrumentType?: InstrumentType | string | null,
    movementType?: string | null,
    phase?: 'primary' | 'create' | 'finalize' | null,
    acknowledgedAt?: string | null,
  ): string {
    return displayStatusShared(status, instrumentType, movementType, phase, acknowledgedAt);
  }

  statusBadgeClass(
    status: string,
    instrumentType?: InstrumentType | string | null,
    movementType?: string | null,
    phase?: 'primary' | 'create' | 'finalize' | null,
    acknowledgedAt?: string | null,
  ): string {
    return statusBadgeClassShared(status, instrumentType, movementType, phase, acknowledgedAt);
  }

  /** Contract-level ContractStatus (ACTIVE/CLOSED/...) — a different enum from statusBadgeClass()'s own MovementStatus, see contractStatusBadgeClass()'s own doc comment. Thin delegation, same convention as displayStatus()/statusBadgeClass(). */
  contractStatusBadgeClass(status: string): string {
    return contractStatusBadgeClassShared(status);
  }

  /** P2 UI/UX pass — thin delegation, same convention as `displayStatus()`/`statusBadgeClass()`. */
  functionActionIcon(code: string) {
    return functionActionIconShared(code);
  }

  /** P2 UI/UX pass — thin delegation, same convention as `displayStatus()`/`statusBadgeClass()`. */
  statusBadgeIcon(badgeClass: string) {
    return statusBadgeIconShared(badgeClass);
  }

  /** Thin delegation, same convention as `displayStatus()`/`statusBadgeClass()`. */
  displayMovementType(
    instrumentType: InstrumentType | string | null | undefined,
    movementType: string | null | undefined,
    amount: string | number | null | undefined,
  ): string {
    return displayMovementTypeShared(instrumentType, movementType, amount);
  }

  displayMovementAmount(
    instrumentType: InstrumentType | string | null | undefined,
    movementType: string | null | undefined,
    amount: string | null | undefined,
  ): string {
    return displayMovementAmountShared(instrumentType, movementType, amount);
  }

  openAccountEntryDialog(
    movement: BalanceMovement,
    instrumentType: InstrumentType | null | undefined,
    phase?: 'primary' | 'create' | 'finalize',
    linkedMovement?: BalanceMovement | null,
  ): void {
    this.accountEntryDialogMovement = movement;
    this.accountEntryDialogInstrumentType = instrumentType ?? null;
    this.accountEntryDialogPhase = phase ?? null;
    this.accountEntryDialogLinkedMovement = linkedMovement ?? null;
  }

  /**
   * A6/B4 Accounting Event Ownership Rule (business-reported gap 2026-08-28, "只看到一組 Account Entries
   * for Acceptance. Where is the Account Entries (Pending) for reverse LC Balance?") — the Checker's own
   * pre-Release "Account Entries" button has only the raw `selectedCheckerMovement`, never a merged
   * `InquiredEvent` (no event list is loaded on this screen), so it could never carry a `linkedMovement`
   * the way Inquire Events/Look Up's own merged rows do. Delegates to `openAccountEntryDialogWithLinkedResolution()`
   * — see that method's own doc comment.
   */
  openCheckerAccountEntryDialog(): void {
    const movement = this.selectedCheckerMovement;
    if (!movement) return;
    // Bug fixed 2026-08-29 (live-reported, "A4 Checker View Voucher shows EARMARKED 不對 應該是PENDING")
    // — never passed `phase` at all, so a still-PENDING A4-in-progress record (the SAME underlying A3/
    // A3S UTILIZE row, no movement of A4's own) fell back to A3's own EARMARKING/EARMARKED label. Same
    // derivation rule as `MakerPanelComponent.resultPhase` (its own doc comment records the identical
    // gap for the Maker Result panel, fixed earlier the same way): `releasesExistingMovementInPlace` is
    // A4's own unique strategy flag, true only while A4 itself is selected, so this can't misfire for any
    // other Function's own selectedCheckerMovement.
    const phase = this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace && movement.makerSubmittedAt ? 'finalize' : undefined;
    this.openAccountEntryDialogWithLinkedResolution(movement, this.selectedFunction?.instrumentType, phase);
  }

  /**
   * Opens the dialog immediately with what's already known (unchanged UX — no wait for a single-set
   * view), then resolves the same `linkedMovement` a merged Inquire Events/Look Up row would already
   * carry and fills it in once it arrives. Guarded against a stale response landing after the caller has
   * already moved on to a different movement/closed the dialog. Shared by both `openCheckerAccountEntryDialog()`
   * above and `onMakerOpenAccountEntries()` below — the SAME gap (only the raw movement, no merged event
   * list) exists on both the Maker Result panel's and the Checker's own pre-Release screen (business-
   * reported both 2026-08-28: the Checker case, then the Maker Result panel case immediately after — "A6
   * Maker Account Entries 只顯示一套").
   */
  private openAccountEntryDialogWithLinkedResolution(
    movement: BalanceMovement,
    instrumentType: InstrumentType | null | undefined,
    phase?: 'primary' | 'create' | 'finalize',
  ): void {
    this.openAccountEntryDialog(movement, instrumentType, phase);
    this.resolveLinkedAccountingMovement(movement, instrumentType).subscribe((linked) => {
      if (!linked || this.accountEntryDialogMovement?.movementId !== movement.movementId) return;
      this.accountEntryDialogLinkedMovement = linked;
    });
  }

  /**
   * Mirrors `mergeAccountingEventRows()`'s own shapes (inquire-events.service.ts) plus one it deliberately
   * does NOT cover, resolved on demand since neither the Checker's own screen nor the Maker Result panel
   * ever has a merged event list to read a `linkedMovement` off of:
   * - **A6** (`IPLC_ACCEPTANCE`, `referencedTransactionId`): the referenced UTILIZE lives on the PARENT
   *   LC's own contract, resolved by natural key (`getContract()` for the Acceptance's own lcNumber, then
   *   `resolveContract('IPLC_LC', ...)`, then `listMovements()` to find the exact referenced record) — no
   *   "get movement by id" endpoint exists, so this is the only path.
   * - **B4** (`EPLC_CONFIRMATION/ACCEPT` only — HONOUR's own second leg is an ON_BALANCE_ASSET instrument
   *   with no contingentAccountEntry to link, same scoping `mergeAccountingEventRows()` already uses) and
   *   **A3S** (`IPLC_LC/UTILIZE` with its own `businessEventId` set — plain A3/A4/A6-referenced UTILIZEs
   *   never carry one, only A3S's own compound Submit does — and, viewed from the OTHER side, `SHGT/
   *   FULL_REDEEM|PARTIAL_REDEEM`): all three share their own linked leg's `businessEventId`, resolved via
   *   the existing `findByBusinessEventId()` (already used by `CheckerActionsService`'s own cross-session
   *   release fix). A3S is deliberately NOT folded into one ROW by `mergeAccountingEventRows()` (its own
   *   two legs are genuinely different real events, see that function's own doc comment) — this is a
   *   narrower fix: a single Checker Release click genuinely approves BOTH legs at once for A3S too
   *   (`CheckerActionsService.release()`'s own `documentArrivalWithSg` branch), so the same "見到帳再決定"
   *   (F1 §14.4) principle applies to reviewing it beforehand, independent of the row-merge question.
   *
   * Works identically for A6 right after Submit (the Maker Result panel case, `businessEventId` unset —
   * A6's own cascade always uses `referencedTransactionId`) and for B4/A3S right after Submit (their own
   * `businessEventId` is already set by `MakerSubmitService`'s own compound-submit code at that point, so
   * the SAME businessEventId branch below resolves it there too, no Maker-vs-Checker distinction needed).
   *
   * Resolves `null`, not an error, on any failure — the dialog simply stays single-set, no worse than
   * before this fix.
   */
  private resolveLinkedAccountingMovement(movement: BalanceMovement, instrumentType: InstrumentType | null | undefined): Observable<BalanceMovement | null> {
    if (instrumentType === 'IPLC_ACCEPTANCE' && movement.referencedTransactionId) {
      const referencedId = movement.referencedTransactionId;
      return this.api.getContract(movement.balanceContractId).pipe(
        switchMap((acceptanceContract) => this.api.resolveContract('IPLC_LC', { lcNumber: acceptanceContract.naturalKey.lcNumber })),
        switchMap((lcContract) => this.api.listMovements(lcContract.balanceContractId)),
        map((movements) => movements.find((m) => m.movementId === referencedId && m.status !== 'CANCELLED') ?? null),
        catchError(() => of(null)),
      );
    }
    // 2026-08-28 (live-reported, "S01 A35 已經把SG的帳沖掉了 所以A4 不需再冲SG的帳 只要冲LC的帳即可") —
    // the IPLC_LC/UTILIZE branch below is ONLY correct while this SAME record is still under A3S's own
    // pre-Release Checker review (F1 §14.4, "見到帳再決定") — its own SG leg is genuinely still PENDING
    // then, and A3S's Checker Release is what finalizes BOTH legs together. Once `acknowledgedAt` is set
    // (A3S's own Checker has already Released — the SG leg is ALREADY independently, permanently booked,
    // "沖帳" already happened), this SAME UTILIZE record moves on to being A4's own business (Sight
    // Settlement finalizes the LC side alone, `resultPhase === 'finalize'`) — merging in the SG leg here
    // would show an already-closed, unrelated business event as if it were still part of THIS one.
    // `!movement.acknowledgedAt` scopes the merge to exactly A3S's own pre-Release window, matching this
    // exact same "still A3/A3S's own business until acknowledgedAt" rule `isFinalizing()`/`functionFor()`
    // (maker-queue.service.ts) already use elsewhere for the identical A3S→A4 handoff question. The other
    // two branches (B4/SHGT) are unaffected — B4's own compound Submit creates both legs in ONE call, no
    // staged Maker/Checker handoff to gate on.
    const businessEventIdEligible =
      (instrumentType === 'EPLC_CONFIRMATION' && movement.movementType === 'ACCEPT') ||
      (instrumentType === 'IPLC_LC' && movement.movementType === 'UTILIZE' && !movement.acknowledgedAt) ||
      (instrumentType === 'SHGT' && (movement.movementType === 'FULL_REDEEM' || movement.movementType === 'PARTIAL_REDEEM'));
    if (businessEventIdEligible && movement.businessEventId) {
      return this.api.findByBusinessEventId(movement.businessEventId).pipe(
        map((linked) => linked.find((m) => m.movementId !== movement.movementId && m.status !== 'CANCELLED' && m.contingentAccountEntry) ?? null),
        catchError(() => of(null)),
      );
    }
    return of(null);
  }

  closeAccountEntryDialog(): void {
    this.accountEntryDialogMovement = null;
    this.accountEntryDialogInstrumentType = null;
    this.accountEntryDialogPhase = null;
    this.accountEntryDialogLinkedMovement = null;
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.accountEntryDialogMovement) this.closeAccountEntryDialog();
  }

  onLookUpClick(): void {
    this.lookUp.runLookup(() => this.closeAccountEntryDialog());
  }

  /** The `submitResult` branch is unreachable via any real function today — `settlesDocumentArrival` is unconditional on B4 and always matches first. */
  get isCheckerCompoundOwnSubmission(): boolean {
    if (!this.selectedCheckerMovement) return false;
    if (this.selectedFunctionStrategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg')) {
      return this.selectedCheckerMovement.movementType === 'UTILIZE' && !!this.selectedCheckerMovement.businessEventId;
    }
    if (this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'SETTLE') {
      return (
        (this.selectedCheckerMovement.movementType === 'FULL_SETTLE' || this.selectedCheckerMovement.movementType === 'PARTIAL_SETTLE') &&
        !!this.selectedCheckerMovement.businessEventId
      );
    }
    if (this.selectedFunctionStrategy?.checkerRelease.settlesDocumentArrival) {
      return !!this.selectedCheckerMovement.referencedTransactionId;
    }
    if (this.selectedCheckerMovement.movementId !== this.makerContext.submitResult?.movementId) return false;
    if (this.selectedFunctionStrategy?.compoundSubmission.possibleShapes.includes('confirmationHonourWithReceivable')) {
      return this.selectedCheckerMovement.movementType === 'HONOUR';
    }
    return false;
  }

  get checkerActionInFlight(): boolean {
    return this.checkerBusy || this.actionBusy;
  }

  get isArrivalAcknowledgmentStep(): boolean {
    return (
      !!this.selectedCheckerMovement &&
      this.selectedCheckerMovement.movementType === 'UTILIZE' &&
      !!(
        this.selectedFunctionStrategy?.checkerRelease.deferSettlement ||
        this.selectedFunctionStrategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg')
      )
    );
  }

  get checkerActionButtonLabel(): string {
    if (this.checkerBusy) return 'Working…';
    if (this.selectedFunctionStrategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg') && this.isCheckerCompoundOwnSubmission) {
      return 'Release (Shipping Guarantee redemption)';
    }
    if (this.isArrivalAcknowledgmentStep) return 'Approve';
    return 'Release';
  }

  get arrivalAlreadyApproved(): boolean {
    return this.arrivalApproved || !!this.selectedCheckerMovement?.acknowledgedAt;
  }

  onCheckerMovementPicked(movement: BalanceMovement | null): void {
    this.selectedCheckerMovement = movement;
    this.arrivalApproved = false;
  }

  onCheckerQueueReloaded(): void {
    this.checkerError = null;
  }

  /** See `lastMakerSync`/`refreshLookUpForLastMakerContext()` — reads the Maker's last-known context, not the Checker's. */
  onCheckerQueueLoadSucceeded(): void {
    this.refreshLookUpForLastMakerContext();
  }

  approveArrival(): void {
    this.arrivalApproved = true;
  }

  /**
   * A3 only (plain, deferSettlement without an SG match) — restored 2026-08-20 ("A3 A3S 交易 Approve
   * 過後 不要再顯示"): persists the Checker's own acknowledgment via CheckerActionsService instead of the
   * former purely client-side approveArrival(), then reloads the Checker Queue in place so the
   * now-approved item stops reappearing (see checkerQueueRefreshNonce's own doc comment).
   */
  acknowledgeArrival(): void {
    this.actionBusy = true;
    this.checkerActions.acknowledgeArrival(this.buildCheckerActionContext()).subscribe((outcome) => {
      this.actionBusy = false;
      this.forwardOutcomeToMaker(outcome);
    });
  }

  /**
   * Forwards a non-special outcome to `MakerPanelComponent` via `makerOutcomeSignal`. Also reloads the
   * Checker Queue in place for any outcome that genuinely changed a movement's state — 'released' (e.g.
   * reject()'s own success, which never resets the whole screen the way release()'s
   * own selectFunction() call does) and 'documentArrivalAcknowledged' (A3S) — never for 'failed'. Same
   * unification as checkerAct()'s own plain path (see checkerQueueRefreshNonce's own doc comment).
   * Also refreshes Look Up Current Balance (Common Requirement — every successful Maker Submit or
   * Checker Release/Acknowledge refreshes it), so the Event Timeline's own EARMARKING -> EARMARKED flip
   * (business instruction 2026-08-20, "狀態必須是 EARMARKED") shows without a manual re-search.
   */
  private forwardOutcomeToMaker(outcome: CheckerActionOutcome): void {
    this.makerOutcomeSignal = { ...outcome };
    if (outcome.kind === 'documentArrivalAcknowledged') this.arrivalApproved = true;
    if (outcome.kind !== 'failed') {
      this.checkerQueueRefreshNonce++;
      this.refreshLookUpForLastMakerContext();
    }
  }

  /**
   * A successful Release resets the screen for a new transaction via `selectFunction()`.
   *
   * Bug fixed (business-reported 2026-08-21, "B4 Submit 後跳出交易 再進入B4 SEARCH... 點選RELEASE =>
   * 無法處理" — B4 Submit, leave the screen, re-enter B4, search independently, click Release => nothing
   * happens): this guard used to require `makerContext.submitResult` (the CURRENT session's own Maker
   * state) alone — but `isCheckerCompoundOwnSubmission`'s own `settlesDocumentArrival` branch (B4/A6)
   * routes here based purely on `selectedCheckerMovement.referencedTransactionId` being set, true for
   * EVERY B4/A6 movement regardless of which session Submitted it — so a genuinely independent Checker
   * search (submitResult null in THIS session) silently no-opped right here, before ever calling the
   * API. `buildCheckerActionContext()`/`checkerActions.release()` below already prefer
   * `selectedCheckerMovement` over `submitResult` throughout (that field's own doc comment: "always real
   * server data... for a genuinely separate Checker session") — this guard now mirrors that same
   * either/or, rather than requiring specifically THIS session's own submitResult.
   */
  release(): void {
    if (!this.selectedCheckerMovement && !this.makerContext.submitResult?.movementId) return;
    this.actionBusy = true;
    const fn = this.selectedFunction;
    this.checkerActions.release(this.buildCheckerActionContext()).subscribe((outcome) => {
      this.actionBusy = false;
      if (fn && outcome.kind === 'released') {
        this.selectFunction(fn);
        this.refreshLookUpForLastMakerContext();
        this.releaseSuccessHint = `Release completed (movement ${outcome.result.movementId}) — screen reset for a new ${fn.code} (${fn.label}) transaction.`;
        return;
      }
      this.forwardOutcomeToMaker(outcome);
    });
  }

  private buildCheckerActionContext(): CheckerActionContext {
    return {
      submitResult: this.makerContext.submitResult,
      selectedFunction: this.selectedFunction,
      selectedPayMovement: this.makerContext.selectedPayMovement,
      matchedReceivableMovementId: this.makerContext.matchedReceivableMovementId,
      dueFromIssuingBankMovementId: this.makerContext.dueFromIssuingBankMovementId,
      acceptanceMovementId: this.makerContext.acceptanceMovementId,
      acceptanceReimbReceivableMovementId: this.makerContext.acceptanceReimbReceivableMovementId,
      arrivalSgRedeemMovementId: this.makerContext.arrivalSgRedeemMovementId,
      createdBy: this.makerContext.createdBy,
      selectedCheckerMovement: this.selectedCheckerMovement,
    };
  }

  /** A3/A3S (deferSettlement), A3S (documentArrivalWithSg), A6/B4 (settlesDocumentArrival) compound routing. */
  checkerAct(action: 'release' | 'reject'): void {
    if (!this.selectedCheckerMovement) return;
    const movementId = this.selectedCheckerMovement.movementId;

    if (this.isCheckerCompoundOwnSubmission) {
      if (action === 'release') this.release();
      else this.reject();
      return;
    }

    if (
      action === 'release' &&
      this.selectedFunctionStrategy?.checkerRelease.deferSettlement &&
      this.selectedCheckerMovement.movementType === (this.selectedFunction?.deferSettlementMovementType ?? 'UTILIZE')
    ) {
      this.acknowledgeArrival();
      return;
    }

    if (
      action === 'release' &&
      this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace &&
      !this.selectedCheckerMovement.makerSubmittedAt
    ) {
      this.checkerError = 'This Document Arrival has not been Submitted by a Maker yet (A4) — go to the Maker section above, pick it, and Submit first.';
      return;
    }

    this.checkerBusy = true;
    this.checkerError = null;
    const obs = action === 'release' ? this.api.release(movementId, this.checkerId) : this.api.reject(movementId, this.checkerId, 'MANUAL_QUEUE_REJECT');
    obs.subscribe({
      next: () => {
        this.checkerBusy = false;
        // Plain path never touches submitResult; refreshRequested tells MakerPanelComponent to
        // refresh its own snapshot + re-sync instead. checkerQueueRefreshNonce reloads the Checker's
        // own queue in place — business instruction 2026-08-20 ("純粹 APPROVE PENDING 交易, APPROVED
        // 後該筆交易應該消失, 不能重複 APPROVED" — unified across every function, not just A3/A3S's own
        // acknowledgment path; repro'd live via S101/A2's plain Release leaving the just-Approved item
        // still listed).
        this.refreshNonce++;
        this.checkerQueueRefreshNonce++;
      },
      error: (err) => {
        this.checkerBusy = false;
        this.checkerError = this.describeApiError(err);
      },
    });
  }

  /** Same fix and reasoning as `release()`'s own doc comment immediately above — was gated on `submitResult` alone, silently no-opping for a genuinely independent Checker session on a B4/A6/A3S/B5-shaped movement. */
  reject(): void {
    if (!this.selectedCheckerMovement && !this.makerContext.submitResult?.movementId) return;
    this.actionBusy = true;
    this.checkerActions.reject(this.buildCheckerActionContext()).subscribe((outcome) => {
      this.actionBusy = false;
      this.forwardOutcomeToMaker(outcome);
    });
  }

  /**
   * Fix Pending (analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md §2.2/§15/§19,
   * 2026-08-27; per-field config 2026-08-28, "頁面配置檔 for A1-A11/B1-B7") — same Checker-action-layer
   * boundary as `release()`/`reject()`; `checkerActions.editPending()` itself stays
   * generic (see its own doc comment), the `fixPendingEditableFields` gate lives in `function-strategy.ts`
   * (via `MakerPanelComponent.confirmFixPending()`, which decides what goes into `event`), not here — this
   * method is a pure pass-through of whatever patch the panel already built.
   */
  fixPending(event: Record<string, unknown> & { movementId: string }): void {
    if (
      !this.makerContext.submitResult?.movementId ||
      this.makerContext.submitResult.movementId !== event.movementId ||
      (this.makerContext.submitResult.status !== 'PENDING' && this.makerContext.submitResult.status !== 'REJECTED')
    )
      return;
    const { movementId: _movementId, ...patch } = event;
    this.actionBusy = true;
    this.checkerActions.editPending(this.buildCheckerActionContext(), patch as Omit<EditMovementRequest, 'editedBy'>).subscribe((outcome) => {
      this.actionBusy = false;
      this.forwardOutcomeToMaker(outcome);
    });
  }
}
