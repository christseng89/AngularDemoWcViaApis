import { Component, EventEmitter, Inject, InjectionToken, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot, CreateMovementRequest } from './balance-component-api.service';
import { IndexPickerComponent } from './index-picker.component';
import { TbIconComponent } from '../tb-icon.component';
import { CheckerActionOutcome } from './checker-actions.service';
import { MakerSubmitContext, MakerSubmitOutcome, MakerSubmitService } from './maker-submit.service';
import { CatalogPickerService } from './catalog-picker.service';
import { DocumentArrivalHintsService } from './document-arrival-hints.service';
import { PayMovementSelectionOutcome, PickerSelectionService } from './picker-selection.service';
import { EligibilityRule, applyEligibilityRule } from './eligibility-rule';

/**
 * `CatalogPickerService` has no `@Injectable()` decorator, so it needs an explicit `useFactory` provider.
 * Three differently-sized instances need three `InjectionToken`s. Module-level `const`s, not class
 * members — the `providers` array sits outside the class body, so a class member wouldn't be visible there.
 */
const CATALOG_PAGE_SIZE = 100;
const PARENT_PAGE_SIZE = 100;
const IB_INDEX_PAGE_SIZE = 100;
const CATALOG_PICKER = new InjectionToken<CatalogPickerService>('MakerPanelComponent.catalogPicker');
const PARENT_PICKER = new InjectionToken<CatalogPickerService>('MakerPanelComponent.parentPicker');
const IB_INDEX_PICKER = new InjectionToken<CatalogPickerService>('MakerPanelComponent.ibIndexPicker');
import { describeApiError as describeApiErrorShared, notFoundMessage } from './api-error';
import {
  DECREASING_MOVEMENT_TYPES,
  InstrumentType,
  TransactionFunction,
  amountExceedsCurrencyDecimals,
  decimalPlacesForCurrency,
  displayMovementType,
  displayStatus as displayStatusShared,
  formatCurrencyAmount,
  groupThousands,
} from './balance-component.model';
import { BuilderFieldsContext, buildFields, isFixPendingFieldEditable, reconstructOriginalModel, toReadOnlyFields } from './builder-fields';
import {
  SubmitRulesContext,
  buildSubmitRequest as buildSubmitRequestRules,
  hasEligibleTargetSelected as hasEligibleTargetSelectedRule,
  validateSubmit as validateSubmitRules,
} from './submit-rules';
import { FixPendingEditableField, deriveFunctionStrategy, functionSupportsFixPending } from './function-strategy';
import * as policy from './function-policy';
import { BuilderModel } from './function-policy';
import { beginMakerSubmission, reduceMakerSubmitOutcome } from './maker-workflow-state';
import { MakerResultPanelComponent } from './maker-result-panel.component';
import { MakerActionBarComponent } from './maker-action-bar.component';
import { MakerActionBarState } from './maker-action-bar.policy';
import { MakerWorkflowNoticesComponent } from './maker-workflow-notices.component';
import { ProtectedTransactionIdentityComponent } from './protected-transaction-identity.component';
import { ProtectedIdentityItem, deriveProtectedIdentityItems } from './protected-transaction-identity.policy';
import { BalanceSnapshotBoxComponent } from './balance-snapshot-box.component';
import { MakerBalanceWarningsComponent } from './maker-balance-warnings.component';
import { deriveMakerBalanceWarnings } from './maker-balance-warning.policy';
import { MonetaryAmountPipe } from './monetary-amount.pipe';

/**
 * The fields `TransactionBuilderComponent.buildCheckerActionContext()` needs from this panel's own
 * state — mirrors `CheckerActionContext`'s shape minus `selectedFunction`/`selectedCheckerMovement`
 * (both stay parent-owned). Emitted on `contextChanged` whenever these values change; the parent keeps
 * its own read mirror, same "child owns the write" convention as `CheckerPanelComponent.movementPicked`.
 */
export interface MakerCheckerContext {
  submitResult: BalanceMovement | null;
  selectedPayMovement: BalanceMovement | null;
  matchedReceivableMovementId: string | null;
  dueFromIssuingBankMovementId: string | null;
  acceptanceMovementId: string | null;
  acceptanceReimbReceivableMovementId: string | null;
  arrivalSgRedeemMovementId: string | null;
  createdBy: string;
}

interface TransactionIndexRow {
  readonly movementId: string;
  readonly root: BalanceContract;
  readonly secondaryRef: string;
  readonly amount: string;
  readonly currency: string;
  readonly status: string;
  readonly movement?: BalanceMovement;
  readonly sgContract?: BalanceContract;
  readonly sgSnapshot?: BalanceSnapshot;
}

/**
 * The 7 flat compound-leg movement fields A3S/A6/B4/B5's multi-leg submissions produce, grouped into one
 * object. Doesn't change `MakerCheckerContext`'s shape — `emitContext()` destructures the 5 id fields
 * back out for the emitted DTO. `arrivalSgRedeemMovement`/`acceptanceMovement` (full `BalanceMovement`,
 * vs. the other 5 bare `movementId` strings) back this panel's own "Account Entries — SG
 * Redemption/Acceptance" buttons only — the Checker only ever needs the id.
 */
export interface CompoundLegState {
  arrivalSgRedeemMovementId: string | null;
  arrivalSgRedeemMovement: BalanceMovement | null;
  dueFromIssuingBankMovementId: string | null;
  acceptanceReimbReceivableMovementId: string | null;
  acceptanceMovementId: string | null;
  acceptanceMovement: BalanceMovement | null;
  matchedReceivableMovementId: string | null;
}

const EMPTY_COMPOUND_LEGS: CompoundLegState = {
  arrivalSgRedeemMovementId: null,
  arrivalSgRedeemMovement: null,
  dueFromIssuingBankMovementId: null,
  acceptanceReimbReceivableMovementId: null,
  acceptanceMovementId: null,
  acceptanceMovement: null,
  matchedReceivableMovementId: null,
};

/**
 * A pending sync request for the Checker's own search and, when `alsoSyncLookup` is set, the Look Up
 * Current Balance panel too. `alsoSyncLookup` is now always `true` — business instruction 2026-08-20
 * ("除了A1 & B1，其他功能當選取LC NUMBER後 Look Up Current Balance 自動輸入選取到的LC NUMBER 做
 * LOOKUP處理") extended the Look Up refresh from "only a genuine Submit/Release success" to "any
 * selection pick too" — every emitting call site now goes through the one `emitCheckerAndLookupSync()`
 * method (never a bare boolean literal at a call site), so a future success path can't silently skip it.
 */
export interface MakerSyncRequest {
  lcNumber: string;
  secondaryRef: string | null;
  alsoSyncLookup: boolean;
  instrumentType: InstrumentType | undefined;
}

/**
 * Owns the Maker's own form/selection state — `model`/`naturalKey`/`searchNaturalKey`/`selectedContract`/
 * `selectedContractSnapshot`/`selectedParent`/`subChoiceValue`/`amendDirection`/`fields`/`submitting`/
 * `submitResult`/`submitError` — plus every picker/selection/validation/submit method built on them,
 * including the "MAKER RESULT" panel.
 *
 * `submit()` (Maker) and the Checker's own `release()`/`reject()` (still parent-owned) both write into
 * `submitResult`/`arrivalApproved`/the compound-leg fields — a real
 * shared-state case. Resolved via an `@Input()` signal object (`externalCheckerOutcome`, fresh reference
 * per emission — the object itself is the trigger, not only its contents), applied in `ngOnChanges()`.
 * The parent keeps `checkerBusy`/`checkerError`/`checkerId`/`actionBusy`/`selectedCheckerMovement`/
 * `releaseSuccessHint` and the whole Checker action layer — those belong with the visual Checker section
 * (`<app-checker-panel>`'s own projected content), not this panel's own template.
 *
 * `contextChanged` (mirrors `CheckerActionContext`'s Maker-derived fields) and `syncRequested` are the two
 * outputs that make the child -> parent read-mirror work without `@ViewChild`.
 */
@Component({
  selector: 'app-maker-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FormlyModule, IndexPickerComponent, TbIconComponent, MakerResultPanelComponent, MakerActionBarComponent, MakerWorkflowNoticesComponent, ProtectedTransactionIdentityComponent, BalanceSnapshotBoxComponent, MakerBalanceWarningsComponent, MonetaryAmountPipe],
  templateUrl: './maker-panel.component.html',
  styleUrl: './maker-panel.component.scss',
  /**
   * Component-scoped providers for services that are genuinely per-component-instance state, never
   * app-wide singletons. A constructor default value alone isn't enough — Angular's real DI factory
   * injects every constructor parameter by type unconditionally and throws `NullInjectorError` if no
   * provider is registered. `MakerSubmitService` needs no entry — it's already `providedIn: 'root'`.
   */
  providers: [
    DocumentArrivalHintsService,
    PickerSelectionService,
    { provide: CATALOG_PICKER, useFactory: () => new CatalogPickerService(CATALOG_PAGE_SIZE, inject(BalanceComponentApiService)) },
    { provide: PARENT_PICKER, useFactory: () => new CatalogPickerService(PARENT_PAGE_SIZE, inject(BalanceComponentApiService)) },
    { provide: IB_INDEX_PICKER, useFactory: () => new CatalogPickerService(IB_INDEX_PAGE_SIZE, inject(BalanceComponentApiService)) },
  ],
})
export class MakerPanelComponent implements OnChanges {
  @Input() selectedFunction: TransactionFunction | null = null;
  @Input() activeFunctionSide: 'IMPORT' | 'EXPORT' = 'IMPORT';
  /** Same counter-based reset signal as `CheckerPanelComponent.resetTrigger` — one shared counter, bound to both children, incremented every `selectFunction()` call. */
  @Input() resetTrigger: number | null = null;
  /** Fresh-object-per-emission signal carrying a Checker action's own outcome — see this component's own class doc comment for the shared-mutable-state problem it resolves. */
  @Input() externalCheckerOutcome: CheckerActionOutcome | null = null;
  /**
   * A plain nonce-counter signal, same shape as `resetTrigger`. A plain (non-compound) Checker
   * release/reject only refreshes the snapshot and re-syncs — it never touches `submitResult` (the item
   * may have nothing to do with any Maker session's own `submitResult`). Kept separate from
   * `externalCheckerOutcome` so a plain Checker action can't corrupt the MAKER RESULT panel.
   */
  @Input() refreshRequested: number | null = null;
  /** Parent-owned (Checker action layer) — read here only to drive the "Delete Pending (EC)" button's own `[disabled]`/label, which lives inside this panel's own MAKER RESULT block. */
  @Input() actionBusy = false;
  /** Parent-owned (set by `release()`'s success path) — read here only to render the brief post-Release confirmation hint at the top of this panel's own template. */
  @Input() releaseSuccessHint: string | null = null;
  /**
   * Maker Queue's own Fix Pending entry point (2026-08-28, "Maker Queue Need to provide Fix Pending
   * button as well") — a fresh-object-per-emission signal (same convention as `externalCheckerOutcome`)
   * carrying the movement a cross-session Maker Queue row picked. `ngOnChanges()` sets it as
   * `submitResult` and calls `startFixPending()` — the exact same "return to the real original-event
   * screen" mechanism the in-session button already drives (`selectedFunction` must already be the
   * matching Function by the time this arrives; `TransactionBuilderComponent.onMakerQueueFixPending()`
   * calls `selectFunction()` first, in the same synchronous handler, so both land in one `ngOnChanges()`
   * — see that method's own doc comment).
   */
  @Input() externalFixPendingRequest: BalanceMovement | null = null;
  /**
   * Maker Queue's own Delete Pending review entry point (2026-08-28, "Maker Queue Delete Pending 也要
   * 顯示交易畫面 確認刪除與否") — same fresh-object-per-emission convention as `externalFixPendingRequest`,
   * carrying the movement a cross-session Maker Queue row picked for a Delete Pending REVIEW (not an
   * immediate delete). `ngOnChanges()` sets it as `submitResult` and calls `startDeletePendingReview()`,
   * which reconstructs the same real original-event screen Fix Pending uses but never unlocks it — see
   * that method's own doc comment for why `fieldsLocked` needs no extra logic to stay read-only here.
   */
  @Input() externalDeletePendingReviewRequest: BalanceMovement | null = null;

