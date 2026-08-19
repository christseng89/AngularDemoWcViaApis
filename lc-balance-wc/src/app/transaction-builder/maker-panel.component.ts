import { Component, EventEmitter, Inject, InjectionToken, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot, CreateMovementRequest } from './balance-component-api.service';
import { IndexPickerComponent } from './index-picker.component';
import { CheckerActionOutcome } from './checker-actions.service';
import { MakerSubmitContext, MakerSubmitOutcome, MakerSubmitService } from './maker-submit.service';
import { CatalogPickerService } from './catalog-picker.service';
import { DocumentArrivalHintsService } from './document-arrival-hints.service';
import { PayMovementSelectionOutcome, PickerSelectionService } from './picker-selection.service';

/**
 * F-04 pattern (desiger-comments.md, 2026-08-19) reused verbatim here — `CatalogPickerService` has NO
 * `@Injectable()` decorator at all (confirmed by direct file read before writing this), so it can only
 * ever be resolved via an explicit `useFactory` provider, never a bare class-type token; this component
 * needs THREE differently-configured instances (`fetchSize`), so each gets its own `InjectionToken`,
 * exactly mirroring `TransactionBuilderComponent`'s own `CATALOG_PICKER`/`PARENT_PICKER`/`IB_INDEX_PICKER`
 * tokens. Module-level `const`s, not class members — the `@Component({ providers: [...] })` array below
 * sits textually OUTSIDE the class body, so a `private`/`static` class member wouldn't be visible there.
 */
const CATALOG_PAGE_SIZE = 100;
const PARENT_PAGE_SIZE = 100;
const IB_INDEX_PAGE_SIZE = 100;
const CATALOG_PICKER = new InjectionToken<CatalogPickerService>('MakerPanelComponent.catalogPicker');
const PARENT_PICKER = new InjectionToken<CatalogPickerService>('MakerPanelComponent.parentPicker');
const IB_INDEX_PICKER = new InjectionToken<CatalogPickerService>('MakerPanelComponent.ibIndexPicker');
import { describeApiError as describeApiErrorShared } from './api-error';
import {
  DECREASING_MOVEMENT_TYPES,
  InstrumentType,
  TransactionFunction,
  amountExceedsCurrencyDecimals,
  decimalPlacesForCurrency,
  displayStatus as displayStatusShared,
  groupThousands,
} from './balance-component.model';
import { buildFields, toReadOnlyFields } from './builder-fields';
import {
  SubmitRulesContext,
  buildSubmitRequest as buildSubmitRequestRules,
  hasEligibleTargetSelected as hasEligibleTargetSelectedRule,
  validateSubmit as validateSubmitRules,
} from './submit-rules';
import { deriveFunctionStrategy } from './function-strategy';
import * as policy from './function-policy';
import { BuilderModel } from './function-policy';

/**
 * The fields `TransactionBuilderComponent.buildCheckerActionContext()` needs from this panel's own
 * state, mirroring `CheckerActionContext`'s own shape minus `selectedFunction`/`selectedCheckerMovement`
 * (both stay parent-owned — see this component's own class doc comment). Emitted on `contextChanged`
 * every time any of these values actually change (`resetForFunction()`, a Submit outcome, applying an
 * `externalCheckerOutcome`, or picking a pay movement) — the parent keeps its own mirror copy, same
 * "child owns the write, parent keeps a read mirror via an event" convention `CheckerPanelComponent`'s
 * own `movementPicked` output already established in Phase 1.
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

/** A pending sync request for the Checker's own independent search AND (only when `alsoSyncLookup` is set) the Look Up Current Balance panel — see `TransactionBuilderComponent.syncCheckerToContext()`'s pre-extraction body for the original, single-component version of this. `instrumentType` is only read when `alsoSyncLookup` is true (Look Up's own `syncFrom()` needs it; the Checker's own search resolves its own instrumentType from `selectedFunction` already). */
export interface MakerSyncRequest {
  lcNumber: string;
  secondaryRef: string | null;
  alsoSyncLookup: boolean;
  instrumentType: InstrumentType | undefined;
}

