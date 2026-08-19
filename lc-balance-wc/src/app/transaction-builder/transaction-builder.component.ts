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
} from './balance-component.model';
import { AccountEntriesDialogComponent } from './account-entries-dialog.component';
import { CheckerPanelComponent, CheckerSyncSignal } from './checker-panel.component';
import { MakerCheckerContext, MakerPanelComponent, MakerSyncRequest } from './maker-panel.component';
import { deriveFunctionStrategy } from './function-strategy';

/**
 * Transaction Builder — organized as named Import (A-series) / Export
 * (B-series) business functions (business instruction 2026-08-14, "similar
 * as Payment Component A1-A4, B1-B5"), not a raw instrumentType/
 * movementType picker. Selecting a function pins the instrumentType (and, for
 * functions with only one legal movementType, the movementType too) so the
 * remaining form only ever asks for what that specific function actually
 * needs — see balance-component.model.ts's IMPORT_FUNCTIONS/EXPORT_FUNCTIONS
 * for the full mapping back to Design doc §5 movementTypes.
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

  /**
   * BAL-003 "Feature Components + Facade" pilot #3 (2026-08-19, desiger-comments.md — Phase 2 of the
   * 8-phase architecture proposal). Owns everything Checker-related that stayed on the parent after Phase
   * 1's `CheckerPanelComponent` extraction (`selectedCheckerMovement`/`checkerBusy`/`checkerError`/
   * `checkerId`/`checkerAct()`/`release()`/`reject()`/`approveArrival()`/`isCheckerCompoundOwnSubmission`
   * — see this file's own CLAUDE.md history for why those genuinely belong here, not on either child), PLUS
   * a new mirror of the Maker-side fields that action layer needs (`makerContext`) since `MakerPanelComponent`
   * now owns `submitResult`/the 4 compound movementIds/`selectedPayMovement`/`createdBy` directly. The
   * mirror is updated via `onMakerContextChanged()`, the SAME "child owns the write, parent keeps a
   * read-only mirror via an Output event" convention `CheckerPanelComponent`'s own `movementPicked` output
   * already established in Phase 1 — never a direct instance reference into the child.
   */
  selectedCheckerMovement: BalanceMovement | null = null;
  checkerBusy = false;
  checkerError: string | null = null;
  checkerId = 'checker1';
  checkerSyncSignal: CheckerSyncSignal | null = null;
  /** Public so the template can bind `[resetTrigger]="checkerResetNonce"` on BOTH children — Angular templates can only read public members. Shared between CheckerPanelComponent/MakerPanelComponent: both children need to know "the function changed, reset yourself" at the identical trigger point, so one counter serves both. */
  checkerResetNonce = 0;

  actionBusy = false;
  releaseSuccessHint: string | null = null;
  arrivalApproved = false;

  /**
   * See `MakerCheckerContext`'s own doc comment (maker-panel.component.ts). `submitResult`/
   * `selectedPayMovement`/the 4 compound movementIds/`createdBy` all live on `MakerPanelComponent` now —
   * this is the parent's own read-only mirror, kept current via `onMakerContextChanged()`, needed for
   * `buildCheckerActionContext()` and `isCheckerCompoundOwnSubmission`'s own (confirmed-unreachable-in-
   * practice, per that getter's own doc comment) `submitResult` branch.
   */
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

  /**
   * A signal object forwarded to `MakerPanelComponent`'s own `externalCheckerOutcome` `@Input()` — see
   * that component's own class doc comment for why this (fresh-object-per-emission, `ngOnChanges()`) is
   * the mechanism, not a direct instance reference. Every `release()`/`reject()`/`deleteMakerPending()`
   * outcome that isn't the special "release succeeded → whole-screen reset" case (handled separately,
   * via `selectFunction()`'s own existing reset flow, which ALSO reaches `MakerPanelComponent` via the
   * shared `checkerResetNonce`) flows through here.
   */
  makerOutcomeSignal: CheckerActionOutcome | null = null;
  /** Forwarded to `MakerPanelComponent`'s own `refreshRequested` `@Input()` — see that field's own doc comment for why `checkerAct()`'s PLAIN release/reject path (below) uses this instead of `makerOutcomeSignal`. */
  refreshNonce = 0;

  accountEntryDialogMovement: BalanceMovement | null = null;
  accountEntryDialogInstrumentType: InstrumentType | null = null;
  accountEntryDialogPhase: 'primary' | 'create' | 'finalize' | null = null;

  /**
   * desiger-comments.md F-04 (2026-08-19) — every dependency below uses the SAME construction style: a
   * constructor PARAMETER with a default value building the real thing, so `new
   * TransactionBuilderComponent(mockApi)` (the single-arg form 90+ existing tests across 4 spec files
   * already use) keeps working completely unmodified. `checkerActions` is unchanged throughout this
   * whole session's own F-04 history — it was already correctly `@Injectable({providedIn: 'root'})`.
   * `lookUp`/`inquireEvents` are registered via the component-scoped `providers` array above (F-04's own
   * proven fix — see that finding's own CLAUDE.md history for the full "NullInjectorError in production"
   * incident this pattern exists to avoid).
   */
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
   * BAL-003 pilot #3 (2026-08-19) — Maker-side reset (model/naturalKey/selectedContract/etc, all 30+
   * fields) now lives entirely on `MakerPanelComponent.resetForFunction()`, triggered by the SAME
   * `checkerResetNonce` counter this method already increments for `CheckerPanelComponent`'s own reset —
   * both children react to one shared signal. This method itself only resets what stays parent-owned.
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

  /** See `MakerCheckerContext`'s own doc comment — the parent's read-only mirror, kept current by `MakerPanelComponent`'s own `contextChanged` output. */
  onMakerContextChanged(ctx: MakerCheckerContext): void {
    this.makerContext = ctx;
  }

  /**
   * See `MakerSyncRequest`'s own doc comment (maker-panel.component.ts) — replaces the pre-extraction
   * `syncCheckerToContext()`/`syncLookupToContext()` private methods, both of which used to read
   * Maker-owned `model`/`naturalKey`/`selectedContract`/`selectedParent` directly. `lastMakerSync` caches
   * the Maker's own last-known lcNumber/instrumentType for `onCheckerQueueLoadSucceeded()`'s own use
   * below (that Output fires independently of this one, on every successful Checker queue load,
   * regardless of what caused it — see that method's own doc comment for why it still needs the Maker's
   * own value, not the Checker's, matching the pre-extraction original's own behavior exactly).
   */
  private lastMakerSync: { lcNumber: string; instrumentType: InstrumentType | undefined } | null = null;

  onMakerSyncRequested(e: MakerSyncRequest): void {
    this.checkerSyncSignal = { lcNumber: e.lcNumber, secondaryRef: e.secondaryRef };
    this.lastMakerSync = { lcNumber: e.lcNumber, instrumentType: e.instrumentType };
    if (e.alsoSyncLookup && e.instrumentType) {
      this.lookUp.syncFrom(e.lcNumber, e.instrumentType, () => this.closeAccountEntryDialog());
    }
  }

  /** MAKER RESULT panel's 3 "Account Entries" buttons, now emitted from `MakerPanelComponent` — see that component's own `openAccountEntries` output doc comment. */
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

  /**
   * Mirrors `TransactionBuilderComponent.isCheckerCompoundOwnSubmission`'s pre-extraction body exactly —
   * every field it reads (`selectedFunctionStrategy`, `selectedCheckerMovement`) is still parent-owned.
   * The one branch reading `submitResult` now reads `this.makerContext.submitResult` (the mirror) instead
   * of a direct field — this branch's own doc comment already establishes it's unreachable via any real
   * function object today (settlesDocumentArrival, unconditional on B4, always matches first), so this
   * mirror substitution carries zero practical behavior risk.
   */
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

  /** See `lastMakerSync`'s own doc comment — reads the Maker's own last-known context, not the Checker's, matching the pre-extraction original's own `syncLookupToContext()` call here exactly. */
  onCheckerQueueLoadSucceeded(): void {
    if (this.lastMakerSync?.instrumentType) {
      this.lookUp.syncFrom(this.lastMakerSync.lcNumber, this.lastMakerSync.instrumentType, () => this.closeAccountEntryDialog());
    }
  }

  approveArrival(): void {
    this.arrivalApproved = true;
  }

  /** Forwards a non-special outcome to `MakerPanelComponent` — see `makerOutcomeSignal`'s own doc comment. */
  private forwardOutcomeToMaker(outcome: CheckerActionOutcome): void {
    this.makerOutcomeSignal = { ...outcome };
    if (outcome.kind === 'documentArrivalAcknowledged') this.arrivalApproved = true;
  }

  /**
   * Business instruction 2026-08-17 ("After Release is successfully completed... automatically return to
   * the same transaction function and reset the screen"). Only a genuine `'released'` outcome triggers the
   * reset — re-invoking `selectFunction()` reaches BOTH children via the shared `checkerResetNonce`, so no
   * separate signal is needed for this path.
   */
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

  /**
   * A3 (deferSettlement) / A3S (documentArrivalWithSg) / A6-B4 (settlesDocumentArrival) compound routing —
   * mirrors `TransactionBuilderComponent.checkerAct()`'s pre-extraction body exactly. Every field/getter it
   * reads is still parent-owned; `makerSubmittedAt` is a persisted field on `selectedCheckerMovement`
   * itself (parent-owned), not Maker state, so no mirror substitution was needed for that branch.
   */
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
        // Mirrors the pre-extraction original exactly: this plain path never touched submitResult — a
        // Checker acting on an item found via their own independent search may have nothing to do with
        // any Maker session's own submitResult. refreshRequested tells MakerPanelComponent to refresh its
        // OWN selectedContract's snapshot + re-sync (both Maker-owned), without corrupting submitResult.
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