  /** See `MakerCheckerContext`'s own doc comment. */
  @Output() contextChanged = new EventEmitter<MakerCheckerContext>();
  /** See `MakerSyncRequest`'s own doc comment. */
  @Output() syncRequested = new EventEmitter<MakerSyncRequest>();
  /**
   * MAKER RESULT panel's 3 "Account Entries" buttons — `accountEntryDialogMovement`/`Instrumenttype`/
   * `AccountEntriesDialogComponent` all stay parent-owned. `phase` (business-confirmed 2026-08-27) is
   * only ever non-null for the first (`submitResult`) button — see `resultPhase`'s own doc comment; the
   * other two always pass a genuinely separate compound-leg movement that needs no override.
   */
  @Output() openAccountEntries = new EventEmitter<{ movement: BalanceMovement; instrumentType: InstrumentType | null; phase?: 'primary' | 'create' | 'finalize' | null }>();
  /**
   * Fix Pending (analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md §2.2/§15/§19,
   * 2026-08-27; per-field config 2026-08-28) — MAKER RESULT panel's "Fix Pending" entry point, gated
   * on `fixPendingSupported` (derived from the current Function's own
   * `FunctionStrategy.fixPendingEditableFields` — see that type's doc comment in `function-strategy.ts`
   * for the full "頁面配置檔 for A1-A11/B1-B7" per-Function editable-field table). `editPending()`
   * itself stays parent-owned, same Checker-action-layer boundary `release()`/`reject()` already use;
   * this panel owns the "return to original screen" reconstruction (`fixPendingMode`,
   * `reconstructOriginalModel()` via `rebuildFields()`) and builds the patch payload from whichever of
   * `this.model`'s fields the current Function's `fixPendingEditableFields` set actually declares
   * editable — never a fixed field list.
   */
  @Output() fixPendingRequested = new EventEmitter<Record<string, unknown> & { movementId: string }>();
  /** Emitted unconditionally by `cancelFixPending()` — see that method's own doc comment for why the parent, not this panel, decides whether "cancelled" means "navigate back to Maker Queue" or "just stay here." */
  @Output() fixPendingCancelled = new EventEmitter<void>();
  /**
   * Maker Queue's own Delete Pending review screen (2026-08-28) — emitted from `confirmDeletePendingReview()`
   * once the Maker confirms, after already reviewing the record read-only. Carries no payload: the parent
   * (`TransactionBuilderComponent.onDeletePendingReviewConfirmed()`) already holds the original
   * `MakerQueueRow` it navigated here with (including `siblingMovementIds` for a compound row) and calls
   * `MakerQueueService.deletePending()` directly with it — this panel never re-derives that cascade
   * information itself, it only ever requested the review.
   */
  @Output() deletePendingReviewConfirmed = new EventEmitter<void>();
  /** The Maker reviewed and declined — no delete call was made. The parent decides where to navigate next (back to Maker Queue). */
  @Output() deletePendingReviewCancelled = new EventEmitter<void>();

  form = new FormGroup({});
  model: BuilderModel = { currency: 'USD', createdBy: 'maker1', eventSeq: Date.now() };
  fields: FormlyFieldConfig[] = [];
  naturalKey = { lcNumber: '', ibNumber: '', sgNumber: '' };
  searchNaturalKey = { lcNumber: '', ibNumber: '', sgNumber: '' };
  searchError: string | null = null;
  /**
   * "Not Found Message — UI Width" rule (business-directed) — distinguishes a genuine "{query} not
   * found" (fit-content width box) from every OTHER reason `searchError` gets set (mandatory-field
   * validation, a 0-balance rejection, a non-404 API error — all still the full-width `.tb-error`
   * treatment). Reset alongside `searchError` itself at the top of `searchExistingContract()`, set true
   * only in that method's own 404 branch.
   */
  searchErrorIsNotFound = false;
  selectedContract: BalanceContract | null = null;
  selectedContractSnapshot: BalanceSnapshot | null = null;
  snapshotLoading = false;
  selectedParent: BalanceContract | null = null;
  parentInstrumentType: InstrumentType | '' = '';
  exposureNature: 'ACTUAL' | 'MEMO' = 'ACTUAL';
  subChoiceValue = '';
  amendDirection: 'INCREASE' | 'DECREASE' | null = null;
  dynamicSecondaryRefLabel: string | null = null;

  submitting = false;
  submitResult: BalanceMovement | null = null;
  submitError: string | null = null;
  /** A3 only — set by `approveArrival()` via `externalCheckerOutcome`'s `documentArrivalAcknowledged` kind. Not displayed here — kept because it's part of the same outcome-application state machine as `submitResult`. */
  arrivalApproved = false;

  /**
   * Fix Pending's own edit-mode flag (UX redesign per direct user feedback — the Maker returns to the
   * REAL original-event screen, `reconstructOriginalModel()` + the same `buildFields()`/`displayFields`
   * every Submit uses, not a separate mini-form). See `startFixPending()`/`confirmFixPending()`/
   * `cancelFixPending()` below.
   */
  fixPendingMode = false;

  /**
   * Maker Queue's own Delete Pending review screen (2026-08-28) — true while this panel is showing a
   * Maker-Queue-originated record read-only for the Maker to confirm or cancel deletion, rather than a
   * fresh Submit or an in-session Fix Pending edit. See `startDeletePendingReview()`'s own doc comment.
   */
  deletePendingReviewMode = false;

  /** See `CompoundLegState`'s own doc comment for why these 7 fields (A3S/A6/B4/B5's own multi-leg submissions) are grouped here rather than left flat. */
  compoundLegs: CompoundLegState = { ...EMPTY_COMPOUND_LEGS };

  constructor(
    private readonly api: BalanceComponentApiService,
    private readonly makerSubmit: MakerSubmitService = new MakerSubmitService(api),
    @Inject(CATALOG_PICKER) readonly catalogPicker: CatalogPickerService = new CatalogPickerService(CATALOG_PAGE_SIZE, api),
    @Inject(PARENT_PICKER) readonly parentPicker: CatalogPickerService = new CatalogPickerService(PARENT_PAGE_SIZE, api),
    @Inject(IB_INDEX_PICKER) readonly ibIndexPicker: CatalogPickerService = new CatalogPickerService(IB_INDEX_PAGE_SIZE, api),
    readonly documentArrivalHints: DocumentArrivalHintsService = new DocumentArrivalHintsService(api),
    readonly pickerSelection: PickerSelectionService = new PickerSelectionService(api),
  ) {}

  get catalogPageSize(): number {
    return CATALOG_PAGE_SIZE;
  }
  get parentPageSize(): number {
    return PARENT_PAGE_SIZE;
  }
  get ibIndexPageSize(): number {
    return IB_INDEX_PAGE_SIZE;
  }

  get selectedFunctionStrategy() {
    return this.selectedFunction ? deriveFunctionStrategy(this.selectedFunction) : null;
  }

  /** Presentation-only snapshot consumed by the extracted action bar; all command handlers remain here. */
  get actionBarState(): MakerActionBarState {
    return {
      releasesExistingMovementInPlace: !!this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace,
      hasSelectedContract: !!this.selectedContract,
      hasSelectedPayMovement: !!this.pickerSelection.selectedPayMovement,
      submitting: this.submitting,
      hasSubmitResult: !!this.submitResult,
      naturalKeyLocked: this.naturalKeyLocked,
      formLocked: this.formLocked,
      fixPendingMode: this.fixPendingMode,
      deletePendingReviewMode: this.deletePendingReviewMode,
      requiresEligibleTarget: this.requiresEligibleTarget,
      submitReady: this.isSubmitReady,
      actionBusy: this.actionBusy,
      fixPendingSaveReady: this.fixPendingSaveReady,
      functionCode: this.selectedFunction?.code ?? null,
    };
  }

  get protectedIdentityItems(): ProtectedIdentityItem[] {
    return deriveProtectedIdentityItems({
      lcNumber: this.contextLcNumber,
      secondaryRef: this.contextSecondaryRef,
      carriedSecondaryRef: this.model.secondaryRef ?? null,
      requiredNaturalKeyFields: this.requiredNaturalKeyFields,
      isCreatingMovement: this.isCreatingMovement,
      settlesDocumentArrival: !!this.selectedFunctionStrategy?.checkerRelease.settlesDocumentArrival,
      releasesExistingMovementInPlace: !!this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace,
      ibNumberLabel: this.ibNumberLabel,
    });
  }

  get balanceWarningMessages(): string[] {
    const snapshot = this.selectedContractSnapshot;
    if (!snapshot) return [];
    const usesDocumentArrivalWithSg = !!this.selectedFunctionStrategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg');
    return deriveMakerBalanceWarnings({
      formLocked: this.formLocked,
      amount: this.model.amount,
      movementType: this.model.movementType,
      availableBalance: snapshot.availableBalance,
      tightAvailableBalance: this.tightAvailableBalanceForWarning,
      checksAgainstPlainAvailable: this.checksAgainstPlainAvailable,
      checksAgainstTightAvailable: this.checksAgainstTightAvailable,
      contractInstrumentType: this.selectedContract?.instrumentType,
      offBalanceExposure: snapshot.offBalanceExposure,
      usesDocumentArrivalWithSg,
      arrivalSgOutstanding: usesDocumentArrivalWithSg ? (this.pickerSelection.arrivalSgSnapshot?.confirmedBalance ?? null) : null,
      referencedPresentationAmount: this.pickerSelection.selectedPayMovement?.ceilingAmount ?? null,
    });
  }

  /** Template-friendly wrapper around `functionSupportsFixPending()` (the single derived source of truth — see `FunctionStrategy.fixPendingEditableFields`'s own doc comment). */
  get fixPendingSupported(): boolean {
    return functionSupportsFixPending(this.selectedFunctionStrategy);
  }

  /**
   * True while this panel is showing a reconstructed, already-fully-resolved record — Fix Pending or
   * Delete Pending review — rather than a fresh Submit still in progress. Drives the two banners; see
   * `naturalKeyLocked` below for the broader "hide the picker, show a protected readout instead" rule
   * this also feeds into.
   */
  get isExternalReviewMode(): boolean {
    return this.fixPendingMode || this.deletePendingReviewMode;
  }

  /**
   * True once this Function's own target natural key (LC Number, plus IB/SG/EB Number for a
   * two-field-search function) is fixed and can never usefully be re-picked — 2026-08-28, "A2 - A11
   * B2-B7 無須再選LC NUMBER AND 2NDARY REF。因為已經PROTECTED了" then "如果交易輸入或選取2NDARY REF 也是
   * 加粗放大 選取的LC NUMBER and 2NDARY NUMBER不准輸入(PROTECTED)" — extends the SAME rule to a normal,
   * still-in-progress Submit the moment a target is actually picked (`hasEligibleTargetSelected`), not
   * only to Fix Pending/Delete Pending review (`isExternalReviewMode`) — matching the already-established
   * "locks the moment selectedContract/selectedParent resolves, not just at Submit" convention the
   * free-text natural-key fallback fields already use (see their own doc comment). `requiresEligibleTarget`
   * already reads `false` for A1/B1 (the one shape with no pre-existing target to protect at all — they
   * create a brand-new LC/Confirmation each time), so this naturally excludes them without a separate
   * check. Once true: the interactive Step 1/Step 2 index pickers and the free-text "Search Existing
   * Contract" fallback are hidden entirely (re-picking can never change anything once resolved — a
   * genuine change means Delete Pending + a fresh Submit, never an in-place re-pick), replaced by a
   * prominent, protected LC Number/2ndary readout — see that template block's own doc comment.
   */
  get naturalKeyLocked(): boolean {
    return this.requiresEligibleTarget && (this.hasEligibleTargetSelected || this.isExternalReviewMode);
  }

