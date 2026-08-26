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
 * `submit()` (Maker) and the Checker's own `release()`/`reject()`/`deleteMakerPending()` (still
 * parent-owned) both write into `submitResult`/`arrivalApproved`/the compound-leg fields — a real
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
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FormlyModule, IndexPickerComponent, TbIconComponent],
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
  /** A3 only — set by `approveArrival()` via `externalCheckerOutcome`'s `documentArrivalAcknowledged` kind. Not displayed here — kept because it's part of the same outcome-application state machine as `submitResult`. */
  arrivalApproved = false;

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

  /** `displayStatus()` thin delegation — duplicated on this component the same way `AccountEntriesDialogComponent` carries its own copy, since Emulated view encapsulation scopes a template's binding surface to its own component. */
  displayStatus(status: string, instrumentType?: InstrumentType | string | null, movementType?: string | null, acknowledgedAt?: string | null): string {
    return displayStatusShared(status, instrumentType, movementType, undefined, acknowledgedAt);
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
    this.compoundLegs = { ...EMPTY_COMPOUND_LEGS };

    if (fn?.movementType) {
      this.model.instrumentType = fn.instrumentType;
      this.model.movementType = fn.movementType;
      this.afterResolved();
    }
    this.emitContext();
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
    if (this.parentInstrumentType) this.onParentInstrumentTypeChange();
  }

  reloadCatalog(): void {
    this.catalogPicker.load({
      guardFails: !this.model.instrumentType || this.isCreatingMovement,
      instrumentType: this.model.instrumentType!,
      tenorFamily: this.selectedFunction?.catalogTenorFilter,
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
            this.catalogPicker.total = this.filteredCatalogContracts.length;
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
    this.emitCheckerAndLookupSync();
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
              this.emitCheckerAndLookupSync();
            });
            return;
          }
          this.selectedContract = contract;
          if (this.carriedCurrency) {
            this.model.currency = this.carriedCurrency;
            this.rebuildFields();
          }
          this.refreshSelectedContractSnapshot();
          this.emitCheckerAndLookupSync();
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
    this.emitCheckerAndLookupSync();
  }

  /** No special-case rule exists for the IB Index picker; always resolves to `genericFallback`. Kept as
   * its own resolver for symmetry with the other two, in case a future function needs one. */
  private resolveIbIndexEligibilityRule(): EligibilityRule {
    return { kind: 'genericFallback', gatedByMovementType: true };
  }

  get filteredIbIndexCatalog(): BalanceContract[] {
    return applyEligibilityRule(this.ibIndexPicker.contracts, this.resolveIbIndexEligibilityRule(), this.model.movementType, this.ibIndexPicker.snapshots);
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
    this.emitCheckerAndLookupSync();
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
    // Safe as a plain merge-spread, not 7 `!== undefined` guards: every `secondary:` object
    // maker-submit.service.ts constructs includes only keys it has a value for, never `key: undefined`.
    this.compoundLegs = { ...this.compoundLegs, ...outcome.secondary };

    if (outcome.kind === 'submitted') {
      this.submitResult = outcome.result;
      this.emitContext();
      this.emitCheckerAndLookupSync();
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
    // Deliberately a PARTIAL reset — only these 3 of the 7 compoundLegs fields; the other 4 are cleared
    // only by resetForFunction().
    this.compoundLegs = { ...this.compoundLegs, arrivalSgRedeemMovementId: null, arrivalSgRedeemMovement: null, acceptanceMovement: null };

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
    this.refreshSelectedContractSnapshot();
    this.emitCheckerAndLookupSync();
    this.emitContext();
  }
}