/**
 * BAL-003 "Feature Components + Facade" pilot #3 (2026-08-19, desiger-comments.md — Phase 2 of the
 * 8-phase architecture proposal, user-confirmed full scope after being warned it's materially riskier
 * than Phase 1's `CheckerPanelComponent`). Owns the Maker's own form/selection state — `model`/
 * `naturalKey`/`searchNaturalKey`/`selectedContract`/`selectedContractSnapshot`/`selectedParent`/
 * `subChoiceValue`/`amendDirection`/`fields`/`submitting`/`submitResult`/`submitError` — and every
 * picker/selection/validation/submit method built on top of them, including the "MAKER RESULT" panel
 * (Account Entries buttons, Delete Pending) that directly displays `submitResult`'s own outcome.
 *
 * **Ownership boundary, decided after reading every one of the 7 files this state feeds** (`submit-
 * rules.ts`/`builder-fields.ts`/`function-policy.ts` are pure functions — genuinely caller-agnostic, need
 * zero interface changes; `MakerSubmitContext`/`CheckerActionContext` needed zero interface changes
 * either — only WHERE they're assembled moved; `PickerSelectionService`/`CatalogPickerService` needed no
 * interface changes, only which component injects/owns them). The one genuinely hard problem: `submit()`
 * (Maker-initiated) and the Checker's own `release()`/`reject()`/`deleteMakerPending()` (still parent-
 * owned, see below) BOTH write into `submitResult`/`arrivalApproved`/the 7 compound-leg movement fields —
 * a real shared-mutable-state case, not a clean one-directional producer/consumer split. Resolved the
 * SAME way Phase 1's own `syncFromContext()` resolved an analogous one-directional problem: an `@Input()`
 * SIGNAL object (`externalCheckerOutcome`, fresh reference per emission — same "the object itself is the
 * trigger, not (only) its contents" reasoning `CheckerSyncSignal`'s own doc comment already established),
 * reacted to in `ngOnChanges()` by applying the exact same state-mutation logic
 * `applyCheckerActionOutcome()`/`finishCheckerAction()`/`failCheckerAction()` used inline before this
 * extraction — now living here, since it needs to write into now-child-owned fields. The PARENT keeps
 * `checkerBusy`/`checkerError`/`checkerId`/`actionBusy`/`selectedCheckerMovement`/`releaseSuccessHint`
 * and the entire Checker ACTION layer (`checkerAct()`/`release()`/`reject()`/`deleteMakerPending()`/
 * `approveArrival()`/`isCheckerCompoundOwnSubmission`/`checkerActionButtonLabel`/
 * `isArrivalAcknowledgmentStep`/`checkerActionInFlight`) — those genuinely belong with the VISUAL Checker
 * section (the Release/Reject buttons render inside `<app-checker-panel>`'s own projected content, not
 * this panel's own template), and moving them here would misalign the component boundary with the actual
 * UI feature boundary for no real gain (Phase 1's own class doc comment already reached the identical
 * conclusion for the SAME reason, scoped to a smaller surface).
 *
 * A genuinely new coupling THIS extraction introduces (Phase 1 never needed it, since Checker's own
 * queue-reload trigger is one-directional): `contextChanged` (`MakerCheckerContext`, mirroring
 * `CheckerActionContext`'s Maker-derived fields) and `syncRequested` (`MakerSyncRequest`, replacing the
 * pre-extraction `syncCheckerToContext()`/`syncLookupToContext()` private methods, both of which read
 * Maker-owned `model`/`naturalKey`/`selectedContract`/`selectedParent` and call into parent-owned
 * `lookUp`/`checkerSyncSignal`) are the two outputs that make the reverse direction (child -> parent read
 * mirror) work without `@ViewChild` — same "Input/Output signal, never a direct instance reference"
 * discipline this whole session's F-04 incident already established as load-bearing in this project.
 */