  /**
   * Each `@Input()` is a plain "something happened, react to it" signal, converted here into an
   * imperative call — testable via `new MakerPanelComponent(mockApi)` + `ngOnChanges({...})`, no
   * `TestBed` needed.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['resetTrigger']) this.resetForFunction();
    if (changes['externalCheckerOutcome'] && this.externalCheckerOutcome) this.applyCheckerOutcome(this.externalCheckerOutcome);
    if (changes['refreshRequested'] && !changes['refreshRequested'].firstChange) {
      this.refreshSelectedContractSnapshot();
      this.emitCheckerAndLookupSync();
    }
    // Runs AFTER resetForFunction() above — a fresh Function selection from Maker Queue's own
    // selectFunction() call arrives in the SAME ngOnChanges(), and must not be clobbered by the reset.
    // emitContext() is required here (unlike the in-session button's own startFixPending() call, which
    // never needs it — a real submit() already emitted the matching context earlier): selectFunction()
    // just reset the parent's own makerContext mirror to submitResult: null, and startFixPending() alone
    // never emits — TransactionBuilderComponent.fixPending()'s own guard reads THAT mirror, not this
    // component's local submitResult, so without this the Save Fix Pending button would silently no-op
    // (confirmFixPending() still emits fine, but the parent's guard fails and drops it on the floor).
    if (changes['externalFixPendingRequest'] && this.externalFixPendingRequest) {
      this.submitResult = this.externalFixPendingRequest;
      this.emitContext();
      this.startFixPending();
    }
    // Same reasoning as externalFixPendingRequest above — runs after resetForFunction(), keeps the
    // parent's own makerContext mirror accurate via emitContext() (not strictly required for the
    // Delete Pending review flow itself, since the parent already holds the original MakerQueueRow it
    // navigated here with, but keeps this panel's own state consistent regardless).
    if (changes['externalDeletePendingReviewRequest'] && this.externalDeletePendingReviewRequest) {
      this.submitResult = this.externalDeletePendingReviewRequest;
      this.emitContext();
      this.startDeletePendingReview();
    }
  }

  private emitContext(): void {
    // MakerCheckerContext only wants the 5 bare movementId fields, never the 2 full-BalanceMovement
    // ones (arrivalSgRedeemMovement/acceptanceMovement) — see CompoundLegState's own doc comment.
    const { matchedReceivableMovementId, dueFromIssuingBankMovementId, acceptanceMovementId, acceptanceReimbReceivableMovementId, arrivalSgRedeemMovementId } =
      this.compoundLegs;
    this.contextChanged.emit({
      submitResult: this.submitResult,
      selectedPayMovement: this.pickerSelection.selectedPayMovement,
      matchedReceivableMovementId,
      dueFromIssuingBankMovementId,
      acceptanceMovementId,
      acceptanceReimbReceivableMovementId,
      arrivalSgRedeemMovementId,
      createdBy: this.model.createdBy ?? 'maker1',
    });
  }

  private emitSync(alsoSyncLookup: boolean): void {
    const lcNumber = this.contextLcNumber;
    if (!lcNumber) return;
    this.syncRequested.emit({
      lcNumber,
      secondaryRef: this.contextSecondaryRef,
      alsoSyncLookup,
      instrumentType: this.model.instrumentType,
    });
  }
  /**
   * Common Requirement: every successful Maker Submit or Checker Release refreshes Look Up Current
   * Balance too. Business instruction 2026-08-20 ("除了A1 & B1，其他功能當選取LC NUMBER後 Look Up Current
   * Balance 自動輸入選取到的LC NUMBER 做 LOOKUP處理") — extended to a mere selection pick too, not just a
   * Submit/Release success: every function that PICKS an existing LC (A2-A9/B2-B5) now syncs Look Up the
   * moment that pick resolves, not only after the first successful action against it. A1/B1 create a
   * brand-new LC with no pick step at all, so they only ever reach this via their own Submit/Release
   * success paths — already correct, unaffected by this change. Previously split into two methods
   * (`emitCheckerSync()`, selection-only; this one, Submit/Release-only) — collapsed into one now that
   * every call site wants the same behavior; kept as a named method (not inlined at each call site) so a
   * future genuinely-selection-only need has one obvious place to reintroduce the split.
   */
  private emitCheckerAndLookupSync(): void {
    this.emitSync(true);
  }

  /*
   * One-line delegations to `function-policy.ts` — pure derivation logic lives there.
   */
  get isCreatingMovement(): boolean {
    return policy.isCreatingMovement(this.model);
  }
  get requiredNaturalKeyFields(): ('ibNumber' | 'sgNumber')[] {
    return policy.requiredNaturalKeyFields(this.model);
  }
  get ibNumberLabel(): string {
    return policy.ibNumberLabel(this.activeFunctionSide);
  }
  get hasParent(): boolean {
    return policy.hasParent(this.model);
  }
  get parentOptions(): InstrumentType[] {
    return policy.parentOptions(this.model);
  }
  get carriedCurrency(): string | null {
    return policy.carriedCurrency(this.selectedParent, this.selectedContract);
  }
  get usesTwoFieldSearch(): boolean {
    return policy.usesTwoFieldSearch(this.model);
  }
  get toleranceApplicable(): boolean {
    return policy.toleranceApplicable(this.model);
  }
  get amountDecimalMismatch(): boolean {
    return amountExceedsCurrencyDecimals(this.model.amount, this.model.currency);
  }
  get currencyDecimalPlaces(): number {
    return decimalPlacesForCurrency(this.model.currency);
  }
  get ready(): boolean {
    return policy.isReady(this.selectedFunction, this.model);
  }
  get lcNumberFromParent(): boolean {
    return policy.lcNumberFromParent(this.model);
  }

  private get contextRefState(): policy.ContextRefState {
    return {
      model: this.model,
      naturalKey: this.naturalKey,
      searchNaturalKey: this.searchNaturalKey,
      selectedParent: this.selectedParent,
      selectedContract: this.selectedContract,
      selectedFunction: this.selectedFunction,
    };
  }
  get contextLcNumber(): string | null {
    return policy.contextLcNumber(this.contextRefState);
  }
  get contextSecondaryRef(): string | null {
    return policy.contextSecondaryRef(this.contextRefState);
  }
  /**
   * 2026-08-28, "Tenor Type 改的不對 應該跟Currency欄位一樣 是輸入欄位但是PROTECTED" — same "carried,
   * genuine Formly field, protected" mechanism `carriedCurrency` already uses, not a separate read-only
   * card entry (an earlier, corrected attempt at this same requirement). Written into `model.tenorType`
   * at the same call sites `carriedCurrency` already fires from, then `buildFields()` renders it as a
   * disabled field, same as Currency.
   */
  get carriedTenorType(): string | null {
    return policy.contextTenorType(this.contextRefState);
  }

  /**
   * Carries Currency (existing) and Tenor Type (new) into the model together, once `selectedContract`/
   * `selectedParent` resolves — called from every one of `carriedCurrency`'s own pre-existing call sites,
   * so Tenor Type carries everywhere Currency already does without a second, separately-maintained list
   * of call sites. Tenor Type is skipped when the Function has `tenorTypeOptions` of its own (A1/B1's free
   * choice, A6's own dedicated tenorTypeOptions-driven carry a few lines below in `onSelectParent()`) —
   * this method's own Tenor Type branch is then simply a no-op for them.
   */
  private applyCarriedContractFields(): void {
    let changed = false;
    if (this.carriedCurrency) {
      this.model.currency = this.carriedCurrency;
      changed = true;
    }
    if (this.carriedTenorType && !this.selectedFunction?.tenorTypeOptions?.length) {
      this.model.tenorType = this.carriedTenorType as BuilderModel['tenorType'];
      changed = true;
    }
    if (changed) this.rebuildFields();
  }

  /**
   * A4's own "this record has moved on to A4's own PENDING/APPROVED/REJECTED lifecycle" signal for the
   * MAKER RESULT panel's own `submitResult` — the SAME `phase: 'finalize'` override
   * `MakerQueueService.displayPhaseFor()` derives for Maker Queue, computed here from the currently
   * selected Function instead of a cross-session row's own field.
   *
   * Business-confirmed 2026-08-27 ("Transaction Status 與 Account Entries Status 必須保持一致") —
   * originally computed inline inside `displayStatus()` below only, so the "Account Entries" button
   * (`openAccountEntries.emit()`, a SEPARATE call site) never got this override at all — the View Voucher
   * dialog kept showing "EARMARKED" for an A4-in-progress record even after the Status line above it had
   * already been fixed to show "PENDING". Extracted to one shared getter so `displayStatus()` and
   * `openAccountEntries.emit()` can never diverge on this question again.
   * `releasesExistingMovementInPlace` is A4's own unique strategy flag — true only while A4 itself is
   * selected, so this can't misfire for any other Function's own submitResult.
   */
  get resultPhase(): 'finalize' | null {
    return this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace && this.submitResult?.makerSubmittedAt ? 'finalize' : null;
  }

  /** `displayStatus()` thin delegation — duplicated on this component the same way `AccountEntriesDialogComponent` carries its own copy, since Emulated view encapsulation scopes a template's binding surface to its own component. */
  displayStatus(status: string, instrumentType?: InstrumentType | string | null, movementType?: string | null, acknowledgedAt?: string | null): string {
    return displayStatusShared(status, instrumentType, movementType, this.resultPhase, acknowledgedAt);
  }

  movementTypeChecksAvailableBalance(movementType?: string | null): boolean {
    return !!movementType && DECREASING_MOVEMENT_TYPES.has(movementType);
  }

  /**
   * True for B2's own Decrease direction — `model.movementType` is always `'AMEND'` for B2
   * (EPLC_CONFIRMATION has no distinct Increase/Decrease movementType; direction rides `amendDirection`
   * instead, see `SubChoice.key`'s own doc comment), so `DECREASING_MOVEMENT_TYPES`/
   * `movementTypeChecksAvailableBalance()` alone can never see it. Business instruction 2026-08-20 ("A2
   * Decrease 輸入金額控制規則 B2 Decrease... 都適用") — the Available/Tight Available Balance warnings
   * below need this so B2 gets the same live feedback A2 already has (previously B2 got NO client-side
   * warning at all for a Decrease that the server would reject). A2's own genuine `AMEND_DECREASE` is
   * ALSO covered here (redundantly with `movementTypeChecksAvailableBalance`) purely so callers can use
   * this one getter alone for the Tight-tier warning's own movementType scoping.
   */
  get isAmendDecreaseDirection(): boolean {
    return this.model.movementType === 'AMEND_DECREASE' || (this.model.movementType === 'AMEND' && this.amendDirection === 'DECREASE');
  }

  /**
   * True when the CURRENT submission's own server-side sufficiency check is Tight-Available-Balance-based,
   * so the "exceeds Tight Available Balance" warning below should apply. Business instruction 2026-08-20
   * ("B3金額輸入檢查與B2 Decrease相同 <= Tight Available Balance"): covers A3/A3S (`UTILIZE`,
   * `checkUtilizeSufficiency`), A2/B2 Decrease (`isAmendDecreaseDirection`, `checkAmendDecreaseSufficiency`),
   * B3 (`CREATE` against the aliased parent `EPLC_CONFIRMATION` — see `onSelectParent()`'s own doc comment
   * for why `selectedContract` is aliased to the parent for this shape, `checkPresentDocsIssueSufficiency`),
   * and A8 (`ISSUE` against the aliased parent `IPLC_LC` — same alias mechanism,
   * `checkShgtIssueSufficiency`). Deliberately does NOT also cover them under the plain "exceeds Available
   * Balance" tier-1 warning above: A8/B3 have no separate, looser plain-Available check server-side (unlike
   * UTILIZE/AMEND_DECREASE, which genuinely have both tiers) — Tight Available Balance is their only real
   * ceiling.
   *
   * B4 (`HONOUR`/`ACCEPT`) added 2026-08-20 ("A2-A9, B2-B5 對於金額輸入的檢查... 統一在金額輸入時都檢查") —
   * closes the one remaining gap: `HONOUR`/`ACCEPT` are the exact same `checkUtilizeSufficiency`-backed
   * `utilizeShaped` bucket `UTILIZE` already uses server-side (`movementTypeRegistry`,
   * `microservices/balance-component/src/service/balanceService.ts`), and both movementTypes are B4-only
   * (never used by any other function), so gating on the bare movementType here is exact — no strategy-flag
   * check needed, same posture as the `UTILIZE` line above it. See `tightAvailableBalanceForWarning`'s own
   * doc comment for why the THRESHOLD itself (not just whether to show the warning) also needed a B4-specific
   * widening, not just this gate.
   */
  get checksAgainstTightAvailable(): boolean {
    if (this.model.movementType === 'UTILIZE' || this.model.movementType === 'HONOUR' || this.model.movementType === 'ACCEPT') return true;
    if (this.isAmendDecreaseDirection) return true;
    if (this.model.movementType === 'CREATE' && this.selectedContract?.instrumentType === 'EPLC_CONFIRMATION') return true;
    if (this.model.movementType === 'ISSUE' && this.hasParent) return true;
    return false;
  }

  /**
   * Bug found live 2026-08-20 (user-reported, "B3 20000" against an LC already fully earmarked —
   * Available 10000, Tight Available 0 — showed NO warning at all, even though the server would reject
   * it): the "exceeds Tight Available Balance" warning below gates on
   * `+model.amount <= +selectedContractSnapshot.availableBalance`, a guard written for functions that
   * genuinely have BOTH tiers (UTILIZE/HONOUR/ACCEPT/AMEND_DECREASE-direction — suppress the Tight
   * message in favor of the plain "exceeds Available Balance" one above it, so the two never show
   * together for the same violation). But B3/A8 have no plain-Available tier at all — see
   * `checksAgainstTightAvailable`'s own doc comment — so when a B3/A8 amount exceeds BOTH ceilings at
   * once, that `<= availableBalance` guard silently suppressed their only warning, and the plain
   * "exceeds Available Balance" block above never fires for them either (its own gate,
   * `movementTypeChecksAvailableBalance`/`isAmendDecreaseDirection`, is `false` for `CREATE`/`ISSUE`).
   * This getter identifies the functions that genuinely have a plain-Available tier to defer to; the
   * Tight-tier warning's own `*ngIf` only applies the `<= availableBalance` guard when this is true.
   */
  get checksAgainstPlainAvailable(): boolean {
    return this.movementTypeChecksAvailableBalance(this.model.movementType) || this.isAmendDecreaseDirection;
  }

  private describeApiError(err: any): string {
    return describeApiErrorShared(err);
  }

  private formatAmount(amount: string): string {
    const [whole, frac] = amount.split('.');
    const withCommas = groupThousands(whole);
    return frac ? `${withCommas}.${frac}` : withCommas;
  }

