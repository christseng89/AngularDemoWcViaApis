import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormlyModule } from '@ngx-formly/core';
import { IndexPickerComponent } from './index-picker.component';
import { BalanceComponentApiService, BalanceMovement } from './balance-component-api.service';
import { CheckerActionContext, CheckerActionOutcome, CheckerActionsService } from './checker-actions.service';
import { LookUpPanelService } from './look-up-panel.service';
import { InquireEventsService } from './inquire-events.service';
import { describeApiError as describeApiErrorShared } from './api-error';
import {
  EXPORT_FUNCTIONS,
  IMPORT_FUNCTIONS,
  InstrumentType,
  TransactionFunction,
  displayStatus as displayStatusShared,
  statusBadgeClass as statusBadgeClassShared,
  displayMovementType as displayMovementTypeShared,
  displayMovementAmount as displayMovementAmountShared,
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
  imports: [CommonModule, FormsModule, FormlyModule, IndexPickerComponent, AccountEntriesDialogComponent, CheckerPanelComponent, MakerPanelComponent],
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

  /** Caches the Maker's last-known lcNumber/instrumentType for `onCheckerQueueLoadSucceeded()` — needs the Maker's value, not the Checker's. */
  private lastMakerSync: { lcNumber: string; instrumentType: InstrumentType | undefined } | null = null;

  onMakerSyncRequested(e: MakerSyncRequest): void {
    this.checkerSyncSignal = { lcNumber: e.lcNumber, secondaryRef: e.secondaryRef };
    this.lastMakerSync = { lcNumber: e.lcNumber, instrumentType: e.instrumentType };
    if (e.alsoSyncLookup && e.instrumentType) {
      this.lookUp.syncFrom(e.lcNumber, e.instrumentType, () => this.closeAccountEntryDialog());
    }
  }

  /** Maker Result panel's "Account Entries" buttons, emitted from `MakerPanelComponent`. */
  onMakerOpenAccountEntries(e: { movement: BalanceMovement; instrumentType: InstrumentType | null }): void {
    this.openAccountEntryDialog(e.movement, e.instrumentType);
  }

  private describeApiError(err: any): string {
    return describeApiErrorShared(err);
  }

  displayStatus(
    status: string,
    instrumentType?: InstrumentType | string | null,
    movementType?: string | null,
    phase?: 'primary' | 'create' | 'finalize' | null,
  ): string {
    return displayStatusShared(status, instrumentType, movementType, phase);
  }

  statusBadgeClass(
    status: string,
    instrumentType?: InstrumentType | string | null,
    movementType?: string | null,
    phase?: 'primary' | 'create' | 'finalize' | null,
  ): string {
    return statusBadgeClassShared(status, instrumentType, movementType, phase);
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

  /** See `lastMakerSync` — reads the Maker's last-known context, not the Checker's. */
  onCheckerQueueLoadSucceeded(): void {
    if (this.lastMakerSync?.instrumentType) {
      this.lookUp.syncFrom(this.lastMakerSync.lcNumber, this.lastMakerSync.instrumentType, () => this.closeAccountEntryDialog());
    }
  }

  approveArrival(): void {
    this.arrivalApproved = true;
  }

  /** Forwards a non-special outcome to `MakerPanelComponent` via `makerOutcomeSignal`. */
  private forwardOutcomeToMaker(outcome: CheckerActionOutcome): void {
    this.makerOutcomeSignal = { ...outcome };
    if (outcome.kind === 'documentArrivalAcknowledged') this.arrivalApproved = true;
  }

  /** A successful Release resets the screen for a new transaction via `selectFunction()`. */
  release(): void {
    if (!this.makerContext.submitResult?.movementId) return;
    this.actionBusy = true;
    const fn = this.selectedFunction;
    this.checkerActions.release(this.buildCheckerActionContext()).subscribe((outcome) => {
      this.actionBusy = false;
      if (fn && outcome.kind === 'released') {
        this.selectFunction(fn);
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
      this.approveArrival();
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
        // refresh its own snapshot + re-sync instead.
        this.refreshNonce++;
      },
      error: (err) => {
        this.checkerBusy = false;
        this.checkerError = this.describeApiError(err);
      },
    });
  }

  reject(): void {
    if (!this.makerContext.submitResult?.movementId) return;
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
