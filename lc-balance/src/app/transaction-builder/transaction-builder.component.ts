import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormlyModule } from '@ngx-formly/core';
import { IndexPickerComponent } from './index-picker.component';
import { TbIconComponent } from '../tb-icon.component';
import { BalanceComponentApiService, BalanceMovement } from './balance-component-api.service';
import { CheckerActionContext, CheckerActionOutcome, CheckerActionsService } from './checker-actions.service';
import { LookUpPanelService } from './look-up-panel.service';
import { InquireEventsService } from './inquire-events.service';
import { InquireEventsComponent, InquireOpenAccountEntriesEvent } from './inquire-events.component';
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
  ],
  templateUrl: './transaction-builder.component.html',
  styleUrl: './transaction-builder.component.scss',
  providers: [LookUpPanelService, InquireEventsService],
})
export class TransactionBuilderComponent {
  readonly importFunctions = IMPORT_FUNCTIONS;
  readonly exportFunctions = EXPORT_FUNCTIONS;

  activeFunctionSide: 'IMPORT' | 'EXPORT' = 'IMPORT';
  activeMode: 'PROCESSING' | 'INQUIRE' = 'PROCESSING';
  selectedFunction: TransactionFunction | null = null;

  get selectedFunctionStrategy() {
    return this.selectedFunction ? deriveFunctionStrategy(this.selectedFunction) : null;
  }

  /** Checker release/reject targets — CheckerPanelComponent owns search/queue. */
  selectedCheckerMovement: BalanceMovement | null = null;
  checkerBusy = false;
  checkerError: string | null = null;
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

  accountEntryDialogMovement: BalanceMovement | null = null;
  accountEntryDialogInstrumentType: InstrumentType | null = null;
  accountEntryDialogPhase: 'primary' | 'create' | 'finalize' | null = null;

  /** Constructor params default-construct their own service so `new TransactionBuilderComponent(mockApi)` still works in tests; `lookUp`/`inquireEvents` are also registered in `providers` above (not `providedIn: 'root'`). */
  constructor(
    private readonly api: BalanceComponentApiService,
    private readonly checkerActions: CheckerActionsService = new CheckerActionsService(api),
    readonly lookUp: LookUpPanelService = new LookUpPanelService(api),
    readonly inquireEvents: InquireEventsService = new InquireEventsService(api),
  ) {}

  selectMode(mode: 'PROCESSING' | 'INQUIRE'): void {
    this.activeMode = mode;
    this.accountEntryDialogMovement = null;
    this.accountEntryDialogInstrumentType = null;
    this.accountEntryDialogPhase = null;
    if (mode === 'INQUIRE') {
      this.inquireEvents.loadIndex();
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
    this.selectedFunction = fn;
    this.activeFunctionSide = fn.side;
    this.lookUp.resetForSide(fn.side);
    this.releaseSuccessHint = null;
    this.arrivalApproved = false;
    this.accountEntryDialogMovement = null;
    this.accountEntryDialogInstrumentType = null;
    this.accountEntryDialogPhase = null;
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
    }
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

  /** Maker Result panel's "Account Entries" buttons, emitted from `MakerPanelComponent`. */
  onMakerOpenAccountEntries(e: { movement: BalanceMovement; instrumentType: InstrumentType | null }): void {
    this.openAccountEntryDialog(e.movement, e.instrumentType);
  }

  /** Inquire Events' own "Original Transaction Screen" Account Entries button, emitted from `InquireEventsComponent` — same convention as `onMakerOpenAccountEntries()` above. */
  onInquireOpenAccountEntries(e: InquireOpenAccountEntriesEvent): void {
    this.openAccountEntryDialog(e.movement, e.instrumentType, e.phase);
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

  openAccountEntryDialog(movement: BalanceMovement, instrumentType: InstrumentType | null | undefined, phase?: 'primary' | 'create' | 'finalize'): void {
    this.accountEntryDialogMovement = movement;
    this.accountEntryDialogInstrumentType = instrumentType ?? null;
    this.accountEntryDialogPhase = phase ?? null;
  }

  closeAccountEntryDialog(): void {
    this.accountEntryDialogMovement = null;
    this.accountEntryDialogInstrumentType = null;
    this.accountEntryDialogPhase = null;
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
    if (this.isArrivalAcknowledgmentStep) return 'Approve (acknowledgment only)';
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
   * reject()/deleteMakerPending()'s own success, which never resets the whole screen the way release()'s
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

  deleteMakerPending(): void {
    if (!this.makerContext.submitResult?.movementId || this.makerContext.submitResult.status !== 'PENDING') return;
    this.actionBusy = true;
    this.checkerActions.deleteMakerPending(this.buildCheckerActionContext()).subscribe((outcome) => {
      this.actionBusy = false;
      this.forwardOutcomeToMaker(outcome);
    });
  }
}