  /**
   * Reads `this.selectedFunction` (the `@Input()`, already at its final value when `ngOnChanges()` fires —
   * `selectedFunction`/`resetTrigger` are set synchronously in the same JS tick).
   */
  private resetForFunction(): void {
    const fn = this.selectedFunction;
    this.subChoiceValue = '';
    this.amendDirection = null;
    this.dynamicSecondaryRefLabel = fn?.secondaryRefLabel ?? null;
    this.model = { currency: 'USD', createdBy: 'maker1', eventSeq: Date.now() };
    if (fn?.code === 'A1' || fn?.code === 'B1') this.model.tenorType = 'SIGHT';
    this.naturalKey = { lcNumber: '', ibNumber: '', sgNumber: '' };
    this.searchNaturalKey = { lcNumber: '', ibNumber: '', sgNumber: '' };
    this.searchError = null;
    this.selectedContract = null;
    this.selectedContractSnapshot = null;
    this.parentInstrumentType = fn?.defaultParentInstrumentType ?? '';
    this.selectedParent = null;
    this.parentPicker.contracts = [];
    this.parentPicker.resetPaging();
    this.parentPicker.search = '';
    this.catalogPicker.resetPaging();
    this.catalogPicker.search = '';
    this.transactionIndexSearch = '';
    this.transactionIndexPage = 1;
    this.ibIndexPicker.contracts = [];
    this.ibIndexPicker.resetPaging();
    this.pickerSelection.settleableBalances = [];
    this.pickerSelection.settleableBalancesLoading = false;
    this.pickerSelection.settleableBalancesPaging.reset();
    this.pickerSelection.payableMovements = [];
    this.pickerSelection.payableMovementSearch = '';
    this.pickerSelection.payableMovementsPaging.reset();
    this.pickerSelection.selectedPayMovement = null;
    this.arrivalApproved = false;
    this.submitResult = null;
    this.submitError = null;
    this.fixPendingMode = false;
    this.deletePendingReviewMode = false;
    this.pickerSelection.sgsForArrival = [];
    this.pickerSelection.arrivalSgPaging.reset();
    this.pickerSelection.selectedArrivalSg = null;
    this.pickerSelection.arrivalSgSnapshot = null;
    this.compoundLegs = { ...EMPTY_COMPOUND_LEGS };

    if (fn?.movementType) {
      this.model.instrumentType = fn.instrumentType;
      this.model.movementType = fn.movementType;
      this.afterResolved();
    }
    this.emitContext();
  }

  /**
   * "Transaction Selection and Navigation Flow" rule (business-directed) — every non-A1/B1 Function's own
   * Transaction Input Screen gets a Cancel button that abandons the current selection/edits and returns to
   * that same Function's own Selection Screen, ready to pick a different Transaction. Reuses
   * `resetForFunction()` verbatim (same `selectedFunction`, so this is genuinely "reset back to the
   * just-entered-this-Function state", not a function switch) — template gates this to the exact window
   * where it's meaningful (a target is picked, fields are still editable, not yet Submitted, and not
   * already inside Fix Pending/Delete Pending review — those own their own, differently-scoped Cancel
   * buttons already).
   */
  cancelSelection(): void {
    this.resetForFunction();
  }

  /**
   * Dispatches on `subChoice.key`: `'amendDirection'` (B2) sets `amendDirection` only — it doesn't touch
   * `model.movementType` (fixed at 'AMEND') or call `afterResolved()` (whose FULL_SETTLE/REDEEM/SETTLE
   * derivations don't apply to B2). `'movementType'` (A2/A7) sets `model.movementType` and calls
   * `afterResolved()`.
   */
  onSubChoice(): void {
    if (!this.selectedFunction || !this.subChoiceValue) return;
    const fn = this.selectedFunction;
    // F1 (external BA review, v1.19.0) — B2's own third option (Expiry Date) declares a
    // movementTypeOverride: AMEND_EXPIRY_DATE is a genuinely distinct movementType, not an amendDirection
    // variant, so it bypasses the key-based write below entirely — see SubChoice.options[].
    // movementTypeOverride's own doc comment for why. A2's own third option needs no override (its key
    // is already 'movementType', which already writes model.movementType directly via the picked value).
    const chosenOption = fn.subChoice?.options.find((o) => o.value === this.subChoiceValue);
    if (chosenOption?.movementTypeOverride) {
      this.model.instrumentType = fn.instrumentType;
      this.model.movementType = chosenOption.movementTypeOverride;
      this.afterResolved();
      return;
    }
    if (fn.subChoice?.key === 'amendDirection') {
      this.amendDirection = this.subChoiceValue as 'INCREASE' | 'DECREASE';
      return;
    }
    this.model.instrumentType = fn.instrumentType;
    this.model.movementType = this.subChoiceValue;
    this.afterResolved();
  }

  private afterResolved(): void {
    // 2026-08-26 (SonarQube-scan-report.md, typescript:S1871) — was 3 separate if/else-if branches with
    // an identical body (`this.model.amount = this.selectedContractSnapshot.availableBalance;`),
    // differing only in which function's own Amount-derivation rule matched; collapsed into one guard.
    const amountFromAvailableBalance =
      this.model.movementType === 'FULL_SETTLE' ||
      this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'REDEEM' ||
      (this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'SETTLE' && this.model.instrumentType === 'EPLC_ACCEPTANCE');
    if (amountFromAvailableBalance && this.selectedContractSnapshot) {
      this.model.amount = this.selectedContractSnapshot.availableBalance;
    }
    this.rebuildFields();
    if (!this.isCreatingMovement && !this.usesTwoFieldSearch) this.reloadCatalog();
    if (this.usesTwoFieldSearch) this.loadIbIndex();
    else if (this.parentInstrumentType) this.onParentInstrumentTypeChange();
  }

  reloadCatalog(): void {
    this.catalogPicker.load({
      guardFails: !this.model.instrumentType || this.isCreatingMovement,
      instrumentType: this.model.instrumentType!,
      tenorFamily: this.selectedFunction?.catalogTenorFilter,
      query: this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace ? null : undefined,
      // A11/B7 (Reopen, F1) only — its own candidates are CLOSED, not ACTIVE like every other flat
      // Catalog picker this service backs; every other function keeps the default (undefined -> 'ACTIVE').
      status: this.selectedFunction?.requiresReopenEligibility ? 'CLOSED' : undefined,
      qualifies: () => this.filteredCatalogContracts.length,
      onLoaded: (items) => {
        // hintsPending — see eligiblePickersLoading's own doc comment for why each of these 5 branches
        // needs its own increment/decrement: each is a THIRD, independent async fetch (beyond load()'s own
        // contracts+snapshots) that CatalogPickerService.loading knows nothing about.
        if (this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace) {
          this.hintsPending++;
          this.documentArrivalHints.loadCatalogHints(items, () => {
            this.hintsPending--;
            this.catalogPicker.total = this.allFlattenedPayableRows.length;
          });
        }
        if (this.selectedFunction?.payableMovementInstrumentType) {
          this.hintsPending++;
          this.documentArrivalHints.loadChildHints(
            items,
            this.selectedFunction.payableMovementInstrumentType,
            this.selectedFunction.payableMovementType ?? 'UTILIZE',
            () => {
              this.hintsPending--;
              this.catalogPicker.total = this.filteredCatalogContracts.length;
            },
          );
        }
        if (this.selectedFunctionStrategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg')) {
          this.hintsPending++;
          this.documentArrivalHints.loadCatalogSgEligibility(items, () => {
            this.hintsPending--;
            this.catalogPicker.total = this.filteredCatalogContracts.length;
          });
        }
        // A10/B6 only — one aggregate server call, not per-candidate like every hint above; see
        // DocumentArrivalHintsService.loadCloseEligibility()'s own doc comment for why.
        if (this.selectedFunction?.requiresCloseEligibility) {
          this.hintsPending++;
          this.documentArrivalHints.loadCloseEligibility(this.model.instrumentType!, () => {
            this.hintsPending--;
            this.catalogPicker.total = this.filteredCatalogContracts.length;
          });
        }
        // A11/B7 (Reopen, F1) only — same "one aggregate server call" shape as A10/B6's own
        // loadCloseEligibility() above.
        if (this.selectedFunction?.requiresReopenEligibility) {
          this.hintsPending++;
          this.documentArrivalHints.loadReopenEligibility(this.model.instrumentType!, () => {
            this.hintsPending--;
            this.catalogPicker.total = this.filteredCatalogContracts.length;
          });
        }
      },
    });
  }

  private get requiresEligibleParentDocumentArrival(): boolean {
    return (
      !!this.selectedFunctionStrategy?.checkerRelease.settlesDocumentArrival && !this.selectedFunctionStrategy?.checkerRelease.sourceAlreadyReleasedBeforePick
    );
  }

  onCatalogSearch(): void {
    if (this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace) {
      this.catalogPicker.page = 1;
      this.catalogPicker.total = this.allFlattenedPayableRows.length;
      return;
    }
    this.reloadCatalog();
  }

  get allFlattenedPayableRows(): { movementId: string; contract: BalanceContract; movement: any }[] {
    const rows: { movementId: string; contract: BalanceContract; movement: any }[] = [];
    const query = this.catalogPicker.search.trim().toLowerCase();
    for (const c of this.filteredCatalogContracts) {
      const movements = this.documentArrivalHints.catalogPayableMovements.get(c.balanceContractId) ?? [];
      for (const m of movements) {
        if (query && !c.naturalKey.lcNumber.toLowerCase().includes(query) && !m.sourceTransactionRef?.toLowerCase().includes(query)) continue;
        rows.push({ movementId: m.movementId, contract: c, movement: m });
      }
    }
    rows.sort((a, b) => {
      const lc = a.contract.naturalKey.lcNumber.localeCompare(b.contract.naturalKey.lcNumber);
      return lc !== 0 ? lc : (a.movement.sourceTransactionRef ?? '').localeCompare(b.movement.sourceTransactionRef ?? '');
    });
    return rows;
  }

  get flattenedPayableRows(): { movementId: string; contract: BalanceContract; movement: any }[] {
    const start = (this.catalogPicker.page - 1) * this.catalogPicker.pageSize;
    return this.allFlattenedPayableRows.slice(start, start + this.catalogPicker.pageSize);
  }

  onSelectFlattenedPayableMovement(movementId: string): void {
    const row = this.allFlattenedPayableRows.find((candidate) => candidate.movementId === movementId);
    if (row) this.onSelectFlattenedPayable(row.contract.balanceContractId, movementId);
  }

  onSelectFlattenedPayable(contractId: string, movementId: string): void {
    this.selectedContract = this.catalogPicker.contracts.find((c) => c.balanceContractId === contractId) ?? null;
    this.refreshSelectedContractSnapshot();
    this.pickerSelection.payableMovements = this.documentArrivalHints.catalogPayableMovements.get(contractId) ?? [];
    this.pickerSelection.payableMovementsLoading = false;
    this.pickerSelection.payableMovementsPaging.total = this.pickerSelection.payableMovements.length;
    this.pickerSelection.payableMovementsPaging.page = 1;
    this.onSelectPayMovement(movementId);
    this.emitCheckerAndLookupSync();
  }

  catalogIbHint(c: BalanceContract): string {
    // catalogPayableIbs is A4-only (see DocumentArrivalHintsService's own doc comment) but resetForFunction()
    // never clears it on a function switch — without this guard, a leftover hint from an earlier A4 selection
    // in the same session keeps rendering on every other catalog-picker function's rows too (e.g. A11/B7).
    if (!this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace) return '';
    const ibs = this.documentArrivalHints.catalogPayableIbs.get(c.balanceContractId);
    if (!ibs?.length) return '';
    return ibs.length === 1 ? ` — ${ibs[0]}` : ` — ${ibs.length} pending: ${ibs.join(', ')}`;
  }

  catalogPrevPage(): void {
    const page = this.catalogPicker.prevTarget();
    if (page !== null) this.catalogPicker.page = page;
  }
  catalogNextPage(): void {
    const page = this.catalogPicker.nextTarget();
    if (page !== null) this.catalogPicker.page = page;
  }

  /** Returns a value for the shared `applyEligibilityRule()` tail rather than filtering directly — which
   * rule applies here stays local (reads `payableMovementInstrumentType`, a registry field outside the
   * `FunctionStrategy` migration). */
  private resolveCatalogEligibilityRule(): EligibilityRule {
    if (this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace) {
      return { kind: 'hintSet', ids: this.documentArrivalHints.catalogPayableIbs };
    }
    if (this.selectedFunction?.payableMovementInstrumentType) {
      return { kind: 'hintSet', ids: this.documentArrivalHints.catalogChildPayableIbs };
    }
    if (this.selectedFunctionStrategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg')) {
      return { kind: 'hintSet', ids: this.documentArrivalHints.catalogSgEligible };
    }
    if (this.selectedFunction?.requiresCloseEligibility) {
      return { kind: 'hintSet', ids: this.documentArrivalHints.catalogCloseEligible };
    }
    if (this.selectedFunction?.requiresReopenEligibility) {
      return { kind: 'hintSet', ids: this.documentArrivalHints.catalogReopenEligible };
    }
    return { kind: 'genericFallback', gatedByMovementType: true };
  }