@Component({
  selector: 'app-maker-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FormlyModule, IndexPickerComponent],
  templateUrl: './maker-panel.component.html',
  styleUrl: './maker-panel.component.scss',
  /**
   * desiger-comments.md F-04 (2026-08-19) — component-scoped providers for the 4 services that are
   * genuinely per-component-instance mutable state, never app-wide singletons (each service's own
   * `@Injectable()` doc comment explains why `providedIn: 'root'` would be wrong for it). Mirrors
   * `TransactionBuilderComponent`'s own already-proven `providers` array exactly — see that component's
   * own doc comment (and the "F-04 fully reverted"/"F-04 fixed for real" CLAUDE.md history) for the full
   * incident this pattern exists to avoid: a constructor-parameter DEFAULT VALUE alone is NOT enough —
   * Angular's real, Ivy-compiled production DI factory tries to inject every constructor parameter by
   * type/token unconditionally, regardless of any TS default value, and throws `NullInjectorError` if no
   * provider is registered. `MakerSubmitService` needs NO entry here — it is already a real, correctly
   * `@Injectable({providedIn:'root'})` singleton (unchanged, confirmed by direct file read), so Angular's
   * own root injector already satisfies it without any additional registration.
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
  /** Same counter-based reset signal as `CheckerPanelComponent.resetTrigger` — see that component's own doc comment; the parent increments ONE shared counter, bound to both children, every `selectFunction()` call. */
  @Input() resetTrigger: number | null = null;
  /** Fresh-object-per-emission signal carrying a Checker action's own outcome — see this component's own class doc comment for why this exists (the shared-mutable-state problem `submitResult`/the compound-leg fields create between Maker-initiated Submit and Checker-initiated Release/Reject/Delete-Pending). */
  @Input() externalCheckerOutcome: CheckerActionOutcome | null = null;
  /**
   * A plain nonce-counter signal (same "any change, by `!==`, is the trigger" shape as `resetTrigger`) —
   * mirrors `TransactionBuilderComponent.checkerAct()`'s own PLAIN (non-compound, non-`CheckerActionsService`)
   * release/reject path: the ORIGINAL pre-extraction code called `refreshSelectedContractSnapshot()` +
   * `syncCheckerToContext()` there directly, WITHOUT ever touching `submitResult` (a Checker acting on an
   * item found via their own independent search may have nothing to do with any Maker session's own
   * `submitResult` at all). Deliberately a SEPARATE signal from `externalCheckerOutcome` — routing this
   * through that channel would incorrectly set `submitResult` on every plain Checker action, corrupting
   * the MAKER RESULT panel's own display for an action the Maker may never even be aware of.
   */
  @Input() refreshRequested: number | null = null;
  /** Parent-owned (Checker action layer) — read here only to drive the "Delete Pending (EC)" button's own `[disabled]`/label, which lives inside this panel's own MAKER RESULT block. */
  @Input() actionBusy = false;
  /** Parent-owned (set by `release()`'s success path right after it re-invokes `selectFunction()`, see that method's own doc comment) — read here only to render the brief post-Release confirmation hint at the top of this panel's own template, which lives here because the Maker section markup itself moved here. */
  @Input() releaseSuccessHint: string | null = null;

  /** See `MakerCheckerContext`'s own doc comment. */
  @Output() contextChanged = new EventEmitter<MakerCheckerContext>();
  /** See `MakerSyncRequest`'s own doc comment. */
  @Output() syncRequested = new EventEmitter<MakerSyncRequest>();
  /** MAKER RESULT panel's 3 "Account Entries" buttons — `accountEntryDialogMovement`/`Instrumenttype`/`AccountEntriesDialogComponent` all stay parent-owned. */
  @Output() openAccountEntries = new EventEmitter<{ movement: BalanceMovement; instrumentType: InstrumentType | null }>();
  /** MAKER RESULT panel's "Delete Pending (EC)" button — `deleteMakerPending()` itself stays parent-owned (same Checker-action-layer boundary as `release()`/`reject()`). */
  @Output() deletePendingRequested = new EventEmitter<void>();

  form = new FormGroup({});
  model: BuilderModel = { currency: 'USD', createdBy: 'maker1', eventSeq: Date.now() };
  fields: FormlyFieldConfig[] = [];
  naturalKey = { lcNumber: '', ibNumber: '', sgNumber: '' };
  searchNaturalKey = { lcNumber: '', ibNumber: '', sgNumber: '' };
  searchError: string | null = null;
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
  /** A3 (Document Arrival (Sight)) only — set by `approveArrival()` (parent, Checker acknowledgment) via `externalCheckerOutcome`'s `documentArrivalAcknowledged` outcome kind. Displayed nowhere in THIS panel's own template — kept here purely because it's part of the same outcome-application state machine as `submitResult`. */
  arrivalApproved = false;

  arrivalSgRedeemMovementId: string | null = null;
  arrivalSgRedeemMovement: BalanceMovement | null = null;
  dueFromIssuingBankMovementId: string | null = null;
  acceptanceReimbReceivableMovementId: string | null = null;
  acceptanceMovementId: string | null = null;
  acceptanceMovement: BalanceMovement | null = null;
  matchedReceivableMovementId: string | null = null;

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

  /**
   * Both `@Input()`s are pure "something happened, react to it" signals — see `CheckerPanelComponent
   .ngOnChanges()`'s own doc comment for why this is the correct (and only) place to convert either into
   * an imperative call, and why it's still fully testable via a direct `new MakerPanelComponent(mockApi)`
   * + `ngOnChanges({...})` call with no `TestBed`/view-init lifecycle needed.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['resetTrigger']) this.resetForFunction();
    if (changes['externalCheckerOutcome'] && this.externalCheckerOutcome) this.applyCheckerOutcome(this.externalCheckerOutcome);
    if (changes['refreshRequested'] && !changes['refreshRequested'].firstChange) {
      this.refreshSelectedContractSnapshot();
      this.emitSync();
    }
  }

  private emitContext(): void {
    this.contextChanged.emit({
      submitResult: this.submitResult,
      selectedPayMovement: this.pickerSelection.selectedPayMovement,
      matchedReceivableMovementId: this.matchedReceivableMovementId,
      dueFromIssuingBankMovementId: this.dueFromIssuingBankMovementId,
      acceptanceMovementId: this.acceptanceMovementId,
      acceptanceReimbReceivableMovementId: this.acceptanceReimbReceivableMovementId,
      arrivalSgRedeemMovementId: this.arrivalSgRedeemMovementId,
      createdBy: this.model.createdBy ?? 'maker1',
    });
  }

  /** Mirrors `TransactionBuilderComponent.syncCheckerToContext()`'s pre-extraction body — see `MakerSyncRequest`'s own doc comment for why `alsoSyncLookup` exists (only `applyMakerSubmitOutcome()`'s own 'submitted' branch used to ALSO call `syncLookupToContext()`, every other call site synced the Checker alone). */
  private emitSync(alsoSyncLookup = false): void {
    const lcNumber = this.contextLcNumber;
    if (!lcNumber) return;
    this.syncRequested.emit({
      lcNumber,
      secondaryRef: this.contextSecondaryRef,
      alsoSyncLookup,
      instrumentType: this.model.instrumentType,
    });
  }

  /*
   * BAL-003 (God Component, 2026-08-17) — one-line delegations to `function-policy.ts`; unchanged from
   * the pre-extraction component, only their owning class moved.
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

  /** `displayStatus()` thin delegation, duplicated on this component the same way `AccountEntriesDialogComponent` already carries its own copy (Emulated view encapsulation / component-local template binding surface — see that component's own doc comment for the identical reasoning). */
  displayStatus(status: string, instrumentType?: InstrumentType | string | null, movementType?: string | null): string {
    return displayStatusShared(status, instrumentType, movementType);
  }

  movementTypeChecksAvailableBalance(movementType?: string | null): boolean {
    return !!movementType && DECREASING_MOVEMENT_TYPES.has(movementType);
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
   * Mirrors `TransactionBuilderComponent.selectFunction()`'s own pre-extraction Maker-state reset block
   * exactly, plus the `afterResolved()` dispatch it used to trigger inline. Reads `this.selectedFunction`
   * (the `@Input()`, already updated to its final value by the time `ngOnChanges()` fires — both
   * `selectedFunction` and `resetTrigger` are set synchronously by the parent's own `selectFunction()` in
   * the same JS tick, so Angular's own change-detection pass always sees both at their final values
   * together, the same timing guarantee `CheckerPanelComponent`'s own `syncFromContext()` already relies
   * on for `selectedFunction`).
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
    this.pickerSelection.sgsForArrival = [];
    this.pickerSelection.arrivalSgPaging.reset();
    this.pickerSelection.selectedArrivalSg = null;
    this.pickerSelection.arrivalSgSnapshot = null;
    this.arrivalSgRedeemMovementId = null;
    this.arrivalSgRedeemMovement = null;
    this.dueFromIssuingBankMovementId = null;
    this.acceptanceReimbReceivableMovementId = null;
    this.acceptanceMovementId = null;
    this.acceptanceMovement = null;
    this.matchedReceivableMovementId = null;

    if (fn?.movementType) {
      this.model.instrumentType = fn.instrumentType;
      this.model.movementType = fn.movementType;
      this.afterResolved();
    }
    this.emitContext();
  }

  onSubChoice(): void {
    if (!this.selectedFunction || !this.subChoiceValue) return;
    const fn = this.selectedFunction;
    this.model.instrumentType = fn.instrumentType;
    this.model.movementType = this.subChoiceValue;
    this.afterResolved();
  }

  private afterResolved(): void {
    if (this.model.movementType === 'FULL_SETTLE' && this.selectedContractSnapshot) {
      this.model.amount = this.selectedContractSnapshot.availableBalance;
    } else if (this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'REDEEM' && this.selectedContractSnapshot) {
      this.model.amount = this.selectedContractSnapshot.availableBalance;
    } else if (
      this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'SETTLE' &&
      this.model.instrumentType === 'EPLC_ACCEPTANCE' &&
      this.selectedContractSnapshot
    ) {
      this.model.amount = this.selectedContractSnapshot.availableBalance;
    }
    this.rebuildFields();
    if (!this.isCreatingMovement && !this.usesTwoFieldSearch) this.reloadCatalog();
    if (this.parentInstrumentType) this.onParentInstrumentTypeChange();
  }

  reloadCatalog(): void {
    this.catalogPicker.load({
      guardFails: !this.model.instrumentType || this.isCreatingMovement,
      instrumentType: this.model.instrumentType!,
      tenorFamily: this.selectedFunction?.catalogTenorFilter,
      qualifies: () => this.filteredCatalogContracts.length,
      onLoaded: (items) => {
        if (this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace) {
          this.documentArrivalHints.loadCatalogHints(items, () => {
            this.catalogPicker.total = this.filteredCatalogContracts.length;
          });
        }
        if (this.selectedFunction?.payableMovementInstrumentType) {
          this.documentArrivalHints.loadChildHints(
            items,
            this.selectedFunction.payableMovementInstrumentType,
            this.selectedFunction.payableMovementType ?? 'UTILIZE',
            () => {
              this.catalogPicker.total = this.filteredCatalogContracts.length;
            },
          );
        }
        if (this.selectedFunctionStrategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg')) {
          this.documentArrivalHints.loadCatalogSgEligibility(items, () => {
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
    this.reloadCatalog();
  }

  get flattenedPayableRows(): { contract: BalanceContract; movement: any }[] {
    const rows: { contract: BalanceContract; movement: any }[] = [];
    for (const c of this.pagedFilteredCatalogContracts) {
      const movements = this.documentArrivalHints.catalogPayableMovements.get(c.balanceContractId) ?? [];
      for (const m of movements) rows.push({ contract: c, movement: m });
    }
    rows.sort((a, b) => {
      const lc = a.contract.naturalKey.lcNumber.localeCompare(b.contract.naturalKey.lcNumber);
      return lc !== 0 ? lc : (a.movement.sourceTransactionRef ?? '').localeCompare(b.movement.sourceTransactionRef ?? '');
    });
    return rows;
  }

  onSelectFlattenedPayable(contractId: string, movementId: string): void {
    this.selectedContract = this.catalogPicker.contracts.find((c) => c.balanceContractId === contractId) ?? null;
    this.refreshSelectedContractSnapshot();
    this.pickerSelection.payableMovements = this.documentArrivalHints.catalogPayableMovements.get(contractId) ?? [];
    this.pickerSelection.payableMovementsLoading = false;
    this.pickerSelection.payableMovementsPaging.total = this.pickerSelection.payableMovements.length;
    this.pickerSelection.payableMovementsPaging.page = 1;
    this.onSelectPayMovement(movementId);
    this.emitSync();
  }

  catalogIbHint(c: BalanceContract): string {
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

  get filteredCatalogContracts(): BalanceContract[] {
    let list = this.catalogPicker.contracts;
    const tenorFilter = this.selectedFunction?.catalogTenorFilter;
    if (tenorFilter) {
      list = list.filter((c) => !c.tenorType || (tenorFilter === 'SIGHT' ? c.tenorType === 'SIGHT' : c.tenorType !== 'SIGHT'));
    }
    if (this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace) {
      return list.filter((c) => this.documentArrivalHints.catalogPayableIbs.has(c.balanceContractId));
    }
    if (this.selectedFunction?.payableMovementInstrumentType) {
      return list.filter((c) => this.documentArrivalHints.catalogChildPayableIbs.has(c.balanceContractId));
    }
    if (this.selectedFunctionStrategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg')) {
      return list.filter((c) => this.documentArrivalHints.catalogSgEligible.has(c.balanceContractId));
    }
    if (!this.model.movementType || !DECREASING_MOVEMENT_TYPES.has(this.model.movementType)) return list;
    return list.filter((c) => {
      const snap = this.catalogPicker.snapshots.get(c.balanceContractId);
      return !snap || snap.availableBalance !== '0';
    });
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
        if (this.requiresEligibleParentDocumentArrival) {
          this.documentArrivalHints.loadParentHints(items, () => {
            this.parentPicker.total = this.filteredParentCatalog.length;
          });
        }
        if (this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'REDEEM') {
          this.documentArrivalHints.loadParentSgEligibility(items, () => {
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

  get filteredParentCatalog(): BalanceContract[] {
    let list = this.parentPicker.contracts;
    if (this.selectedFunction?.tenorTypeOptions?.length) {
      list = list.filter((c) => c.tenorType && c.tenorType !== 'SIGHT' && (!this.model.tenorType || c.tenorType === this.model.tenorType));
    } else if (this.selectedFunction?.catalogTenorFilter === 'USANCE') {
      list = list.filter((c) => !c.tenorType || c.tenorType !== 'SIGHT');
    }
    if (this.requiresEligibleParentDocumentArrival) {
      return list.filter((c) => this.documentArrivalHints.parentPayableIbs.has(c.balanceContractId));
    }
    if (this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'REDEEM') {
      return list.filter((c) => this.documentArrivalHints.parentSgEligible.has(c.balanceContractId));
    }
    if (
      this.selectedFunctionStrategy?.checkerRelease.settlesDocumentArrival ||
      this.selectedFunction?.catalogTenorFilter === 'USANCE' ||
      this.selectedFunctionStrategy?.selectionFlow.usesSettleableBalanceIndex
    )
      return list;
    return list.filter((c) => {
      const snap = this.parentPicker.snapshots.get(c.balanceContractId);
      return !snap || snap.availableBalance !== '0';
    });
  }

  get pagedFilteredParentCatalog(): BalanceContract[] {
    const start = (this.parentPicker.page - 1) * this.parentPicker.pageSize;
    return this.filteredParentCatalog.slice(start, start + this.parentPicker.pageSize);
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
    return ` — ${label}: ${this.formatAmount(snap.pendingEarmarkTotal.replace('-', ''))}`;
  }

  onSelectContract(contractId: string): void {
    this.selectedContract = this.catalogPicker.contracts.find((c) => c.balanceContractId === contractId) ?? null;
    if (this.selectedFunctionStrategy?.movementDerivation.derivesMovementTypeFromTenor && this.selectedContract) {
      this.model.movementType = this.selectedContract.tenorType === 'SIGHT' ? 'HONOUR' : 'ACCEPT';
    }
    if (this.carriedCurrency) {
      this.model.currency = this.carriedCurrency;
      this.rebuildFields();
    }
    this.refreshSelectedContractSnapshot();
    if (this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace || this.selectedFunctionStrategy?.checkerRelease.settlesDocumentArrival) {
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
    this.emitSync();
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

  /** A4's own real Maker Submit — see `TransactionBuilderComponent.submitA4()`'s pre-extraction doc comment for the full "no movement of its own to create" reasoning. */
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
        this.emitSync();
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
        if (this.model.movementType === 'FULL_SETTLE') {
          this.model.amount = snap.availableBalance;
          this.rebuildFields();
        } else if (
          this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'SETTLE' &&
          this.model.instrumentType === 'EPLC_ACCEPTANCE'
        ) {
          this.model.amount = snap.availableBalance;
          this.rebuildFields();
        } else if (this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'REDEEM') {
          this.model.amount = snap.availableBalance;
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
              if (this.carriedCurrency) {
                this.model.currency = this.carriedCurrency;
                this.rebuildFields();
              }
              this.refreshSelectedContractSnapshot();
              this.emitSync();
            });
            return;
          }
          this.selectedContract = contract;
          if (this.carriedCurrency) {
            this.model.currency = this.carriedCurrency;
            this.rebuildFields();
          }
          this.refreshSelectedContractSnapshot();
          this.emitSync();
        },
        error: (err) => {
          this.selectedContract = null;
          this.selectedContractSnapshot = null;
          this.searchError = this.describeApiError(err);
        },
      });
  }

  onSelectParent(contractId: string): void {
    this.selectedParent = this.parentPicker.contracts.find((c) => c.balanceContractId === contractId) ?? null;
    if (this.carriedCurrency) {
      this.model.currency = this.carriedCurrency;
      this.rebuildFields();
    }
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
    if (this.selectedFunctionStrategy?.checkerRelease.settlesDocumentArrival && this.selectedParent) {
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
    if (this.selectedFunction?.tenorTypeOptions?.length && this.isCreatingMovement && this.hasParent && this.selectedParent) {
      this.model.tenorType = this.selectedParent.tenorType ?? undefined;
      this.model.tenorDays = this.selectedParent.tenorDays ?? undefined;
      this.rebuildFields();
    }
  }

  private loadIbIndex(): void {
    this.ibIndexPicker.load({
      guardFails: !this.model.instrumentType || !this.searchNaturalKey.lcNumber,
      instrumentType: this.model.instrumentType!,
      lcNumber: this.searchNaturalKey.lcNumber,
      qualifies: () => this.filteredIbIndexCatalog.length,
    });
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
    if (this.carriedCurrency) {
      this.model.currency = this.carriedCurrency;
      this.rebuildFields();
    }
    this.searchNaturalKey.ibNumber = outcome.ibNumber;
    this.refreshSelectedContractSnapshot();
    this.emitSync();
  }

  get filteredIbIndexCatalog(): BalanceContract[] {
    if (!this.model.movementType || !DECREASING_MOVEMENT_TYPES.has(this.model.movementType)) return this.ibIndexPicker.contracts;
    return this.ibIndexPicker.contracts.filter((c) => {
      const snap = this.ibIndexPicker.snapshots.get(c.balanceContractId);
      return !snap || snap.availableBalance !== '0';
    });
  }

  get pagedFilteredIbIndexCatalog(): BalanceContract[] {
    const start = (this.ibIndexPicker.page - 1) * this.ibIndexPicker.pageSize;
    return this.filteredIbIndexCatalog.slice(start, start + this.ibIndexPicker.pageSize);
  }

  onSelectIbIndex(contractId: string): void {
    this.selectedContract = this.ibIndexPicker.contracts.find((c) => c.balanceContractId === contractId) ?? null;
    this.searchError = null;
    if (this.selectedContract) {
      this.searchNaturalKey.ibNumber = this.selectedContract.naturalKey.ibNumber ?? '';
      this.searchNaturalKey.sgNumber = this.selectedContract.naturalKey.sgNumber ?? '';
    }
    if (this.carriedCurrency) {
      this.model.currency = this.carriedCurrency;
      this.rebuildFields();
    }
    this.refreshSelectedContractSnapshot();
    this.emitSync();
  }

  private rebuildFields(): void {
    this.fields = buildFields({
      model: this.model,
      selectedFunction: this.selectedFunction,
      selectedPayMovement: this.pickerSelection.selectedPayMovement,
      selectedContract: this.selectedContract,
      selectedContractSnapshot: this.selectedContractSnapshot,
      selectedParent: this.selectedParent,
      dynamicSecondaryRefLabel: this.dynamicSecondaryRefLabel,
    });
  }

  get formLocked(): boolean {
    return !!this.submitResult;
  }

  get requiresEligibleTarget(): boolean {
    return !!this.selectedFunction && !(policy.isCreatingMovement(this.model) && !policy.hasParent(this.model));
  }

  get hasEligibleTargetSelected(): boolean {
    return hasEligibleTargetSelectedRule(this.submitRulesContext);
  }

  get eligibleCandidateCount(): number {
    return policy.hasParent(this.model) ? this.parentPicker.total : this.catalogPicker.total;
  }

  get noEligibleRecordsMessage(): string | null {
    if (!this.requiresEligibleTarget || this.hasEligibleTargetSelected) return null;
    return this.eligibleCandidateCount === 0
      ? 'No eligible records available for this transaction.'
      : 'Pick an eligible record from the list below to continue.';
  }

  get fieldsLocked(): boolean {
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
    this.submitting = false;
    if (outcome.secondary.arrivalSgRedeemMovementId !== undefined) this.arrivalSgRedeemMovementId = outcome.secondary.arrivalSgRedeemMovementId;
    if (outcome.secondary.arrivalSgRedeemMovement !== undefined) this.arrivalSgRedeemMovement = outcome.secondary.arrivalSgRedeemMovement;
    if (outcome.secondary.dueFromIssuingBankMovementId !== undefined) this.dueFromIssuingBankMovementId = outcome.secondary.dueFromIssuingBankMovementId;
    if (outcome.secondary.acceptanceMovementId !== undefined) this.acceptanceMovementId = outcome.secondary.acceptanceMovementId;
    if (outcome.secondary.acceptanceMovement !== undefined) this.acceptanceMovement = outcome.secondary.acceptanceMovement;
    if (outcome.secondary.acceptanceReimbReceivableMovementId !== undefined)
      this.acceptanceReimbReceivableMovementId = outcome.secondary.acceptanceReimbReceivableMovementId;
    if (outcome.secondary.matchedReceivableMovementId !== undefined) this.matchedReceivableMovementId = outcome.secondary.matchedReceivableMovementId;

    if (outcome.kind === 'submitted') {
      this.submitResult = outcome.result;
      this.emitContext();
      this.emitSync(true);
      return;
    }
    this.submitError = outcome.message;
    if ('result' in outcome && outcome.result !== undefined) this.submitResult = outcome.result;
    this.emitContext();
  }

  submit(): void {
    if (!this.validateSubmit()) return;
    const req = this.buildSubmitRequest();
    if (!req) return;

    this.submitting = true;
    this.submitResult = null;
    this.submitError = null;
    this.arrivalApproved = false;
    this.arrivalSgRedeemMovementId = null;
    this.arrivalSgRedeemMovement = null;
    this.acceptanceMovement = null;

    this.makerSubmit.submit(req, this.buildMakerSubmitContext()).subscribe((outcome) => this.applyMakerSubmitOutcome(outcome));
  }

  /**
   * Applies a Checker-initiated outcome (Release/Reject/Delete-Pending — all still parent-owned) into
   * this panel's own state. Mirrors `TransactionBuilderComponent.applyCheckerActionOutcome()`/
   * `finishCheckerAction()`/`failCheckerAction()` exactly, minus `actionBusy` (stays parent-owned — the
   * parent's own subscribe callback resets it directly, unconditionally, for every outcome kind, matching
   * the fact that every branch of the original did the same).
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
      this.emitSync();
      this.pickerSelection.loadSgsForArrival(this.selectedContract?.naturalKey.lcNumber, () => this.rebuildFields());
      this.emitContext();
      return;
    }
    this.submitResult = outcome.result;
    this.refreshSelectedContractSnapshot();
    this.emitSync(!!outcome.syncLookup);
    this.emitContext();
  }
}