  get filteredCatalogContracts(): BalanceContract[] {
    let list = this.catalogPicker.contracts;
    const tenorFilter = this.selectedFunction?.catalogTenorFilter;
    if (tenorFilter) {
      list = list.filter((c) => !c.tenorType || (tenorFilter === 'SIGHT' ? c.tenorType === 'SIGHT' : c.tenorType !== 'SIGHT'));
    }
    return applyEligibilityRule(list, this.resolveCatalogEligibilityRule(), this.model.movementType, this.catalogPicker.snapshots);
  }

  get pagedFilteredCatalogContracts(): BalanceContract[] {
    const start = (this.catalogPicker.page - 1) * this.catalogPicker.pageSize;
    return this.filteredCatalogContracts.slice(start, start + this.catalogPicker.pageSize);
  }

  onParentInstrumentTypeChange(): void {
    this.selectedParent = null;
    this.exposureNature = 'ACTUAL';
    this.loadParent();
  }

  private loadParent(): void {
    this.parentPicker.load({
      guardFails: !this.parentInstrumentType,
      instrumentType: this.parentInstrumentType as InstrumentType,
      tenorFamily: this.parentTenorFamily,
      qualifies: () => this.filteredParentCatalog.length,
      onLoaded: (items) => {
        // hintsPending — same rationale as reloadCatalog()'s own identical comment.
        if (this.requiresEligibleParentDocumentArrival) {
          this.hintsPending++;
          this.documentArrivalHints.loadParentHints(items, () => {
            this.hintsPending--;
            this.parentPicker.total = this.filteredParentCatalog.length;
          });
        }
        if (this.selectedFunction?.payableMovementInstrumentType) {
          this.hintsPending++;
          this.documentArrivalHints.loadChildHints(
            items,
            this.selectedFunction.payableMovementInstrumentType,
            this.selectedFunction.payableMovementType ?? 'UTILIZE',
            () => {
              this.hintsPending--;
              this.parentPicker.total = this.filteredParentCatalog.length;
            },
          );
        }
        if (this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'REDEEM') {
          this.hintsPending++;
          this.documentArrivalHints.loadParentSgEligibility(items, () => {
            this.hintsPending--;
            this.parentPicker.total = this.filteredParentCatalog.length;
          });
        }
        // A7 only — user-reported 2026-08-25; see requiresEligibleParentAcceptance's own doc comment.
        if (this.selectedFunction?.requiresEligibleParentAcceptance) {
          this.hintsPending++;
          this.documentArrivalHints.loadParentAcceptanceEligibility(items, () => {
            this.hintsPending--;
            this.parentPicker.total = this.filteredParentCatalog.length;
          });
        }
      },
    });
  }

  onParentSearch(): void {
    this.loadParent();
  }

  parentPrevPage(): void {
    const page = this.parentPicker.prevTarget();
    if (page !== null) this.parentPicker.page = page;
  }
  parentNextPage(): void {
    const page = this.parentPicker.nextTarget();
    if (page !== null) this.parentPicker.page = page;
  }

  get parentTenorFamily(): 'SIGHT' | 'USANCE' | undefined {
    return policy.parentTenorFamily(this.selectedFunction);
  }

  /** Same mechanism as `resolveCatalogEligibilityRule()`. `gatedByMovementType: false` here is
   * deliberate, not copy-paste — the parent picker's own 0-balance exclusion is never gated by
   * `DECREASING_MOVEMENT_TYPES` (see `EligibilityRule`'s own doc comment). */
  private resolveParentEligibilityRule(): EligibilityRule {
    if (this.requiresEligibleParentDocumentArrival) {
      return { kind: 'hintSet', ids: this.documentArrivalHints.parentPayableIbs };
    }
    if (this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'REDEEM') {
      return { kind: 'hintSet', ids: this.documentArrivalHints.parentSgEligible };
    }
    if (this.selectedFunction?.requiresEligibleParentAcceptance) {
      return { kind: 'hintSet', ids: this.documentArrivalHints.parentAcceptanceEligible };
    }
    if (this.selectedFunction?.payableMovementInstrumentType) {
      return { kind: 'hintSet', ids: this.documentArrivalHints.catalogChildPayableIbs };
    }
    if (
      this.selectedFunctionStrategy?.checkerRelease.settlesDocumentArrival ||
      this.selectedFunction?.catalogTenorFilter === 'USANCE' ||
      this.selectedFunctionStrategy?.selectionFlow.usesSettleableBalanceIndex
    ) {
      return { kind: 'unconditional' };
    }
    return { kind: 'genericFallback', gatedByMovementType: false };
  }

  get filteredParentCatalog(): BalanceContract[] {
    let list = this.parentPicker.contracts;
    if (this.selectedFunction?.tenorTypeOptions?.length) {
      list = list.filter((c) => c.tenorType && c.tenorType !== 'SIGHT' && (!this.model.tenorType || c.tenorType === this.model.tenorType));
    } else if (this.selectedFunction?.catalogTenorFilter === 'USANCE') {
      list = list.filter((c) => !c.tenorType || c.tenorType !== 'SIGHT');
    }
    return applyEligibilityRule(list, this.resolveParentEligibilityRule(), this.model.movementType, this.parentPicker.snapshots);
  }

  get pagedFilteredParentCatalog(): BalanceContract[] {
    const start = (this.parentPicker.page - 1) * this.parentPicker.pageSize;
    return this.filteredParentCatalog.slice(start, start + this.parentPicker.pageSize);
  }

  parentTightLcBalance(contract: BalanceContract): string {
    const snapshot = this.parentPicker.snapshots.get(contract.balanceContractId);
    return snapshot ? `${formatCurrencyAmount(snapshot.tightAvailableBalance, snapshot.currency)} ${snapshot.currency}` : '—';
  }

  get usesCombinedTransactionIndex(): boolean {
    return !!this.selectedFunction?.transactionIndexAmountLabel;
  }

  get allTransactionIndexRows(): TransactionIndexRow[] {
    const rows: TransactionIndexRow[] = [];
    if (this.selectedFunction?.code === 'A3S') {
      for (const root of this.filteredCatalogContracts) {
        for (const item of this.documentArrivalHints.catalogSgRows.get(root.balanceContractId) ?? []) {
          rows.push({
            movementId: item.contract.balanceContractId,
            root,
            secondaryRef: item.contract.naturalKey.sgNumber || '—',
            amount: item.snapshot.availableBalance,
            currency: item.snapshot.currency,
            status: item.contract.status,
            sgContract: item.contract,
            sgSnapshot: item.snapshot,
          });
        }
      }
    } else {
      const isA6 = this.selectedFunction?.code === 'A6';
      const source = isA6 ? this.documentArrivalHints.parentPayableMovements : this.documentArrivalHints.catalogChildPayableMovements;
      const roots = isA6 ? this.filteredParentCatalog : this.filteredCatalogContracts;
      for (const root of roots) {
        for (const movement of source.get(root.balanceContractId) ?? []) {
          rows.push({
            movementId: movement.movementId,
            root,
            secondaryRef: movement.sourceTransactionRef || '—',
            amount: movement.amount,
            currency: movement.currency,
            status: movement.acknowledgedAt ? 'EARMARKED' : movement.status,
            movement,
          });
        }
      }
    }
    const query = this.transactionIndexSearch.trim().toLowerCase();
    return rows
      .filter((row) => !query || row.root.naturalKey.lcNumber.toLowerCase().includes(query) || row.secondaryRef.toLowerCase().includes(query))
      .sort((a, b) => a.root.naturalKey.lcNumber.localeCompare(b.root.naturalKey.lcNumber) || a.secondaryRef.localeCompare(b.secondaryRef));
  }

  transactionIndexSearch = '';
  transactionIndexPage = 1;
  readonly transactionIndexPageSize = 10;

  get pagedTransactionIndexRows(): TransactionIndexRow[] {
    const start = (this.transactionIndexPage - 1) * this.transactionIndexPageSize;
    return this.allTransactionIndexRows.slice(start, start + this.transactionIndexPageSize);
  }

  get transactionIndexTotalPages(): number {
    return Math.max(1, Math.ceil(this.allTransactionIndexRows.length / this.transactionIndexPageSize));
  }

  onTransactionIndexSearch(): void {
    this.transactionIndexPage = 1;
  }

  transactionIndexPrevPage(): void {
    if (this.transactionIndexPage > 1) this.transactionIndexPage--;
  }

  transactionIndexNextPage(): void {
    if (this.transactionIndexPage < this.transactionIndexTotalPages) this.transactionIndexPage++;
  }

  onSelectTransactionIndex(rowId: string): void {
    const row = this.allTransactionIndexRows.find((candidate) => candidate.movementId === rowId);
    if (!row) return;
    if (this.selectedFunction?.code === 'A3S') {
      const sgContract = row.sgContract!;
      const sgSnapshot = row.sgSnapshot!;
      this.selectedContract = row.root;
      this.applyCarriedContractFields();
      this.refreshSelectedContractSnapshot();
      this.pickerSelection.sgsForArrival = [sgContract];
      this.pickerSelection.selectedArrivalSg = sgContract;
      this.pickerSelection.arrivalSgSnapshot = sgSnapshot;
      this.rebuildFields();
      this.emitCheckerAndLookupSync();
      return;
    }
    if (!row.movement) return;
    if (this.selectedFunction?.code === 'B4') this.onSelectContract(row.root.balanceContractId, false);
    else this.onSelectParent(row.root.balanceContractId, false);
    this.pickerSelection.payableMovements = [row.movement];
    this.pickerSelection.payableMovementsPaging.total = 1;
    this.onSelectPayMovement(row.movement.movementId);
  }

  payableMovementsPrevPage(): void {
    this.pickerSelection.payableMovementsPrevPage();
  }
  payableMovementsNextPage(): void {
    this.pickerSelection.payableMovementsNextPage();
  }

  onPayableMovementSearchChange(value: string): void {
    const outcome = this.pickerSelection.onPayableMovementSearchChange(value, this.selectedFunctionStrategy, this.selectedFunction?.secondaryRefLabel);
    if (outcome) this.applyPayMovementOutcome(outcome);
  }

  catalogPendingHint(c: BalanceContract): string {
    if (!this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace) return '';
    const snap = this.catalogPicker.snapshots.get(c.balanceContractId);
    if (!snap || snap.pendingEarmarkTotal === '0') return '';
    const ibs = this.documentArrivalHints.catalogPayableIbs.get(c.balanceContractId);
    const label = ibs && ibs.length > 1 ? 'Total Pending' : 'Pending';
    return ` — ${label}: ${formatCurrencyAmount(snap.pendingEarmarkTotal.replace('-', ''), snap.currency)}`;
  }

  catalogTightLcBalance(contract: BalanceContract): string {
    const snapshot = this.catalogPicker.snapshots.get(contract.balanceContractId);
    return snapshot ? `${formatCurrencyAmount(snapshot.tightAvailableBalance, snapshot.currency)} ${snapshot.currency}` : '—';
  }

  onSelectContract(contractId: string, loadSourceTransaction = true): void {
    this.selectedContract = this.catalogPicker.contracts.find((c) => c.balanceContractId === contractId) ?? null;
    if (this.selectedFunctionStrategy?.movementDerivation.derivesMovementTypeFromTenor && this.selectedContract) {
      this.model.movementType = this.selectedContract.tenorType === 'SIGHT' ? 'HONOUR' : 'ACCEPT';
    }
    this.applyCarriedContractFields();
    // A11/B7 (Reopen, F1) only — a harmless '0' placeholder set immediately on selection, purely because
    // the wire schema requires SOME valid MonetaryAmount string; the Amount field itself is hidden (see
    // builder-fields.ts's own amountFromFixed) since the server computes and substitutes the real
    // restoration amount at Submit regardless of what's sent — see
    // FunctionStrategy.movementDerivation.amountFixed's own doc comment.
    if (this.selectedFunctionStrategy?.movementDerivation.amountFixed != null) {
      this.model.amount = this.selectedFunctionStrategy.movementDerivation.amountFixed;
      this.rebuildFields();
    }
    this.refreshSelectedContractSnapshot();
    if (
      loadSourceTransaction &&
      (this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace || this.selectedFunctionStrategy?.checkerRelease.settlesDocumentArrival)
    ) {
      this.pickerSelection.loadPayableMovements({
        contractId: this.selectedContract?.balanceContractId,
        lcNumber: this.selectedContract?.naturalKey.lcNumber,
        selectedFunction: this.selectedFunction,
        selectedFunctionStrategy: this.selectedFunctionStrategy,
        onAutoPicked: (outcome) => this.applyPayMovementOutcome(outcome),
      });
    }
    if (this.selectedFunctionStrategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg')) {
      this.pickerSelection.loadSgsForArrival(this.selectedContract?.naturalKey.lcNumber, () => this.rebuildFields());
    }
    this.emitCheckerAndLookupSync();
  }

  arrivalSgPrevPage(): void {
    this.pickerSelection.arrivalSgPrevPage();
  }
  arrivalSgNextPage(): void {
    this.pickerSelection.arrivalSgNextPage();
  }

  onSelectArrivalSg(contractId: string): void {
    this.pickerSelection.selectArrivalSg(contractId, () => this.rebuildFields());
  }

  get arrivalSgRedeemAmount(): string | null {
    if (!this.pickerSelection.arrivalSgSnapshot) return null;
    const billAmount = Number(this.model.amount);
    if (!this.model.amount || !isFinite(billAmount) || billAmount <= 0) return null;
    return String(Math.min(billAmount, Number(this.pickerSelection.arrivalSgSnapshot.confirmedBalance)));
  }

  get arrivalSgRedeemType(): 'FULL_REDEEM' | 'PARTIAL_REDEEM' | null {
    if (!this.pickerSelection.arrivalSgSnapshot || !this.arrivalSgRedeemAmount) return null;
    return Number(this.arrivalSgRedeemAmount) >= Number(this.pickerSelection.arrivalSgSnapshot.confirmedBalance) ? 'FULL_REDEEM' : 'PARTIAL_REDEEM';
  }

  get arrivalSgRemaining(): string | null {
    if (!this.pickerSelection.arrivalSgSnapshot || !this.arrivalSgRedeemAmount) return null;
    return String(Math.max(0, Number(this.pickerSelection.arrivalSgSnapshot.confirmedBalance) - Number(this.arrivalSgRedeemAmount)));
  }

  /**
   * Business instruction 2026-08-20 ("A35 可以使用SG交易的金額 所以應該是 Tight Available + 選中SG的金額") —
   * the "Typed amount exceeds Tight Available Balance" warning below used to compare `model.amount`
   * against the plain `tightAvailableBalance` even while A35 (documentArrivalWithSg) is selected, a false
   * positive: `checkUtilizeSufficiency()` (offBalanceExposure.ts) never actually applies that raw
   * threshold here — the caller submits the matched SG's own redemption FIRST, netting that SG's
   * `confirmedBalance` (Outstanding) out of `offBalanceExposure` before the LC UTILIZE's own tier-2 check
   * runs, so the REAL ceiling this movement can reach is `tightAvailableBalance + SG Outstanding`.
   *
   * B4 (`HONOUR`/`ACCEPT`) widened the same day, same root cause, found while unifying every function's
   * own live check to match its server formula ("A2-A9, B2-B5... 統一在金額輸入時都檢查"): the persisted
   * `tightAvailableBalance` snapshot field, for an `EPLC_CONFIRMATION` contract, already nets OUT the full
   * Present Docs Earmark (`assembleSnapshot()`'s own EPLC_CONFIRMATION branch, `balanceService.ts`) —
   * including the very B3 presentation THIS B4 is about to consume. But B4's own actual server-side check
   * (`checkUtilizeShapedSufficiency`) sets `offBalanceExposure = 0` for any non-IPLC_LC/EPLC_LC contract, so
   * it never nets Present Docs Earmark at all — B4's real ceiling is `plain tightAvailableBalance + the
   * referenced B3 record's own ceilingAmount` (the earmark this B4 is resolving, not a second exposure to
   * subtract). Without this widening, B4 would show the exact same class of false positive A35 had.
   *
   * Falls back to the plain `tightAvailableBalance` for every other function (plain A3, A35/B4 before a
   * matching SG/B3 record is picked) — same value as before either fix.
   */
  get tightAvailableBalanceForWarning(): string | null {
    const plain = this.selectedContractSnapshot?.tightAvailableBalance ?? null;
    if (plain === null || plain === undefined) return null;
    if (this.selectedFunctionStrategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg')) {
      if (!this.pickerSelection.arrivalSgSnapshot) return plain;
      return String(Number(plain) + Number(this.pickerSelection.arrivalSgSnapshot.confirmedBalance));
    }
    if (this.model.movementType === 'HONOUR' || this.model.movementType === 'ACCEPT') {
      if (!this.pickerSelection.selectedPayMovement) return plain;
      return String(Number(plain) + Number(this.pickerSelection.selectedPayMovement.ceilingAmount));
    }
    return plain;
  }

  onSelectPayMovement(movementId: string): void {
    this.applyPayMovementOutcome(this.pickerSelection.selectPayMovement(movementId, this.selectedFunctionStrategy, this.selectedFunction?.secondaryRefLabel));
  }

  private applyPayMovementOutcome(outcome: PayMovementSelectionOutcome): void {
    if (outcome.naturalKeyIbNumber !== undefined) this.naturalKey.ibNumber = outcome.naturalKeyIbNumber;
    if (outcome.modelSecondaryRef !== undefined) this.model.secondaryRef = outcome.modelSecondaryRef;
    if (outcome.modelAmount !== undefined) this.model.amount = outcome.modelAmount;
    if (outcome.needsRebuildFields) this.rebuildFields();
    if (outcome.clearsSubmitResult) {
      this.submitResult = null;
      this.submitError = null;
      this.emitContext();
    }
  }

  /** A4's own real Maker Submit — A4 has no movement of its own to create, so this releases the picked existing movement instead. */
  submitA4(): void {
    if (!this.pickerSelection.selectedPayMovement) return;
    this.submitting = true;
    this.submitResult = null;
    this.submitError = null;
    this.api.submitByMaker(this.pickerSelection.selectedPayMovement.movementId, this.model.createdBy || 'maker1').subscribe({
      next: (res) => {
        this.submitting = false;
        this.submitResult = res;
        this.emitContext();
        this.emitCheckerAndLookupSync();
      },
      error: (err) => {
        this.submitting = false;
        this.submitError = this.describeApiError(err);
      },
    });
  }

  refreshSelectedContractSnapshot(): void {
    if (!this.selectedContract) {
      this.selectedContractSnapshot = null;
      return;
    }
    this.snapshotLoading = true;
    this.api.getSnapshot(this.selectedContract.balanceContractId).subscribe({
      next: (snap) => {
        this.snapshotLoading = false;
        this.selectedContractSnapshot = snap;
        // 2026-08-26 (SonarQube-scan-report.md, typescript:S1871) — was 3 separate if/else-if branches
        // with an identical body (`this.model.amount = snap.availableBalance; this.rebuildFields();`),
        // differing only in which function's own Amount-derivation rule matched; collapsed into one guard.
        const amountFromAvailableBalance =
          this.model.movementType === 'FULL_SETTLE' ||
          (this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'SETTLE' && this.model.instrumentType === 'EPLC_ACCEPTANCE') ||
          this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'REDEEM';
        if (amountFromAvailableBalance) {
          this.model.amount = snap.availableBalance;
          this.rebuildFields();
        } else if (this.selectedFunctionStrategy?.movementDerivation.amountAutoFilledFrom === 'confirmedBalance') {
          // A10/B6 — the RELEASED figure (Confirmed Balance), not availableBalance (which also nets
          // still-PENDING deltas) — Close writes off what has actually been approved, not what a
          // not-yet-approved movement would leave behind.
          this.model.amount = snap.confirmedBalance;
          this.rebuildFields();
        }
      },
      error: () => {
        this.snapshotLoading = false;
        this.selectedContractSnapshot = null;
      },
    });
  }

  searchExistingContract(): void {
    if (!this.model.instrumentType) return;
    this.searchError = null;
    this.searchErrorIsNotFound = false;
    if (!this.searchNaturalKey.lcNumber) {
      this.searchError = 'LC Number is mandatory to search.';
      return;
    }
    if (this.requiredNaturalKeyFields.includes('ibNumber') && !this.searchNaturalKey.ibNumber) {
      this.searchError = `${this.ibNumberLabel} is mandatory to search — this LC may have multiple Document Arrivals, and LC Number alone doesn't identify which one.`;
      return;
    }
    if (this.requiredNaturalKeyFields.includes('sgNumber') && !this.searchNaturalKey.sgNumber) {
      this.searchError = 'SG Number is mandatory to search.';
      return;
    }
    this.api
      .resolveContract(this.model.instrumentType, {
        lcNumber: this.searchNaturalKey.lcNumber,
        ibNumber: this.searchNaturalKey.ibNumber || null,
        sgNumber: this.searchNaturalKey.sgNumber || null,
      })
      .subscribe({
        next: (contract) => {
          if (this.model.movementType && DECREASING_MOVEMENT_TYPES.has(this.model.movementType)) {
            this.api.getSnapshot(contract.balanceContractId).subscribe((snap) => {
              if (snap.availableBalance === '0') {
                const label = this.requiredNaturalKeyFields.includes('sgNumber')
                  ? `SG ${contract.naturalKey.sgNumber}`
                  : `${this.ibNumberLabel} ${contract.naturalKey.ibNumber}`;
                this.searchError = `${label} already has a 0 Available Balance — nothing left to ${this.model.movementType === 'FULL_REDEEM' || this.model.movementType === 'PARTIAL_REDEEM' ? 'redeem' : 'settle'}.`;
                return;
              }
              this.selectedContract = contract;
              this.applyCarriedContractFields();
              this.refreshSelectedContractSnapshot();
              this.emitCheckerAndLookupSync();
            });
            return;
          }
          this.selectedContract = contract;
          this.applyCarriedContractFields();
          this.refreshSelectedContractSnapshot();
          this.emitCheckerAndLookupSync();
        },
        error: (err) => {
          this.selectedContract = null;
          this.selectedContractSnapshot = null;
          // "Search — No Match Message" rule (business-directed) — a genuine 404 (nothing matched the
          // typed natural key) reads as "{query} not found", same wording/shape as the picker-based
          // searches (IndexPickerComponent.displayedEmptyText). Any OTHER error (network failure, 500,
          // etc.) still falls back to describeApiError() — this is specifically the "searched, found
          // nothing" case, not a generic error catch-all.
          const status = (err as { status?: number } | null)?.status;
          const query = [this.searchNaturalKey.lcNumber, this.searchNaturalKey.ibNumber || this.searchNaturalKey.sgNumber || null]
            .filter((v): v is string => !!v)
            .join(' / ');
          this.searchErrorIsNotFound = status === 404;
          this.searchError = this.searchErrorIsNotFound ? notFoundMessage(query) : this.describeApiError(err);
        },
      });
  }

  onSelectParent(contractId: string, loadSourceTransaction = true): void {
    this.selectedParent = this.parentPicker.contracts.find((c) => c.balanceContractId === contractId) ?? null;
    this.applyCarriedContractFields();
    if (this.isCreatingMovement && this.selectedParent) {
      this.naturalKey.lcNumber = this.selectedParent.naturalKey.lcNumber;
    }
    if (this.usesTwoFieldSearch && this.selectedParent) {
      this.searchNaturalKey.lcNumber = this.selectedParent.naturalKey.lcNumber;
      this.searchNaturalKey.ibNumber = '';
      this.searchNaturalKey.sgNumber = '';
      this.searchError = null;
      this.selectedContract = null;
      this.selectedContractSnapshot = null;
      this.loadIbIndex();
    }
    if (loadSourceTransaction && this.selectedFunctionStrategy?.checkerRelease.settlesDocumentArrival && this.selectedParent) {
      this.pickerSelection.loadPayableMovements({
        contractId: this.selectedParent.balanceContractId,
        lcNumber: this.selectedParent.naturalKey.lcNumber,
        selectedFunction: this.selectedFunction,
        selectedFunctionStrategy: this.selectedFunctionStrategy,
        onAutoPicked: (outcome) => this.applyPayMovementOutcome(outcome),
      });
    }
    if (this.selectedFunctionStrategy?.selectionFlow.usesSettleableBalanceIndex && this.selectedParent) {
      this.pickerSelection.loadSettleableBalances(this.selectedParent.naturalKey.lcNumber, this.selectedFunction?.instrumentType);
    }
    // Business instruction 2026-08-20 ("B3金額輸入檢查與B2 Decrease相同 <= Tight Available Balance") — B3
    // (and A8, the same shape) creates a brand-new child contract directly under the picked parent, with
    // no further Step-2 picker of its own (unlike A6/B4's settlesDocumentArrival or B5's
    // usesSettleableBalanceIndex, both excluded below) — so `selectedContract`/`selectedContractSnapshot`
    // were NEVER populated after onSelectParent() alone, meaning the balance box AND both Available/Tight
    // Available Balance warnings below (both gated on `selectedContract`) never rendered at all for B3/A8:
    // the Maker got zero live feedback before a Submit that the server would then 409 on. Aliasing
    // `selectedContract` to the parent here is safe for this specific shape only — B3/A8 read `selectedParent`
    // (never `selectedContract`) for their own submission/natural-key logic, so this alias exists purely to
    // drive the shared balance-box/warning template block, which already reads `selectedContract.instrumentType`
    // to pick Present Docs Earmark vs. SHGT-exposure wording (see the Tight Available Balance warning's own
    // EPLC_CONFIRMATION branch) — exactly correct for B3, which needs that same branch.
    if (
      this.isCreatingMovement &&
      !this.usesTwoFieldSearch &&
      !this.selectedFunctionStrategy?.checkerRelease.settlesDocumentArrival &&
      !this.selectedFunctionStrategy?.selectionFlow.usesSettleableBalanceIndex &&
      this.selectedParent
    ) {
      this.selectedContract = this.selectedParent;
      this.refreshSelectedContractSnapshot();
    }
    if (this.selectedFunction?.tenorTypeOptions?.length && this.isCreatingMovement && this.hasParent && this.selectedParent) {
      this.model.tenorType = this.selectedParent.tenorType ?? undefined;
      this.model.tenorDays = this.selectedParent.tenorDays ?? undefined;
      this.rebuildFields();
    }
    // Business instruction 2026-08-20 ("除了A1 & B1，其他功能當選取LC NUMBER後 Look Up Current Balance
    // 自動輸入選取到的LC NUMBER 做 LOOKUP處理") — onSelectParent() (A6/A7/A8/B3/B4/B5's own Parent LC pick)
    // never synced anything at all before this fix, a real gap even the prior selection-only
    // emitCheckerSync() design missed for this specific picker.
    this.emitCheckerAndLookupSync();
  }

  private loadIbIndex(): void {
    this.ibIndexPicker.load({
      guardFails: !this.model.instrumentType,
      instrumentType: this.model.instrumentType!,
      query: null,
      qualifies: () => this.filteredIbIndexCatalog.length,
    });
  }

  onCombinedIndexSearch(): void {
    this.ibIndexPicker.page = 1;
    this.ibIndexPicker.total = this.filteredIbIndexCatalog.length;
  }

  ibIndexPrevPage(): void {
    const page = this.ibIndexPicker.prevTarget();
    if (page !== null) this.ibIndexPicker.page = page;
  }
  ibIndexNextPage(): void {
    const page = this.ibIndexPicker.nextTarget();
    if (page !== null) this.ibIndexPicker.page = page;
  }

  settleableBalancesPrevPage(): void {
    this.pickerSelection.settleableBalancesPrevPage();
  }
  settleableBalancesNextPage(): void {
    this.pickerSelection.settleableBalancesNextPage();
  }

  onSelectSettleableBalance(balanceContractId: string): void {
    const outcome = this.pickerSelection.selectSettleableBalance(balanceContractId, this.selectedParent?.naturalKey.lcNumber);
    if (!outcome) return;
    this.model.instrumentType = outcome.instrumentType;
    this.selectedContract = outcome.contract;
    this.applyCarriedContractFields();
    this.searchNaturalKey.ibNumber = outcome.ibNumber;
    this.refreshSelectedContractSnapshot();
    this.emitCheckerAndLookupSync();
  }

  /** No special-case rule exists for the IB Index picker; always resolves to `genericFallback`. Kept as
   * its own resolver for symmetry with the other two, in case a future function needs one. */
  private resolveIbIndexEligibilityRule(): EligibilityRule {
    return { kind: 'genericFallback', gatedByMovementType: true };
  }

  get filteredIbIndexCatalog(): BalanceContract[] {
    const query = this.ibIndexPicker.search.trim().toLowerCase();
    const searched = query
      ? this.ibIndexPicker.contracts.filter((contract) =>
          [contract.naturalKey.lcNumber, contract.naturalKey.ibNumber, contract.naturalKey.sgNumber].some((value) => value?.toLowerCase().includes(query)),
        )
      : this.ibIndexPicker.contracts;
    return applyEligibilityRule(searched, this.resolveIbIndexEligibilityRule(), this.model.movementType, this.ibIndexPicker.snapshots);
  }

  get pagedFilteredIbIndexCatalog(): BalanceContract[] {
    const start = (this.ibIndexPicker.page - 1) * this.ibIndexPicker.pageSize;
    return this.filteredIbIndexCatalog.slice(start, start + this.ibIndexPicker.pageSize);
  }

  transactionContractAmount(contract: BalanceContract): string {
    const snapshot = this.ibIndexPicker.snapshots.get(contract.balanceContractId);
    return snapshot ? `${formatCurrencyAmount(snapshot.availableBalance, snapshot.currency)} ${snapshot.currency}` : '—';
  }

  arrivalSgIndexAmount(contract: BalanceContract): string {
    const snapshot = this.pickerSelection.arrivalSgSnapshots.get(contract.balanceContractId);
    return snapshot ? `${formatCurrencyAmount(snapshot.availableBalance, snapshot.currency)} ${snapshot.currency}` : '—';
  }

  onSelectIbIndex(contractId: string): void {
    this.selectedContract = this.ibIndexPicker.contracts.find((c) => c.balanceContractId === contractId) ?? null;
    this.searchError = null;
    if (this.selectedContract) {
      this.searchNaturalKey.lcNumber = this.selectedContract.naturalKey.lcNumber;
      this.searchNaturalKey.ibNumber = this.selectedContract.naturalKey.ibNumber ?? '';
      this.searchNaturalKey.sgNumber = this.selectedContract.naturalKey.sgNumber ?? '';
    }
    this.applyCarriedContractFields();
    this.refreshSelectedContractSnapshot();
    this.emitCheckerAndLookupSync();
  }

  /** Shared with confirmFixPending() below — one assembly of everything buildFields()/isFixPendingFieldEditable() read, so the two can never disagree about the current Function/model state. */
  private buildFieldsContext(): BuilderFieldsContext {
    return {
      model: this.model,
      selectedFunction: this.selectedFunction,
      selectedPayMovement: this.pickerSelection.selectedPayMovement,
      selectedContract: this.selectedContract,
      selectedContractSnapshot: this.selectedContractSnapshot,
      selectedParent: this.selectedParent,
      dynamicSecondaryRefLabel: this.dynamicSecondaryRefLabel,
      fixPendingMode: this.fixPendingMode,
    };
  }

  private rebuildFields(): void {
    this.fields = buildFields(this.buildFieldsContext());
  }

  get formLocked(): boolean {
    return !!this.submitResult;
  }

  /**
   * Fix Pending's own reconstructed form must be genuinely editable, not forced read-only by
   * `formLocked` (`submitResult` still holds the record being corrected while this is open) — the
   * natural-key pickers/inputs stay locked regardless (they're bound to `formLocked` directly in the
   * template, not this getter), only the Formly-rendered fields below unlock.
   */

  get requiresEligibleTarget(): boolean {
    return !!this.selectedFunction && !(policy.isCreatingMovement(this.model) && !policy.hasParent(this.model));
  }

  get hasEligibleTargetSelected(): boolean {
    return hasEligibleTargetSelectedRule(this.submitRulesContext);
  }

  get eligibleCandidateCount(): number {
    return policy.hasParent(this.model) ? this.parentPicker.total : this.catalogPicker.total;
  }

  /**
   * Reviewer-reported 2026-08-26 ("A35 A7 先出現 ⚠ No eligible records... 再出現交易" / "如果有交易 ⚠ No
   * eligible records... 訊息不應該出現" / "選 A3S 或 A7 FULL SETTLE 就可以看到這 ERROR 訊息一閃而過") — two
   * independent gaps, both closed here:
   *
   * 1. `eligibleCandidateCount`'s own source picker (`parentPicker`/`catalogPicker`, same `hasParent`
   *    branch as that getter) starts its `total` at 0 the instant `load()` resets paging, before the HTTP
   *    round trip (contracts, then snapshots) resolves.
   * 2. For any function whose own `resolveCatalogEligibilityRule()`/`resolveParentEligibilityRule()`
   *    returns `{kind:'hintSet', ...}` (A3S/A4/A6/A7/A9/A10/A11/B3/B4/B5/B6/B7 — every function with a
   *    server-computed eligibility hint-set), `total` is NOT final even once `loading` itself goes false:
   *    `reloadCatalog()`/`loadParent()`'s own `onLoaded` callback fires a THIRD, separate async hint-set
   *    fetch (`DocumentArrivalHintsService.loadXxxEligibility()`) — `CatalogPickerService.loading` only
   *    wraps the first two steps (contracts + snapshots), never this one. The hint-set Map/Set itself
   *    starts EMPTY, so `applyEligibilityRule()`'s `'hintSet'` branch reads 0 eligible candidates for the
   *    entire window between `loading` going false and the hint-set actually arriving — reproduced live by
   *    switching A7's own Settlement Type (Full/Partial Settle re-triggers `loadParent()` from scratch).
   *
   * `hintsPending` (incremented immediately before each hint-set fetch starts in `reloadCatalog()`/
   * `loadParent()`, decremented in that fetch's own completion callback) closes gap 2 — only consulted
   * when the CURRENT function's own eligibility rule is actually `'hintSet'`-shaped, so a function with no
   * hint-set dependency (e.g. A2's plain flat Catalog) is never held up by an unrelated counter.
   */
  private hintsPending = 0;

  get eligiblePickersLoading(): boolean {
    if (policy.hasParent(this.model)) {
      return this.parentPicker.loading || (this.resolveParentEligibilityRule().kind === 'hintSet' && this.hintsPending > 0);
    }
    return this.catalogPicker.loading || (this.resolveCatalogEligibilityRule().kind === 'hintSet' && this.hintsPending > 0);
  }

  get noEligibleRecordsMessage(): string | null {
    if (!this.requiresEligibleTarget || this.hasEligibleTargetSelected || this.eligiblePickersLoading) return null;
    return this.eligibleCandidateCount === 0
      ? 'No eligible records available for this transaction.'
      : 'Pick an eligible record from the list below to continue.';
  }

  get fieldsLocked(): boolean {
    if (this.fixPendingMode) return false; // see startFixPending()'s own doc comment
    return this.formLocked || (this.requiresEligibleTarget && !this.hasEligibleTargetSelected);
  }

  get isSubmitReady(): boolean {
    return this.hasEligibleTargetSelected && validateSubmitRules(this.submitRulesContext).error === null;
  }

  get displayFields(): FormlyFieldConfig[] {
    return this.fieldsLocked ? toReadOnlyFields(this.fields) : this.fields;
  }

  private validateSubmit(): boolean {
    const { error, patch } = validateSubmitRules(this.submitRulesContext);
    Object.assign(this.model, patch);
    if (error) {
      this.submitError = error;
      return false;
    }
    return true;
  }

  private get submitRulesContext(): SubmitRulesContext {
    return {
      model: this.model,
      naturalKey: this.naturalKey,
      selectedFunction: this.selectedFunction,
      dynamicSecondaryRefLabel: this.dynamicSecondaryRefLabel,
      activeFunctionSide: this.activeFunctionSide,
      selectedPayMovement: this.pickerSelection.selectedPayMovement,
      selectedArrivalSg: this.pickerSelection.selectedArrivalSg,
      arrivalSgSnapshot: this.pickerSelection.arrivalSgSnapshot,
      selectedContractSnapshot: this.selectedContractSnapshot,
      selectedContract: this.selectedContract,
      selectedParent: this.selectedParent,
      exposureNature: this.exposureNature,
      amendDirection: this.amendDirection,
    };
  }

  private buildSubmitRequest(): CreateMovementRequest | null {
    const { request, error } = buildSubmitRequestRules(this.submitRulesContext);
    if (error) this.submitError = error;
    return request;
  }

  private buildMakerSubmitContext(): MakerSubmitContext {
    return {
      model: this.model,
      naturalKey: this.naturalKey,
      selectedFunction: this.selectedFunction,
      selectedContract: this.selectedContract,
      selectedArrivalSg: this.pickerSelection.selectedArrivalSg,
      arrivalSgSnapshot: this.pickerSelection.arrivalSgSnapshot,
    };
  }

  private applyMakerSubmitOutcome(outcome: MakerSubmitOutcome): void {
    const next = reduceMakerSubmitOutcome(this, outcome);
    this.submitting = next.submitting;
    this.submitResult = next.submitResult;
    this.submitError = next.submitError;
    this.compoundLegs = next.compoundLegs;

    if (outcome.kind === 'submitted') {
      this.emitContext();
      this.emitCheckerAndLookupSync();
      return;
    }
    this.emitContext();
  }

  submit(): void {
    if (!this.validateSubmit()) return;
    const req = this.buildSubmitRequest();
    if (!req) return;

    const next = beginMakerSubmission(this);
    this.submitting = next.submitting;
    this.submitResult = next.submitResult;
    this.submitError = next.submitError;
    this.compoundLegs = next.compoundLegs;
    this.arrivalApproved = false;

    this.makerSubmit.submit(req, this.buildMakerSubmitContext()).subscribe((outcome) => this.applyMakerSubmitOutcome(outcome));
  }

  /**
   * Applies a Checker-initiated outcome (Release/Reject/Delete-Pending — still parent-owned) into this
   * panel's own state, minus `actionBusy` (parent resets it directly for every outcome kind).
   */
  private applyCheckerOutcome(outcome: CheckerActionOutcome): void {
    if (outcome.kind === 'failed') {
      this.submitError = outcome.message;
      this.emitContext();
      return;
    }
    if (outcome.kind === 'documentArrivalAcknowledged') {
      this.arrivalApproved = true;
      this.refreshSelectedContractSnapshot();
      this.emitCheckerAndLookupSync();
      this.pickerSelection.loadSgsForArrival(this.selectedContract?.naturalKey.lcNumber, () => this.rebuildFields());
      this.emitContext();
      return;
    }
    this.submitResult = outcome.result;
    // Phase 4 (2026-08-28) — an A3S compound Fix Pending edit's own resolved SG leg (see
    // CheckerActionsService.editPending()'s own doc comment); every other 'released' outcome producer
    // leaves `secondary` undefined, same "safe as a plain merge-spread" reasoning
    // applyMakerSubmitOutcome() already documents for the analogous fresh-Submit case.
    if ('secondary' in outcome && outcome.secondary) this.compoundLegs = { ...this.compoundLegs, ...outcome.secondary };
    this.fixPendingMode = false; // closes Fix Pending's own edit mode once its outcome (success or otherwise routed here) lands — model already holds the accepted edited values
    // Bug fix, found live 2026-08-28 auditing the "Maker Queue -> Fix Pending -> Save" flow: this used to
    // leave `this.fields` exactly as `startFixPending()` last built it (Fix-Pending-mode field configs —
    // e.g. Currency's own label reading "locked — Fix Pending can never change Currency, see §15") even
    // after `fixPendingMode` flips back to `false` here. `displayFields`'s own `toReadOnlyFields()`
    // wrapper already forces every field functionally disabled via `fieldsLocked` regardless, so this was
    // never a REAL edit-after-Save bug — but the rendered LABEL text stayed stale/misleading, implying
    // Fix Pending was still active when it wasn't. `cancelFixPending()` already rebuilds in the equivalent
    // spot; this path was simply missing the same call.
    this.rebuildFields();
    this.refreshSelectedContractSnapshot();
    this.emitCheckerAndLookupSync();
    this.emitContext();
  }

  /**
   * Reverse of `onSubChoice()` — reconstructs `subChoiceValue`/`amendDirection` from the just-loaded
   * `submitResult`, so the Fix Pending／Delete Pending review screen shows the ORIGINALLY-selected
   * Direction instead of a blank "— select —" (user-directed 2026-08-28, "Direction * 顯示出來當初選的
   * 不可以改" — an explicit correction of an earlier same-day "hide it entirely" instruction; see the
   * Direction `<select>`'s own template comment). `onSubChoice()` itself is never called on this
   * reconstruction path, so without this, neither field would otherwise be populated. Mirrors
   * `onSubChoice()`'s own three branches in reverse: a matching `movementTypeOverride` wins first
   * (Expiry Date, A2/B2 alike); otherwise `'movementType'` (A2/A7) reads straight off the reconstructed
   * `model.movementType`; otherwise `'amendDirection'` (B2) derives via the SAME `displayMovementType()`
   * this app already uses elsewhere to show B2's own signed `AMEND` as `AMEND_INCREASE`/`AMEND_DECREASE`,
   * then strips the shared `'AMEND_'` prefix down to this dropdown's own `INCREASE`/`DECREASE` option
   * values — reusing the existing display derivation rather than a second, independently-invented one.
   */
  private reconstructSubChoiceValue(): void {
    const subChoice = this.selectedFunction?.subChoice;
    if (!subChoice || !this.submitResult) {
      this.subChoiceValue = '';
      return;
    }
    const overrideMatch = subChoice.options.find((o) => o.movementTypeOverride === this.model.movementType);
    if (overrideMatch) {
      this.subChoiceValue = overrideMatch.value;
      return;
    }
    if (subChoice.key === 'movementType') {
      this.subChoiceValue = this.model.movementType ?? '';
      return;
    }
    const displayed = displayMovementType(this.model.instrumentType, this.model.movementType, this.submitResult.amount);
    this.subChoiceValue = displayed.replace('AMEND_', '');
    this.amendDirection = this.subChoiceValue === 'DECREASE' ? 'DECREASE' : 'INCREASE';
  }

  /**
   * Shared by `startFixPending()` and `startDeletePendingReview()` — both need the exact same "return to
   * the real original-event screen" reconstruction (`reconstructOriginalModel()`, the same exhaustive
   * `BuilderModel` source table Inquire Events' own Original Transaction Screen already uses); they only
   * differ in what mode flag they flip once it's ready (`onReady`), since Fix Pending's own screen must
   * end up editable and Delete Pending's own review screen must not.
   */
  private reconstructScreenForSubmitResult(onReady: () => void, errorMessage: string): void {
    if (!this.submitResult) return;
    const apply = (contract: BalanceContract) => {
      this.selectedContract = contract;
      this.naturalKey = { lcNumber: contract.naturalKey.lcNumber, ibNumber: contract.naturalKey.ibNumber ?? '', sgNumber: contract.naturalKey.sgNumber ?? '' };
      this.model = reconstructOriginalModel(this.submitResult!, contract);
      this.reconstructSubChoiceValue();
      onReady();
      this.rebuildFields();
    };
    // A3 already has its own contract selected (it requires picking an existing LC before Submit); A1
    // never does (it creates a brand-new one) — fetch it fresh rather than assume either shape.
    if (this.selectedContract?.balanceContractId === this.submitResult.balanceContractId) {
      apply(this.selectedContract);
      return;
    }
    this.api.getContract(this.submitResult.balanceContractId).subscribe({
      next: (contract) => apply(contract),
      error: () => {
        this.submitError = errorMessage;
      },
    });
  }

  /**
   * "Save Fix Pending" button readiness (user-directed 2026-08-28, "A2 Fix Pending... NOTE: INCREASE
   * DECREASE AMOUNT必填" — verifying this live surfaced a real gap, "用配置設定" not a hardcoded field
   * name). The button's own `[disabled]` used to check `!model.amount` unconditionally — correct for
   * every Fix-Pending-enabled Function's Increase/Decrease-shaped movementTypes (A1/A2/A3/B1), but A2/B2's
   * own third subChoice (`AMEND_EXPIRY_DATE`) hides Amount entirely and requires `newExpiryDate` instead
   * (`builder-fields.ts`'s own `hide: isAmendExpiryDate`/`required: isAmendExpiryDate` on those two
   * fields) — a hardcoded `!model.amount` check would have stayed silently enabled with a blank New
   * Expiry Date. Mirrors `builder-fields.ts`'s own `isAmendExpiryDate` derivation (`model.movementType
   * === 'AMEND_EXPIRY_DATE'`) — the SAME existing switch that already decides which of the two fields is
   * shown/required at the form level, not a second, independently-invented rule.
   */
  get fixPendingSaveReady(): boolean {
    const strategy = this.selectedFunction ? deriveFunctionStrategy(this.selectedFunction) : null;
    if (strategy?.fixPendingMode === 'REMARKS_ONLY') {
      const remarks = this.model.remarks?.trim() || '';
      const originalRemarks = this.submitResult?.remarks?.trim() || '';
      return remarks.length > 0 && remarks !== originalRemarks;
    }
    if (this.model.movementType === 'AMEND_EXPIRY_DATE') return !!this.model.newExpiryDate;
    return !!this.model.amount;
  }

  /**
   * Fix Pending (UX redesign per direct user feedback, "回到原EVENT輸入畫面，放開可以修改的欄位讓用戶修改
   * 後重新SUBMIT") — reconstructs the SAME screen the Maker originally used to Submit, then flips
   * `fixPendingMode` so `fieldsLocked`/`displayFields` render it genuinely editable instead of read-only.
   * `buildFields()` itself keeps LC Number/2ndary Reference/Currency (and every other field this
   * component's own `EditMovementRequest` doesn't yet support editing) disabled even in this mode — see
   * that function's own `fixPendingMode` handling for the exact field-by-field breakdown.
   */
  startFixPending(): void {
    this.reconstructScreenForSubmitResult(() => {
      this.fixPendingMode = true;
    }, 'Could not load this record\'s own contract — Fix Pending cannot proceed.');
  }

  /**
   * Discards any in-progress edit and returns to the read-only display of the record as it currently
   * stands (re-reconstructed from `submitResult`, the authoritative source — not whatever the Maker was
   * mid-typing). Also emits `fixPendingCancelled` unconditionally (2026-08-28, "FIX PENDING OR DELETE
   * PENDING 按CANCEL 回到原來的MAKER QUEUE畫面") — a cheap "cancel happened" signal the parent can act on
   * or ignore: `TransactionBuilderComponent.onFixPendingCancelled()` only navigates back to Maker Queue
   * when THIS Fix Pending session actually originated there (`externalFixPendingRequest` still set); the
   * in-session button's own Cancel (opened from the Maker Result panel after a normal same-session
   * Submit, nothing to "return" to) stays exactly as it always has — reverting to the read-only display
   * in place, never navigating anywhere.
   */
  cancelFixPending(): void {
    this.fixPendingMode = false;
    if (this.submitResult && this.selectedContract) this.model = reconstructOriginalModel(this.submitResult, this.selectedContract);
    this.rebuildFields();
    this.fixPendingCancelled.emit();
  }

  /**
   * Maker Queue's own Delete Pending review screen (2026-08-28, "Maker Queue Delete Pending 也要顯示交易
   * 畫面 確認刪除與否" — "CLICK DELETE PENDING BUTTON -> 顯示交易畫面 (ALL FIELDS PROTECTED) + Confirm /
   * Cancel Button"). Reuses the exact same "return to the real original-event screen" reconstruction Fix
   * Pending already uses, but deliberately never unlocks the fields — `deletePendingReviewMode` doesn't
   * touch `fixPendingMode`, so `fieldsLocked` stays `true` (its own existing default whenever
   * `submitResult` is set) with zero extra logic needed there: the Maker reviews the real record read-only,
   * then explicitly confirms or cancels via the two buttons this mode's own template block renders.
   */
  startDeletePendingReview(): void {
    this.reconstructScreenForSubmitResult(() => {
      this.deletePendingReviewMode = true;
    }, 'Could not load this record\'s own contract — Delete Pending review cannot proceed.');
  }

  /** Reports "confirmed" up to the parent, which owns the actual delete call (`MakerQueueService.deletePending()` — cascade-aware for a compound row via its own server-reconstructed `siblingMovementIds`) — this panel only ever requested a review, never the deletion itself. */
  confirmDeletePendingReview(): void {
    this.deletePendingReviewMode = false;
    this.deletePendingReviewConfirmed.emit();
  }

  /** No delete call was ever made — just closes the review screen. The parent decides where to navigate next (back to Maker Queue). */
  cancelDeletePendingReview(): void {
    this.deletePendingReviewMode = false;
    this.deletePendingReviewCancelled.emit();
  }

  /**
   * Builds the Fix Pending patch by asking `isFixPendingFieldEditable()` (`builder-fields.ts`) about
   * each field individually — the SAME per-field derivation `buildFields()` itself used to decide which
   * fields render disabled (2026-08-28, "頁面配置檔原先輸入或FIX PENDING可共用" — shared, not a second
   * independently-declared list). `amount` is always sent (the backend's own `EditMovementRequest.amount`
   * is unconditionally required, and a Function that doesn't derive it as editable leaves it disabled in
   * `buildFields()`, so `this.model.amount` still holds the original, unchanged value in that case);
   * every other field is included ONLY when this exact derivation says so, so a Function that never
   * derives e.g. `tolerancePct` as editable never even sends it.
   */
  private static readonly FIX_PENDING_PATCH_FIELDS: readonly Exclude<FixPendingEditableField, 'amount'>[] = [
    'tolerancePct',
    'tenorType',
    'tenorDays',
    'expiryDate',
    'newExpiryDate',
    'reasonCode',
    'remarks',
  ];

  confirmFixPending(): void {
    if (!this.submitResult || !this.model.amount) return;
    const ctx = this.buildFieldsContext();
    const patch: Record<string, unknown> = { movementId: this.submitResult.movementId, amount: String(this.model.amount) };
    const strategy = this.selectedFunction ? deriveFunctionStrategy(this.selectedFunction) : null;
    if (strategy?.fixPendingMode === 'REMARKS_ONLY') {
      const remarks = this.model.remarks?.trim() || null;
      const originalRemarks = this.submitResult.remarks?.trim() || null;
      if (!remarks || remarks === originalRemarks) return;
      patch['editMode'] = 'REMARKS_ONLY';
      patch['remarks'] = remarks;
      this.model.remarks = remarks ?? undefined;
      this.fixPendingRequested.emit(patch as Record<string, unknown> & { movementId: string });
      return;
    }
    for (const field of MakerPanelComponent.FIX_PENDING_PATCH_FIELDS) {
      if (!isFixPendingFieldEditable(ctx, field)) continue;
      const value = this.model[field];
      // tolerancePct is typed `string` on BuilderModel, but its own Formly field is `type: 'number'` —
      // Angular's NumberValueAccessor coerces the bound value to a real JS number at runtime (same trap
      // amount's own submit-rules.ts coercion already guards against), which the backend's `EditMovement
      // RequestSchema` (z.string()) rejects with "Expected string, received number". tenorDays is the
      // one other numeric field here, but its own schema genuinely expects z.number() — left uncoerced.
      patch[field] = field === 'tolerancePct' && value != null ? String(value) : (value ?? null);
    }
    this.fixPendingRequested.emit(patch as Record<string, unknown> & { movementId: string });
  }
}
