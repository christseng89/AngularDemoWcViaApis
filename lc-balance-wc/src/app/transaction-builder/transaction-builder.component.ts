import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot, CreateMovementRequest } from './balance-component-api.service';
import { IndexPickerComponent } from './index-picker.component';
import { CheckerActionContext, CheckerActionOutcome, CheckerActionsService } from './checker-actions.service';
import { MakerSubmitContext, MakerSubmitOutcome, MakerSubmitService } from './maker-submit.service';
import { LookUpPanelService } from './look-up-panel.service';
import { CatalogPickerService } from './catalog-picker.service';
import { InquireEventsService } from './inquire-events.service';
import { describeApiError as describeApiErrorShared } from './api-error';
import {
  BALANCE_SNAPSHOT_LABEL,
  DECREASING_MOVEMENT_TYPES,
  EXPORT_FUNCTIONS,
  IMPORT_FUNCTIONS,
  InstrumentType,
  TransactionFunction,
  amountExceedsCurrencyDecimals,
  decimalPlacesForCurrency,
} from './balance-component.model';
import { buildFields } from './builder-fields';
import { SubmitRulesContext, buildSubmitRequest as buildSubmitRequestRules, validateSubmit as validateSubmitRules } from './submit-rules';
import * as policy from './function-policy';
import { BuilderModel } from './function-policy';

/**
 * Transaction Builder — organized as named Import (A-series) / Export
 * (B-series) business functions (business instruction 2026-08-14, "similar
 * as Payment Component A1-A4, B1-B5"), not a raw instrumentType/
 * movementType picker. Selecting a function pins the instrumentType (and,
 * for functions with only one legal movementType, the movementType too) so
 * the remaining form only ever asks for what that specific function
 * actually needs — see balance-component.model.ts's IMPORT_FUNCTIONS/
 * EXPORT_FUNCTIONS for the full mapping back to Design doc §5 movementTypes.
 */
@Component({
  selector: 'app-transaction-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FormlyModule, IndexPickerComponent],
  templateUrl: './transaction-builder.component.html',
  styleUrl: './transaction-builder.component.scss',
})
export class TransactionBuilderComponent {
  readonly importFunctions = IMPORT_FUNCTIONS;
  readonly exportFunctions = EXPORT_FUNCTIONS;
  /** Inquire Events (2026-08-17) — the template's own binding surface for the "Balance Impact" box's label; reuses the same map InquireEventsService's own balance-row grouping filters against. */
  readonly balanceSnapshotLabel = BALANCE_SNAPSHOT_LABEL;

  /**
   * Business instruction 2026-08-15 ("A1-A9 B1-B5 should be horizental
   * instead of vertical, otherwise it took too much spaces, the function
   * input should be more important than the menu... Tab Import => A1...A9
   * horizontal, Tab Export B1...B5 horizontal") — Import/Export are now a
   * tab switch (one function row visible at a time, horizontally laid out
   * as compact chips) instead of two always-visible vertical lists, so the
   * picked function's own Maker/Checker panels get the vertical space.
   */
  activeFunctionSide: 'IMPORT' | 'EXPORT' = 'IMPORT';

  /**
   * Inquire Events (2026-08-17, user-requested, "使用OOD Design Patterns 新增 Inquire Events 功能") — a
   * second top-level mode, sibling to the existing function-picker/Maker/Checker/Look-Up workspace
   * (activeMode === 'PROCESSING', unchanged), reachable without first picking a business function
   * (unlike the existing "Look Up Current Balance" panel, which only renders once selectedFunction is
   * set — deliberately not changed here, out of scope for this feature).
   */
  activeMode: 'PROCESSING' | 'INQUIRE' = 'PROCESSING';

  selectedFunction: TransactionFunction | null = null;
  /** Value of the function's subChoice (e.g. 'AMEND_INCREASE', or 'CONFIRMED' for B1/B2). */
  subChoiceValue = '';
  /**
   * Business instruction 2026-08-14: usually just selectedFunction's own
   * static secondaryRefLabel, but B1 is special — Advise (Unconfirmed) is a
   * starting transaction like A1/LC Issue (no secondary ref needed), while
   * Confirm (Confirmed) references back to that prior Advise transaction
   * ("advise number is mandatory... when confirming LC"), so B1's label
   * depends on which subChoice value was picked, not just which function.
   */
  dynamicSecondaryRefLabel: string | null = null;

  form = new FormGroup({});
  model: BuilderModel = { currency: 'USD', createdBy: 'maker1', eventSeq: Date.now() };
  fields: FormlyFieldConfig[] = [];

  naturalKey = { lcNumber: '', ibNumber: '', sgNumber: '' };
  readonly catalogPageSize = 10;
  /** Business instruction 2026-08-14 "Page by Page設計". BAL-003 (OOD/SOLID, 8th pass): contracts/search/snapshots/page/total/totalPages now owned by `CatalogPickerService` — see catalogPicker below. */
  readonly catalogPicker: CatalogPickerService;
  /** A4 (Sight Settlement) only — business instruction 2026-08-14: LC Index shows the pending IB Number(s) inline (e.g. "810 — IB00001 — ACTIVE — Pending: 25,000") so the user can identify which Document Arrival is being settled without opening Step 2 first. */
  catalogPayableIbs = new Map<string, string[]>();
  /** Full movement objects backing catalogPayableIbs, keyed the same way — business-reported gap "select S001 IB03 or S001 IB04 separately". */
  catalogPayableMovements = new Map<string, BalanceMovement[]>();
  selectedContract: BalanceContract | null = null;
  /**
   * Business instruction 2026-08-14: for instrumentTypes whose natural key
   * has a second component (IPLC_ACCEPTANCE/EPLC_ACCEPTANCE -> IB Number,
   * SHGT -> SG Number), an existing contract must be found by searching
   * LC Number + that second field together — never by browsing a flat
   * Catalog list, which is fine only for IPLC_LC/EPLC_LC/EPLC_CONFIRMATION
   * (natural key = lcNumber alone).
   */
  searchNaturalKey = { lcNumber: '', ibNumber: '', sgNumber: '' };
  searchError: string | null = null;
  /**
   * "IB Index" — business instruction 2026-08-14 "search LC Index, then the
   * IB Index (page by page for both) to pick up the LC Number and IB
   * Number". Step 2 of the cascading picker for A7/B5 (Acceptance
   * Settlement) and A9 Redeem (SHGT): once an LC is picked from the
   * existing Parent LC picker (Step 1 — "LC Index"), this lists every
   * IPLC_ACCEPTANCE/EPLC_ACCEPTANCE/SHGT contract under EXACTLY that LC
   * (via the catalog's exact lcNumber filter, not the substring `q`), so
   * the user picks the IB/SG Number instead of typing it.
   */
  readonly ibIndexPageSize = 10;
  /** BAL-003 (OOD/SOLID, 8th pass): contracts/snapshots/page/total/totalPages now owned by `CatalogPickerService` — see ibIndexPicker below. */
  readonly ibIndexPicker: CatalogPickerService;

  /**
   * Business instruction 2026-08-16 ("B6 要有類似B5[B4]的LC Index — Existing Contract & EB Index —
   * Existing Contract (from B3) 選擇 those EB records with Acceptance Balance") — B5's own "EB Index"
   * Step 2, once its Parent LC (Step 1) is picked. Unlike ibIndexPicker.contracts above (single instrumentType,
   * model.instrumentType's own catalog), this is populated from selectedFunction.instrumentType
   * (EPLC_ACCEPTANCE, B5's own fixed type) under the same picked Confirmation. Each entry carries its
   * own real balanceContractId/instrumentType/availableBalance so onSelectSettleableBalance() can route
   * correctly.
   */
  settleableBalances: Array<{
    balanceContractId: string;
    instrumentType: InstrumentType;
    ibNumber: string | null;
    availableBalance: string;
    currency: string;
  }> = [];
  settleableBalancesLoading = false;

  /**
   * Business instruction 2026-08-14 ("pickup LC then pickup IB Number...
   * Amount will be captured... without further input") — A4 (Sight
   * Settlement) only: still-PENDING UTILIZE movements under the picked LC,
   * one per prior A3 (Document Arrival (Sight)) awaiting payment. No
   * createMovement request is ever built for this function — Pay releases
   * the picked movement directly (the Checker half of the Maker(A3)/
   * Checker(A4) split — "All those functions will be processed via Maker,
   * Checker").
   */
  payableMovements: BalanceMovement[] = [];
  payableMovementsLoading = false;
  selectedPayMovement: BalanceMovement | null = null;
  /**
   * Business instruction 2026-08-15 ("Index Search") — the 2ndary Index (A4/A6's still-PENDING
   * Document Arrival picker, B4's still-PENDING Present Docs picker) can have several entries under
   * one LC once a bank has multiple presentations against it, so it needed the same search box every
   * other picker on this screen already has. payableMovements is a fully-loaded, unpaginated array
   * (one listMovements() call per contract, not server-paginated), so this filters client-side via
   * filteredPayableMovements below rather than round-tripping to the server.
   */
  payableMovementSearch = '';
  /**
   * Live Confirmed/Available Balance for selectedContract — fetched the
   * instant a contract is picked (and refreshed after every submit) so the
   * Amount field is never filled in blind. Reviewer-reported gap
   * (2026-08-14): without this, a user has no way to see how much
   * headroom actually remains before typing an amount, and can
   * accidentally submit the ENTIRE Available Balance thinking it's a
   * partial draw (natural key "001": Confirmed 111,100 -> a single
   * UTILIZE of 111,100 legitimately drained it to 0 — the 409 on the next
   * call was correct, the missing balance visibility was the real bug).
   */
  selectedContractSnapshot: BalanceSnapshot | null = null;
  snapshotLoading = false;

  /**
   * A3S (Document Arrival w/ Shipping Gtee) only — Step 2 under the picked
   * LC (onSelectContract() below), listing that LC's own outstanding SHGT
   * records. See documentArrivalWithSg's doc comment in
   * balance-component.model.ts for the full two-movement, redeem-then-
   * arrive mechanism this drives.
   */
  sgsForArrival: BalanceContract[] = [];
  sgsForArrivalLoading = false;
  selectedArrivalSg: BalanceContract | null = null;
  arrivalSgSnapshot: BalanceSnapshot | null = null;
  /** Set once Submit's first call (the SG's own FULL_REDEEM) succeeds — Release then needs it for the compound Checker action. */
  arrivalSgRedeemMovementId: string | null = null;
  /**
   * Bug fixed 2026-08-16, reviewer-reported ("A3S does not generate the related SG redemption entries
   * in Pending"): the SG's own FULL_REDEEM/PARTIAL_REDEEM movement DOES get a real, in-scope
   * contingentAccountEntry from the server (SHGT is a real account family — see
   * analysis/contingent-liability-ledger.html Folio 2) — it was just never surfaced anywhere in the
   * UI, since submitResult only ever holds Submit's SECOND call (the LC's own UTILIZE, req) for A3S.
   * Holds the full first-leg response (not just its movementId, unlike arrivalSgRedeemMovementId above)
   * specifically so the Maker Result panel can offer its own Account Entries button for this leg too.
   */
  arrivalSgRedeemMovement: BalanceMovement | null = null;
  /**
   * B3 (createsIssuingBankReceivableOnHonour) only — set once Submit's second call (the new
   * EPLC_DUE_FROM_ISSUING_BANK CREATE) succeeds. Same role as arrivalSgRedeemMovementId above: Release
   * and Delete Pending (EC) both need it for their own compound actions.
   */
  dueFromIssuingBankMovementId: string | null = null;
  /**
   * B4 (createsAcceptanceReimbReceivableOnCreate) only — set once Submit's second call (the new
   * EPLC_ACCEPTANCE_REIMB_RECEIVABLE CREATE, Gap Analysis Row 6's asset half) succeeds. Same role as
   * dueFromIssuingBankMovementId above: Release and Delete Pending (EC) both need it for their own
   * compound actions.
   */
  acceptanceReimbReceivableMovementId: string | null = null;
  /**
   * B4 (createsAcceptanceReimbReceivableOnCreate, Usance branch) only — set once Submit's SECOND call
   * (the new EPLC_ACCEPTANCE CREATE, the liability leg) succeeds. B4's own submitResult tracks the
   * FIRST call (the Confirmation's own ACCEPT) instead, unlike A6/old-B4 where submitResult WAS the
   * Acceptance directly — see the module note on createsAcceptanceReimbReceivableOnCreate for why B4
   * now has three linked legs instead of two.
   */
  acceptanceMovementId: string | null = null;
  /**
   * Same fix and reasoning as arrivalSgRedeemMovement above, applied to B4 Usance's own second leg
   * (the new EPLC_ACCEPTANCE CREATE) — IPLC_ACCEPTANCE/EPLC_ACCEPTANCE is a real, in-scope account
   * family (analysis/contingent-liability-ledger.html Folio 5), so this leg's own contingentAccountEntry
   * was also being silently dropped, same root cause as the A3S bug, just not yet reviewer-reported.
   */
  acceptanceMovement: BalanceMovement | null = null;
  /**
   * B5 (settlesAcceptanceOnMature, Usance/CNF_MATURE branch) only — set once Submit's second call (the
   * matching EPLC_ACCEPTANCE_REIMB_RECEIVABLE's REIMBURSE, found via the same LC+EB natural key as the
   * Acceptance being settled) succeeds. B5's own submitResult tracks the FIRST call (the Acceptance's
   * own FULL_SETTLE/PARTIAL_SETTLE) instead — same "primary in submitResult, secondary in its own
   * field" shape as acceptanceMovementId/acceptanceReimbReceivableMovementId above.
   */
  matchedReceivableMovementId: string | null = null;

  /**
   * Business instruction 2026-08-15 ("Seperate Maker and Checker for each
   * functions. Which allow Check to release unrelease Pending events." —
   * refined same day: "there is no way to Approve pending. Would it be
   * possible to have separate option in Amendment function to release
   * those pending events? Same requirement for all other functions.") —
   * a Checker queue with its OWN independent LC search (checkerLcNumber/
   * searchCheckerLc() below), reachable without going through the Maker's
   * own subChoice/natural-key flow at all (A2's "Direction" pick, A6/A8's
   * Parent picker, etc.) — genuinely separate, not just "whatever the
   * Maker happens to have selected". Still auto-fills/auto-searches from
   * whatever the Maker DOES pick or submit (syncCheckerToContext(), called
   * alongside syncLookupToContext()) purely as a convenience default; the
   * field stays freely editable/searchable on its own regardless. Uses the
   * exact same api.release()/api.reject() calls as everywhere else — a new
   * UI surface onto existing capability, no new business rule.
   */
  checkerLcNumber = '';
  // Business-reported gap 2026-08-15 ("Check[er] function is not working for Shipping Gtee (Issue)",
  // repro'd with LC S001 / SG G01): SHGT/Acceptance contracts are keyed by LC Number + SG/IB Number
  // (one LC can have multiple SG/IB records — schema.ts's unique index is on all three), but
  // searchCheckerLc() only ever sent lcNumber, so it 404'd on every SHGT/Acceptance lookup
  // regardless of which SG/IB Number was intended. Mirrors searchNaturalKey's ibNumber/sgNumber,
  // which searchExistingContract() above already got right.
  checkerSecondaryRef = '';
  checkerContract: BalanceContract | null = null;
  checkerSearching = false;
  checkerSearchError: string | null = null;
  checkerItems: BalanceMovement[] = [];
  checkerLoading = false;
  selectedCheckerMovement: BalanceMovement | null = null;
  checkerBusy = false;
  checkerError: string | null = null;
  checkerId = 'checker1';

  parentInstrumentType: InstrumentType | '' = '';
  readonly parentPageSize = 10;
  /** Business instruction 2026-08-14 "Page by Page設計". BAL-003 (OOD/SOLID, 8th pass): contracts/search/snapshots/page/total/totalPages now owned by `CatalogPickerService` — see parentPicker below. */
  readonly parentPicker: CatalogPickerService;
  selectedParent: BalanceContract | null = null;
  exposureNature: 'ACTUAL' | 'MEMO' = 'ACTUAL';

  submitting = false;
  submitResult: any = null;
  submitError: string | null = null;
  actionBusy = false;
  /**
   * analysis/contingent-liability-ledger.html (business-requested 2026-08-16, "Account Entries button +
   * pop-up dialog") — whichever movement's own contingentAccountEntry is currently shown in the dialog,
   * or null when the dialog is closed. Set by an explicit "Account Entries" button click, from either
   * the Maker Result panel (submitResult) or an Event Timeline row — deliberately NOT a fetch: the
   * movement object already carries its own server-derived, immutable entry (Design doc "Event-Level
   * Relationship" requirement — never recalculated from the current balance at inquiry time).
   */
  accountEntryDialogMovement: BalanceMovement | null = null;
  /** A3 (Document Arrival (Sight)) only — set by approveArrival(), a Checker acknowledgment that does NOT call the backend release API. */
  arrivalApproved = false;

  /**
   * BAL-003 (Checker Actions extraction): `checkerActions` defaults to a fresh
   * `CheckerActionsService` bound to the same `api` — preserves every existing `new
   * TransactionBuilderComponent(mockApi)` test call site (70+ across 4 spec files) unmodified. Angular's
   * own DI container always resolves BOTH constructor parameters when it constructs this component for
   * real (default parameter values are never consulted by Angular's DI), so production wiring gets the
   * real injected singleton exactly as if this were a normal required dependency.
   */
  /**
   * BAL-003 (7th same-day OOD/SOLID pass, "Look Up panel"): `lookUp` is a plain field initialized in
   * the constructor BODY (not a parameter-property default like `checkerActions`/`makerSubmit` above),
   * specifically so its `onBeforeLookup` callback can close over `this` unambiguously — see
   * `look-up-panel.service.ts`'s own doc comment for why this is a plain class, not an `@Component`.
   */
  readonly lookUp: LookUpPanelService;
  /** Inquire Events (2026-08-17) — same "plain class, constructed in the body" convention as `lookUp` above, for the same reason (see look-up-panel.service.ts's own doc comment). */
  readonly inquireEvents: InquireEventsService;
  /**
   * BAL-003 (8th same-day OOD/SOLID pass, "paginated pickers" — narrowed scope, see
   * `catalog-picker.service.ts`'s own module note): `catalogPicker`/`parentPicker`/`ibIndexPicker`
   * (declared next to their picker's other fields above) are all initialized here in the constructor
   * body alongside `lookUp` — `this.catalogPageSize` etc. are only guaranteed assigned once field
   * initializers have run, so this stays out of a field initializer.
   */
  constructor(
    private readonly api: BalanceComponentApiService,
    private readonly checkerActions: CheckerActionsService = new CheckerActionsService(api),
    private readonly makerSubmit: MakerSubmitService = new MakerSubmitService(api),
  ) {
    this.lookUp = new LookUpPanelService(api, () => (this.accountEntryDialogMovement = null));
    this.inquireEvents = new InquireEventsService(api);
    this.catalogPicker = new CatalogPickerService(this.catalogPageSize, api);
    this.parentPicker = new CatalogPickerService(this.parentPageSize, api);
    this.ibIndexPicker = new CatalogPickerService(this.ibIndexPageSize, api);
  }

  /** Inquire Events (2026-08-17) — top-level mode toggle, sibling to selectFunctionSide()'s own Import/Export toggle. Closes any open Account Entries dialog when leaving Inquire mode, same "close before the underlying data changes" convention lookUp.runLookup()'s own onBeforeLookup callback already follows. */
  selectMode(mode: 'PROCESSING' | 'INQUIRE'): void {
    this.activeMode = mode;
    this.accountEntryDialogMovement = null;
  }

  /*
   * BAL-003 (God Component, 2026-08-17) — the getters below are one-line delegations to
   * `function-policy.ts`, where each rule now lives as a pure function alongside the business
   * instruction that motivated it. They stay on the class purely as the template's own binding
   * surface (and as the ~90 existing spec assertions' own read surface); none of them contains
   * logic anymore.
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

  /** True once the typed Amount has more decimal places than the typed Currency allows (e.g. "10000.5 JPY") — mirrors the same check submit() blocks on. */
  get amountDecimalMismatch(): boolean {
    return amountExceedsCurrencyDecimals(this.model.amount, this.model.currency);
  }

  get currencyDecimalPlaces(): number {
    return decimalPlacesForCurrency(this.model.currency);
  }

  get ready(): boolean {
    return policy.isReady(this.selectedFunction, this.model);
  }

  /**
   * Business instruction 2026-08-15 ("Look Up Current Balance... 如果選 Import LC Tab, 不用選 直接
   * Default Import LC 輸入LC Number... 如果選 Export Confirmed Tab, 不用選 直接Default Export
   * Confirmed") — switching the Import/Export tab also defaults the Look Up panel's own instrumentType
   * to that side's root LC type, so the common case (look up the LC itself) needs no extra picking.
   * The dropdown stays editable — still needed to look up an Acceptance/SHGT directly by LC+IB#/SG#
   * instead of drilling into it via the parent LC's own Acceptance/SG tab.
   */
  selectFunctionSide(side: 'IMPORT' | 'EXPORT'): void {
    this.activeFunctionSide = side;
    this.lookUp.resetForSide(side);
  }

  selectFunction(fn: TransactionFunction): void {
    this.selectedFunction = fn;
    this.activeFunctionSide = fn.side;
    this.lookUp.resetForSide(fn.side);
    this.subChoiceValue = '';
    this.dynamicSecondaryRefLabel = fn.secondaryRefLabel ?? null;
    this.model = { currency: 'USD', createdBy: 'maker1', eventSeq: Date.now() };
    // Business instruction 2026-08-15: A1 (LC Issue) and B1 (Confirm LC) Tenor Type should default to
    // Sight — still changeable via the dropdown, just pre-selected since Sight is the common case.
    if (fn.code === 'A1' || fn.code === 'B1') this.model.tenorType = 'SIGHT';
    this.naturalKey = { lcNumber: '', ibNumber: '', sgNumber: '' };
    this.searchNaturalKey = { lcNumber: '', ibNumber: '', sgNumber: '' };
    this.searchError = null;
    this.selectedContract = null;
    this.selectedContractSnapshot = null;
    this.parentInstrumentType = fn.defaultParentInstrumentType ?? '';
    this.selectedParent = null;
    this.parentPicker.contracts = [];
    this.parentPicker.resetPaging();
    this.parentPicker.search = '';
    this.catalogPicker.resetPaging();
    this.catalogPicker.search = '';
    this.ibIndexPicker.contracts = [];
    this.ibIndexPicker.resetPaging();
    this.settleableBalances = [];
    this.settleableBalancesLoading = false;
    this.payableMovements = [];
    this.payableMovementSearch = '';
    this.selectedPayMovement = null;
    this.arrivalApproved = false;
    this.submitResult = null;
    this.submitError = null;
    this.accountEntryDialogMovement = null;
    this.sgsForArrival = [];
    this.selectedArrivalSg = null;
    this.arrivalSgSnapshot = null;
    this.arrivalSgRedeemMovementId = null;
    this.arrivalSgRedeemMovement = null;
    this.dueFromIssuingBankMovementId = null;
    this.acceptanceReimbReceivableMovementId = null;
    this.acceptanceMovementId = null;
    this.acceptanceMovement = null;
    this.matchedReceivableMovementId = null;
    // checkerLcNumber is deliberately NOT reset here — a Checker moving from one function to
    // another (e.g. A2 to A9) very plausibly wants to keep checking the SAME LC; only the resolved
    // contract needs clearing, since it was resolved against the OLD function's own instrumentType.
    this.checkerContract = null;
    this.checkerSearchError = null;
    this.checkerItems = [];
    this.selectedCheckerMovement = null;
    this.checkerError = null;

    if (fn.movementType) {
      // No sub-choice — instrumentType + movementType are both fixed.
      this.model.instrumentType = fn.instrumentType;
      this.model.movementType = fn.movementType;
      this.afterResolved();
    } else {
      // Wait for onSubChoice() — model.instrumentType/movementType stay unset until then.
    }
  }

  onSubChoice(): void {
    if (!this.selectedFunction || !this.subChoiceValue) return;
    const fn = this.selectedFunction;

    // Business instruction 2026-08-15: the B1/B2 Confirmed-vs-Unconfirmed branch (which used to
    // switch instrumentType between EPLC_CONFIRMATION and EPLC_LC here) was removed along with
    // B1/B2's own `subChoice: {key: 'confirmed'}` definition — see the EXPORT_FUNCTIONS module note
    // in balance-component.model.ts. No function defines that subChoice key anymore.
    this.model.instrumentType = fn.instrumentType;
    this.model.movementType = this.subChoiceValue;
    this.afterResolved();
  }

  private afterResolved(): void {
    // Business instruction 2026-08-14 ("A7 amount should be carried from IB record and protected... if full
    // settle") — covers switching the Settlement type subChoice to Full Settle AFTER a contract is already
    // selected (refreshSelectedContractSnapshot() only re-fires on a NEW selection, not a subChoice change).
    // A9 has no subChoice (fixed FULL_REDEEM, business instruction 2026-08-15), so the autoRedeemType branch
    // below is unreachable for it in practice — kept symmetric with FULL_SETTLE anyway since
    // refreshSelectedContractSnapshot() above is the one doing the real work for A9.
    if (this.model.movementType === 'FULL_SETTLE' && this.selectedContractSnapshot) {
      // Business instruction 2026-08-15 ("B5 Full Submit 出現 Typed amount exceeds Available Balance")
      // — bug: was defaulting to confirmedBalance, but FULL_SETTLE/PARTIAL_SETTLE are both
      // OUTSTANDING_CAPPED server-side (balanceService.ts), checked against `available`, not
      // `confirmed` — same commitment-control distinction as the SG redemption fix below and A9's own
      // fix. If any OTHER movement is already PENDING against this same Acceptance, Confirmed and
      // Available diverge, and defaulting to Confirmed would set up a Full Settle guaranteed to fail
      // its own server-side check the moment it's typed.
      this.model.amount = this.selectedContractSnapshot.availableBalance;
    } else if (this.selectedFunction?.autoRedeemType && this.selectedContractSnapshot) {
      // Business instruction 2026-08-15 ("Amount default to SG Available Balance") — Confirmed Balance
      // ignores any OTHER redemption already reserved PENDING against this same SG; Available is what's
      // actually still redeemable right now (same distinction as the shgtRedeem.ts commitment-control fix).
      this.model.amount = this.selectedContractSnapshot.availableBalance;
    } else if (this.selectedFunction?.settlesAcceptanceOnMature && this.model.instrumentType === 'EPLC_ACCEPTANCE' && this.selectedContractSnapshot) {
      // B5 only — kept symmetric with FULL_SETTLE/autoRedeemType above; unreachable in practice since B5
      // has no subChoice to re-trigger this with a contract already selected (refreshSelectedContractSnapshot() does the real work).
      this.model.amount = this.selectedContractSnapshot.availableBalance;
    }
    this.rebuildFields();
    if (!this.isCreatingMovement && !this.usesTwoFieldSearch) this.reloadCatalog();
    if (this.parentInstrumentType) this.onParentInstrumentTypeChange();
  }

  /** Business instruction 2026-08-14 "pickup 時 Order by Reference 而且需要 Page by Page設計" — page defaults to 1 (a fresh search), pass an explicit page to page through an already-loaded list. BAL-003 (8th pass): thin wrapper over `catalogPicker.load()` — guard/tenorFamily/onLoaded (this picker's own A4 payable-hint follow-up) are unchanged, only the fetch/populate/error body moved into the service. */
  reloadCatalog(page = 1): void {
    this.catalogPicker.load({
      guardFails: !this.model.instrumentType || this.isCreatingMovement,
      instrumentType: this.model.instrumentType!,
      page,
      tenorFamily: this.selectedFunction?.catalogTenorFilter,
      onLoaded: (items) => {
        if (this.selectedFunction?.payExistingUtilize) this.loadPayableIbHints(items);
      },
    });
  }

  /** Business-reported gap 2026-08-14 ("Why the U003 does not allow for Amendment?") — search resets to page 1. */
  onCatalogSearch(): void {
    this.reloadCatalog(1);
  }

  /**
   * A4 (Sight Settlement) LC Index only — business instruction 2026-08-14:
   * "LC Index should display the associated IB Number together with the LC
   * Number and Pending Amount". Fetches each candidate LC's still-PENDING
   * UTILIZE movements (the same filter used for Step 2's IB Index) so the
   * IB Number(s) can be shown inline in Step 1, without waiting for the
   * user to drill into Step 2 first.
   *
   * Business-reported gap 2026-08-14 ("user would like to select S001 IB03
   * or S001 IB04 for A4 separately" — "buyer may settle IB04 today then
   * IB03 by tomorrow"): stores the FULL movement objects (not just ref
   * strings) so flattenedPayableRows() below can offer each (LC, IB) pair
   * as ONE directly-clickable row — settling IB04 today and coming back
   * for IB03 tomorrow shouldn't require re-picking the LC first each time.
   */
  private loadPayableIbHints(list: BalanceContract[]): void {
    this.catalogPayableIbs.clear();
    this.catalogPayableMovements.clear();
    if (!list.length) return;
    forkJoin(list.map((c) => this.api.listMovements(c.balanceContractId).pipe(catchError(() => of([] as any[]))))).subscribe((results) => {
      list.forEach((c, i) => {
        const pending = (results[i] ?? []).filter((m: any) => m.status === 'PENDING' && m.movementType === 'UTILIZE');
        if (pending.length) {
          this.catalogPayableIbs.set(
            c.balanceContractId,
            pending.map((m: any) => m.sourceTransactionRef || '(no IB Number)'),
          );
          this.catalogPayableMovements.set(c.balanceContractId, pending);
        }
      });
    });
  }

  /**
   * Business-reported gap 2026-08-14 ("select S001 IB03 or S001 IB04 for A4
   * separately") — one row per still-PENDING (LC, IB) pair across the
   * current LC Index page, so picking a specific presentation to settle is
   * a single click instead of LC-then-IB. Sorted by LC Number then IB
   * Number for a stable, predictable order.
   */
  get flattenedPayableRows(): { contract: BalanceContract; movement: any }[] {
    const rows: { contract: BalanceContract; movement: any }[] = [];
    for (const c of this.filteredCatalogContracts) {
      const movements = this.catalogPayableMovements.get(c.balanceContractId) ?? [];
      for (const m of movements) rows.push({ contract: c, movement: m });
    }
    rows.sort((a, b) => {
      const lc = a.contract.naturalKey.lcNumber.localeCompare(b.contract.naturalKey.lcNumber);
      return lc !== 0 ? lc : (a.movement.sourceTransactionRef ?? '').localeCompare(b.movement.sourceTransactionRef ?? '');
    });
    return rows;
  }

  /**
   * One-click select for A4 — sets both the LC and the specific pending
   * movement in one action (business-reported gap "select S001 IB03 or
   * S001 IB04 separately"). Deliberately does NOT call onSelectContract()
   * — that would kick off an async re-fetch of payableMovements that could
   * race with (and overwrite) the selection made here; everything needed
   * is already sitting in catalogPayableMovements from the LC Index load.
   */
  onSelectFlattenedPayable(contractId: string, movementId: string): void {
    this.selectedContract = this.catalogPicker.contracts.find((c) => c.balanceContractId === contractId) ?? null;
    this.refreshSelectedContractSnapshot();
    this.payableMovements = this.catalogPayableMovements.get(contractId) ?? [];
    this.payableMovementsLoading = false;
    this.onSelectPayMovement(movementId);
    // 4-eyes redesign 2026-08-16: unlike onSelectContract() above (which this deliberately doesn't
    // call, see doc comment), this one-click path never pre-fills the Checker panel's own search box
    // on its own — add the same convenience explicitly so a Maker's Quick Pick click behaves like
    // every other picker in this component.
    this.syncCheckerToContext();
  }

  /**
   * Renders as " — IB00001" (single) or " — 2 pending: IB00001, IB00002"
   * (multiple) or '' (none pending). A4 only.
   * Business-reported gap 2026-08-14 ("IB02 IB03 should be approved
   * separately. Fix it."): the approval mechanism already handles them
   * independently — paying one movement never touches the other (Step 2's
   * IB Index lists each as its own selectable row, Pay releases exactly one
   * movementId). The bare "IB02, IB03" hint just LOOKED like one combined
   * entry; the "N pending:" prefix makes the separateness explicit instead.
   */
  catalogIbHint(c: BalanceContract): string {
    const ibs = this.catalogPayableIbs.get(c.balanceContractId);
    if (!ibs?.length) return '';
    return ibs.length === 1 ? ` — ${ibs[0]}` : ` — ${ibs.length} pending: ${ibs.join(', ')}`;
  }

  catalogPrevPage(): void {
    const page = this.catalogPicker.prevTarget();
    if (page !== null) this.reloadCatalog(page);
  }

  catalogNextPage(): void {
    const page = this.catalogPicker.nextTarget();
    if (page !== null) this.reloadCatalog(page);
  }

  /**
   * Business instruction 2026-08-14: only exclude 0-balance candidates for
   * movementTypes that DECREASE the target — an AMEND_INCREASE/etc. target
   * starting at 0 is perfectly normal. Also applies A3/A4/A5's
   * catalogTenorFilter (business-reported gap: "There is no Sight Payment
   * function for the Tenor Sight to pay") — contracts with no tenorType
   * recorded (legacy) are never filtered out.
   *
   * A4 (Sight Settlement, payExistingUtilize) is deliberately EXEMPT from the
   * 0-balance exclusion: a PENDING Document Arrival already drops
   * availableBalance before Release (Design doc §6, earmark takes effect
   * immediately) — that's exactly the LC Sight Payment needs to find, so
   * filtering it out here would hide the one thing this function looks for.
   */
  get filteredCatalogContracts(): BalanceContract[] {
    let list = this.catalogPicker.contracts;
    const tenorFilter = this.selectedFunction?.catalogTenorFilter;
    if (tenorFilter) {
      list = list.filter((c) => !c.tenorType || (tenorFilter === 'SIGHT' ? c.tenorType === 'SIGHT' : c.tenorType !== 'SIGHT'));
    }
    if (this.selectedFunction?.payExistingUtilize) return list;
    if (!this.model.movementType || !DECREASING_MOVEMENT_TYPES.has(this.model.movementType)) return list;
    return list.filter((c) => {
      const snap = this.catalogPicker.snapshots.get(c.balanceContractId);
      return !snap || snap.availableBalance !== '0';
    });
  }

  /** Instrument/status changed (or first resolved) — reset to page 1 and reload. */
  onParentInstrumentTypeChange(): void {
    this.selectedParent = null;
    // Business instruction 2026-08-15: EPLC_LC (Unconfirmed, MEMO) removed as a parent option — every
    // Acceptance is now exposureNature ACTUAL (real liability, rationale §7.6 Step 1).
    this.exposureNature = 'ACTUAL';
    this.loadParentPage(1);
  }

  /**
   * Business instruction 2026-08-14 "Page by Page設計" — fetches one page without resetting the
   * current parent selection. BAL-003 (8th pass): thin wrapper over `parentPicker.load()` — the guard
   * condition and every parameter below are unchanged, only the fetch/populate/error body moved.
   *
   * Business-reported gap 2026-08-14 ("Why the U002, IB02 does not shown in A6?", "A7 should filter out LC
   * records Tenor = Sight") — same class of bug as A5's flat Catalog picker: filtering client-side AFTER
   * server pagination let a page of raw rows contain almost none of the eligible (Usance) tenor. A6/B4
   * (tenorTypeOptions set) and A7/B5 (catalogTenorFilter — an Acceptance never exists under a Sight LC) both
   * filter server-side; A8's SHGT parent (neither) stays unfiltered, same as before.
   */
  private loadParentPage(page: number): void {
    this.parentPicker.load({
      guardFails: !this.parentInstrumentType,
      instrumentType: this.parentInstrumentType as InstrumentType,
      page,
      tenorFamily: this.parentTenorFamily,
    });
  }

  /** Business-reported gap 2026-08-14 ("Why the U002, IB02 does not shown in A6?") — search resets to page 1. */
  onParentSearch(): void {
    this.loadParentPage(1);
  }

  parentPrevPage(): void {
    const page = this.parentPicker.prevTarget();
    if (page !== null) this.loadParentPage(page);
  }

  parentNextPage(): void {
    const page = this.parentPicker.nextTarget();
    if (page !== null) this.loadParentPage(page);
  }

  get parentTenorFamily(): 'SIGHT' | 'USANCE' | undefined {
    return policy.parentTenorFamily(this.selectedFunction);
  }

  /**
   * Business instruction 2026-08-14 "Pickup Parent Reference 就應該用 Tenor
   * type 做選擇條件 把不合格的交易濾掉" — functions that themselves carry
   * tenorTypeOptions (A6/B4 Acceptance) require an EXACT tenor match
   * against model.tenorType, and exclude legacy contracts with no
   * tenorType recorded (higher stakes — creating something new). A7/B5
   * ("A7 should filter out LC records Tenor = Sight") only need
   * non-Sight, and legacy/unset tenorType stays visible — this is a
   * SEARCH, not a creation, so there's nothing risky about showing an LC
   * of unproven tenor; the actual Acceptance lookup just returns nothing
   * if it isn't there. A8/SHGT has neither flag, so its parent picker is
   * left unfiltered by tenor — SG can be issued under any tenor. Combined
   * with the same 0-balance exclusion as filteredCatalogContracts() above.
   */
  get filteredParentCatalog(): BalanceContract[] {
    let list = this.parentPicker.contracts;
    if (this.selectedFunction?.tenorTypeOptions?.length) {
      list = list.filter((c) => c.tenorType && c.tenorType !== 'SIGHT' && (!this.model.tenorType || c.tenorType === this.model.tenorType));
    } else if (this.selectedFunction?.catalogTenorFilter === 'USANCE') {
      list = list.filter((c) => !c.tenorType || c.tenorType !== 'SIGHT');
    }
    // A7/old-B5 (catalogTenorFilter) and new B5 (settleableBalanceIndex, 2026-08-16) alike — the
    // Confirmation/LC's OWN remaining balance is irrelevant to whether it still has an outstanding
    // Acceptance/Due-from-Issuing-Bank to settle (Settlement never touches the Confirmation's own
    // balance); a fully-honoured/accepted Confirmation can easily still have those waiting. Same
    // exemption reasoning as A4's filteredCatalogContracts(). Found live: IDX01 (fully ACCEPTed, own
    // Available Balance 0) was wrongly excluded from B5's own "LC Index" before this fix.
    if (this.selectedFunction?.catalogTenorFilter === 'USANCE' || this.selectedFunction?.settleableBalanceIndex) return list;
    return list.filter((c) => {
      const snap = this.parentPicker.snapshots.get(c.balanceContractId);
      return !snap || snap.availableBalance !== '0';
    });
  }

  /**
   * Business instruction 2026-08-15 ("Index Search") — client-side filter for the 2ndary Index
   * (A4/A6's still-PENDING Document Arrival picker, B4's still-PENDING Present Docs picker), by
   * sourceTransactionRef (IB/EB Number). payableMovements is already fully loaded/unpaginated
   * (loadPayableMovements()), so this filters in place rather than round-tripping to the server —
   * unlike the LC Index/flat Catalog pickers, which page server-side and need a real (search) event.
   */
  get filteredPayableMovements(): any[] {
    const q = this.payableMovementSearch.trim().toLowerCase();
    if (!q) return this.payableMovements;
    return this.payableMovements.filter((m) => (m.sourceTransactionRef ?? '').toLowerCase().includes(q));
  }

  /**
   * Business instruction 2026-08-15 ("Index Search") — the IndexPicker's own autoPickedHint text
   * ("picked automatically") fires purely off items.length === 1, but the actual auto-pick behavior
   * (loadPayableMovements()) only ever runs once, against the ORIGINAL unfiltered list at load time —
   * so narrowing to one match via search would show the hint without it being true. This re-runs that
   * same auto-pick whenever typing narrows filteredPayableMovements down to exactly one, keeping the
   * hint and the actual behavior in sync.
   */
  onPayableMovementSearchChange(value: string): void {
    this.payableMovementSearch = value;
    if (this.filteredPayableMovements.length === 1) {
      this.onSelectPayMovement(this.filteredPayableMovements[0].movementId);
    }
  }

  /**
   * UX 2026-08-14 "UX要做好 方便操作" — A4 (Sight Settlement) only: shows which LCs in
   * the Step 1 picker actually have something to pay, using the
   * pendingEarmarkTotal already fetched into catalogPicker.snapshots for the
   * (now-skipped) 0-balance filter, so no extra API calls are needed.
   * Without this, the user has to click through every Sight LC blind to
   * find the one with a pending Document Arrival.
   */
  catalogPendingHint(c: BalanceContract): string {
    if (!this.selectedFunction?.payExistingUtilize) return '';
    const snap = this.catalogPicker.snapshots.get(c.balanceContractId);
    if (!snap || snap.pendingEarmarkTotal === '0') return '';
    const ibs = this.catalogPayableIbs.get(c.balanceContractId);
    const label = ibs && ibs.length > 1 ? 'Total Pending' : 'Pending';
    return ` — ${label}: ${this.formatAmount(snap.pendingEarmarkTotal.replace('-', ''))}`;
  }

  /** Thousand-separated display only (business instruction 2026-08-14 example: "Pending: 25,000") — never used for any calculation or API payload, those stay plain decimal strings. */
  private formatAmount(amount: string): string {
    const [whole, frac] = amount.split('.');
    const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return frac ? `${withCommas}.${frac}` : withCommas;
  }

  /**
   * Quality-report-balance.md BAL-005: single place to turn an HTTP error into a display string —
   * previously this exact `this.describeApiError(err)` expression was duplicated 32 times
   * across every API-calling method below. Every call site's own error message/context (e.g. "Could
   * not release the Shipping Guarantee redemption — Document Arrival NOT acknowledged: …") is
   * unchanged; only this shared tail expression moved here.
   */
  private describeApiError(err: any): string {
    return describeApiErrorShared(err);
  }

  /**
   * Business instruction 2026-08-14 ("Balance Update from Pending to
   * Approved") — display-only relabeling of the movement status: the
   * underlying API/domain status stays 'RELEASED' (OAS contract, tests,
   * audit trail all key off that value), this only changes what the user
   * reads on screen once a Checker has finalized it.
   */
  displayStatus(status: string): string {
    return status === 'RELEASED' ? 'Approved' : status;
  }

  /** analysis/contingent-liability-ledger.html — opens the Account Entries pop-up for one specific movement. The movement's own contingentAccountEntry is already loaded (Submit response / Event Timeline list) — this never issues its own fetch. */
  openAccountEntryDialog(movement: BalanceMovement): void {
    this.accountEntryDialogMovement = movement;
  }

  closeAccountEntryDialog(): void {
    this.accountEntryDialogMovement = null;
  }

  /** Escape closes the Account Entries dialog, same as the backdrop click / Close button. */
  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.accountEntryDialogMovement) this.closeAccountEntryDialog();
  }

  onSelectContract(contractId: string): void {
    this.selectedContract = this.catalogPicker.contracts.find((c) => c.balanceContractId === contractId) ?? null;
    // Business instruction 2026-08-15 ("B3 不須選 Sight/Usance 因為交易本身已經有此訊息了") — B3 only.
    // Sight/Usance is no longer a manual subChoice; derive it from the picked Confirmation's own
    // tenorType (declared once, at B1) instead of asking the Maker to re-pick it here.
    if (this.selectedFunction?.movementTypeFromContractTenor && this.selectedContract) {
      this.model.movementType = this.selectedContract.tenorType === 'SIGHT' ? 'HONOUR' : 'ACCEPT';
    }
    // Business instruction 2026-08-16 ("A2-A9/B2-B5 Currency = Carry from A1/B1 + Protected") — see
    // carriedCurrency's own doc comment.
    if (this.carriedCurrency) {
      this.model.currency = this.carriedCurrency;
      this.rebuildFields();
    }
    this.refreshSelectedContractSnapshot();
    // Business instruction 2026-08-15 ("Confirm LC Balance 控制" table review — Present Docs must not
    // move the Confirmation, cs-tf-balance-knowhow D3/EX_DOC_RCV) — B4 only. B4's own primary
    // instrumentType is EPLC_CONFIRMATION (no parent of its own), so it picks its target via the flat
    // Catalog (onSelectContract), unlike A6/old-B4 which picked via a Parent LC. settlesDocumentArrival
    // still means the same thing either way: load the still-PENDING B3 Present Docs records under
    // whichever Confirmation was just picked.
    if (this.selectedFunction?.payExistingUtilize || this.selectedFunction?.settlesDocumentArrival) {
      this.loadPayableMovements(this.selectedContract?.balanceContractId);
    }
    if (this.selectedFunction?.documentArrivalWithSg) this.loadSgsForArrival();
    this.syncCheckerToContext();
  }

  /**
   * A3S Step 2 (business instruction 2026-08-14) — every SHGT record under
   * the LC picked in Step 1, so the Maker can pick which one this Document
   * Arrival is matched against. Mirrors the "Look Up Current Balance"
   * panel's own sgsUnderLookup fetch, restricted to the picked LC's own
   * lcNumber via the Catalog's lcNumber filter.
   *
   * Business instruction 2026-08-14 ("When SG Full_redemp then it should no
   * longer available from Document Arrival w/ Shipping Gtee") — a fully
   * redeemed SG's own BalanceContract.status stays ACTIVE (nothing in this
   * design ever transitions a contract to CLOSED just because its balance
   * hit 0, see Design doc §3.1's status machine); the only reliable signal
   * that it has nothing left is its own live snapshot showing 0 Available.
   * Same "0-balance exclusion" principle already applied to every other
   * picker (filteredCatalogContracts()/filteredIbIndexCatalog()/
   * filteredParentCatalog()), just resolved eagerly here — via forkJoin,
   * not the fire-and-forget loadSnapshotsInto() helper — so the exclusion
   * is already applied by the time "only one left, auto-pick it" runs.
   */
  private loadSgsForArrival(): void {
    this.selectedArrivalSg = null;
    this.arrivalSgSnapshot = null;
    this.sgsForArrival = [];
    const lcNumber = this.selectedContract?.naturalKey.lcNumber;
    if (!lcNumber) return;
    this.sgsForArrivalLoading = true;
    this.api.catalog('SHGT', 'ACTIVE', undefined, 1, 50, lcNumber).subscribe({
      next: (result) => {
        if (!result.items.length) {
          this.sgsForArrivalLoading = false;
          this.sgsForArrival = [];
          return;
        }
        forkJoin(result.items.map((c) => this.api.getSnapshot(c.balanceContractId).pipe(catchError(() => of(null))))).subscribe((snapshots) => {
          this.sgsForArrivalLoading = false;
          this.sgsForArrival = result.items.filter((_, i) => {
            const snap = snapshots[i];
            return !!snap && snap.availableBalance !== '0';
          });
          // UX 2026-08-14 "UX要做好 方便操作" — same "only one thing to pick, don't make the user pick it" pattern as loadPayableMovements().
          if (this.sgsForArrival.length === 1) this.onSelectArrivalSg(this.sgsForArrival[0].balanceContractId);
        });
      },
      error: () => {
        this.sgsForArrivalLoading = false;
        this.sgsForArrival = [];
      },
    });
  }

  /**
   * Business instruction 2026-08-15 ("SG redemption should support partial redemption... Bill Amount
   * = actual Document Arrival amount, freely typed") — reverses the prior full-match-only design: this
   * used to force model.amount = snapshot.confirmedBalance (locking Bill Amount to the SG's full
   * outstanding). Now it only fetches the picked SG's CURRENT snapshot (not the stale Catalog row) so
   * arrivalSgRedeemAmount/arrivalSgRedeemType below compute against a live outstanding figure — Bill
   * Amount itself stays whatever the Maker already typed (or blank).
   */
  onSelectArrivalSg(contractId: string): void {
    this.selectedArrivalSg = this.sgsForArrival.find((c) => c.balanceContractId === contractId) ?? null;
    this.arrivalSgSnapshot = null;
    if (!this.selectedArrivalSg) {
      this.rebuildFields();
      return;
    }
    this.api.getSnapshot(this.selectedArrivalSg.balanceContractId).subscribe({
      next: (snapshot) => {
        this.arrivalSgSnapshot = snapshot;
        this.rebuildFields();
      },
      error: () => {
        this.arrivalSgSnapshot = null;
        this.rebuildFields();
      },
    });
  }

  /**
   * Business instruction 2026-08-15 ("SG Redemption Amount = system-calculated MIN(Bill Amount, SG
   * Outstanding)") — A3S only, drives both the read-only balance-box display and submit()'s actual
   * SHGT redemption call. Null until both a specific SG is picked and a positive Bill Amount is typed.
   */
  get arrivalSgRedeemAmount(): string | null {
    if (!this.arrivalSgSnapshot) return null;
    const billAmount = Number(this.model.amount);
    if (!this.model.amount || !isFinite(billAmount) || billAmount <= 0) return null;
    return String(Math.min(billAmount, Number(this.arrivalSgSnapshot.confirmedBalance)));
  }

  /** FULL_REDEEM when Bill Amount fully covers the SG's outstanding, PARTIAL_REDEEM otherwise (business instruction 2026-08-15). */
  get arrivalSgRedeemType(): 'FULL_REDEEM' | 'PARTIAL_REDEEM' | null {
    if (!this.arrivalSgSnapshot || !this.arrivalSgRedeemAmount) return null;
    return Number(this.arrivalSgRedeemAmount) >= Number(this.arrivalSgSnapshot.confirmedBalance) ? 'FULL_REDEEM' : 'PARTIAL_REDEEM';
  }

  /** Informational only (not submitted) — what the SG's own outstanding balance will be after this redemption. */
  get arrivalSgRemaining(): string | null {
    if (!this.arrivalSgSnapshot || !this.arrivalSgRedeemAmount) return null;
    return String(Math.max(0, Number(this.arrivalSgSnapshot.confirmedBalance) - Number(this.arrivalSgRedeemAmount)));
  }

  /**
   * IB Index of still-PENDING Document Arrivals under a picked LC — A4
   * (Sight Settlement, triggered from onSelectContract) and A6 (Acceptance,
   * business instruction 2026-08-14 "A6 => Approved LC Balance and Create
   * Acceptance Balance", triggered from onSelectParent). Takes an explicit
   * contractId since the two callers source it from different selections
   * (selectedContract vs selectedParent).
   */
  private loadPayableMovements(contractId: string | undefined): void {
    this.selectedPayMovement = null;
    this.payableMovementSearch = '';
    if (!contractId) {
      this.payableMovements = [];
      return;
    }
    // Business instruction 2026-08-15 ("Confirm LC Balance 控制" table review) — B4 only. B3's own
    // CREATE lives on a SEPARATE child EPLC_EXAMINATION contract (parentLogicalContractId -> the
    // Confirmation), not on the Confirmation contract itself — listMovements(contractId) below would
    // never find it. See payableMovementInstrumentType's own doc comment.
    if (this.selectedFunction?.payableMovementInstrumentType) {
      this.loadPayableMovementsAcrossChildContracts(this.selectedFunction.payableMovementInstrumentType);
      return;
    }
    this.payableMovementsLoading = true;
    // Business instruction 2026-08-15 ("B4 should index records from B3") — payableMovementType lets
    // B4 filter for still-PENDING ACCEPT records (B3, EPLC_CONFIRMATION) instead of A4/A6's own
    // UTILIZE (A3, IPLC_LC); defaults to 'UTILIZE' when unset so A4/A6 are unchanged.
    const wantedMovementType = this.selectedFunction?.payableMovementType ?? 'UTILIZE';
    this.api.listMovements(contractId).subscribe({
      next: (list) => {
        this.payableMovementsLoading = false;
        this.payableMovements = list.filter((m) => m.status === 'PENDING' && m.movementType === wantedMovementType);
        // UX 2026-08-14 "UX要做好 方便操作" — when there's only one thing to pick, don't make the user pick it.
        if (this.payableMovements.length === 1) this.onSelectPayMovement(this.payableMovements[0].movementId);
      },
      error: () => {
        this.payableMovementsLoading = false;
        this.payableMovements = [];
      },
    });
  }

  /**
   * B4 (payableMovementInstrumentType) only — the cross-contract half of loadPayableMovements() above:
   * catalog-search still-ACTIVE child contracts of the given instrumentType under the picked
   * Confirmation's own LC Number (same "search by lcNumber" mechanism as A3S's loadSgsForArrival()),
   * then fetch EACH one's own movements to find its still-PENDING record (payableMovementType). One
   * EPLC_EXAMINATION contract only ever carries one CREATE movement (B3 never revisits a contract it
   * already created), so this is always at most one movement per candidate contract.
   */
  private loadPayableMovementsAcrossChildContracts(childInstrumentType: InstrumentType): void {
    const lcNumber = this.selectedContract?.naturalKey.lcNumber ?? this.selectedParent?.naturalKey.lcNumber;
    if (!lcNumber) {
      this.payableMovements = [];
      return;
    }
    const wantedMovementType = this.selectedFunction?.payableMovementType ?? 'UTILIZE';
    this.payableMovementsLoading = true;
    this.api.catalog(childInstrumentType, 'ACTIVE', undefined, 1, 50, lcNumber).subscribe({
      next: (result) => {
        if (!result.items.length) {
          this.payableMovementsLoading = false;
          this.payableMovements = [];
          return;
        }
        forkJoin(
          result.items.map((c) =>
            this.api.listMovements(c.balanceContractId).pipe(
              // EPLC_EXAMINATION's own EB Number lives on the CONTRACT's naturalKey.ibNumber (it's a
              // genuine natural key field, unlike A3's UTILIZE which has none of its own and carries
              // IB Number purely via sourceTransactionRef) — merge it onto each movement here as a
              // synthetic sourceTransactionRef, so onSelectPayMovement()/the row template can keep
              // reading `.sourceTransactionRef` generically without knowing which case this is.
              map((list) => list.map((m) => ({ ...m, sourceTransactionRef: m.sourceTransactionRef ?? c.naturalKey.ibNumber }))),
              catchError(() => of([] as any[])),
            ),
          ),
        ).subscribe((movementLists) => {
          this.payableMovementsLoading = false;
          // Business instruction 2026-08-15 ("B4 只能挑 Approved 的記錄") — B4 only: a B3 Present Docs
          // record must have passed its OWN Checker acknowledgment (B3's own Release, acknowledgedAt
          // set — see approveArrival()'s doc comment) before it can be picked here for Honour/Accept,
          // enforcing the 4-eyes check on the presentation itself as a real gate, not just a courtesy.
          const requiresAck = !!this.selectedFunction?.payableMovementRequiresAcknowledgment;
          this.payableMovements = movementLists
            .flat()
            .filter((m: any) => m.status === 'PENDING' && m.movementType === wantedMovementType && (!requiresAck || m.acknowledgedAt));
          if (this.payableMovements.length === 1) this.onSelectPayMovement(this.payableMovements[0].movementId);
        });
      },
      error: () => {
        this.payableMovementsLoading = false;
        this.payableMovements = [];
      },
    });
  }

  onSelectPayMovement(movementId: string): void {
    this.selectedPayMovement = this.payableMovements.find((m) => m.movementId === movementId) ?? null;
    // A6 only (business instruction 2026-08-14 "The amount should carry from the related LC number + IB
    // number and protected"): auto-fills AND locks the Acceptance's own natural key IB Number and Amount from
    // the Document Arrival being converted — no longer just a default, rebuildFields() below disables the
    // Amount input so it can't drift from what the presentation actually recorded.
    if (this.selectedFunction?.settlesDocumentArrival && this.selectedPayMovement) {
      this.naturalKey.ibNumber = this.selectedPayMovement.sourceTransactionRef ?? '';
      // Business instruction 2026-08-15 ("Confirm LC Balance 控制" table review) — B4 only. A6 reads
      // naturalKey.ibNumber (its own instrumentType, IPLC_ACCEPTANCE, has ibNumber as a natural key
      // field); B4's instrumentType, EPLC_CONFIRMATION, does not — it carries its EB Number via
      // secondaryRef instead (secondaryRefLabel), same as old-B3 did. Set both so either kind of
      // consumer picks up the right one; harmless no-op for a function that doesn't use secondaryRef.
      if (this.selectedFunction.secondaryRefLabel) {
        this.model.secondaryRef = this.selectedPayMovement.sourceTransactionRef ?? '';
      }
      this.model.amount = this.selectedPayMovement.amount;
      this.rebuildFields();
    }
    // A4 only (business instruction 2026-08-16, real Maker Submit): picking a NEW Document Arrival
    // clears any PREVIOUS Submit result so the Maker isn't left looking at a stale MAKER RESULT panel
    // for a DIFFERENT movement.
    if (this.selectedFunction?.payExistingUtilize) {
      this.submitResult = null;
      this.submitError = null;
    }
  }

  /**
   * A4 (Sight Settlement)'s own real Maker Submit — business instruction 2026-08-16 ("Add real Maker
   * Submit, then have Checker to Release it. Exactly the same as A1."). Unlike every other function,
   * A4 has no movement of its own to create — it settles the PRE-EXISTING UTILIZE A3/A3S already
   * earmarked (and already gave its own Account Entries — see A3's own submit() flow) — so this calls
   * the dedicated backend maker-submit action instead of createMovement(). Sets `submitResult` exactly
   * like the generic submit() does, so the SAME "MAKER RESULT" panel below (Status/Account
   * Entries/"Go to the Checker section" hint/Delete Pending) renders identically to every other
   * function — checkerAct()'s own doc comment covers the matching Checker-side gate.
   */
  submitA4(): void {
    if (!this.selectedPayMovement) return;
    this.submitting = true;
    this.submitResult = null;
    this.submitError = null;
    this.api.submitByMaker(this.selectedPayMovement.movementId, this.model.createdBy || 'maker1').subscribe({
      next: (res) => {
        this.submitting = false;
        this.submitResult = res;
        this.syncCheckerToContext();
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
        // Business instruction 2026-08-14 ("A7 amount should be carried from IB record and protected... if full
        // settle") — Full Settle means paying off whatever the Acceptance can currently actually settle, so
        // it's carried and locked; Partial Settle is a genuine typed decision each time, left free. Applies to
        // A7/B5 alike (both share movementType FULL_SETTLE/PARTIAL_SETTLE), no extra function-specific flag needed.
        // Business instruction 2026-08-15 ("B5 Full Submit 出現 Typed amount exceeds Available Balance") —
        // bug fix: was `confirmedBalance`, but FULL_SETTLE/PARTIAL_SETTLE are OUTSTANDING_CAPPED
        // server-side (balanceService.ts), checked against `available` — see afterResolved()'s own,
        // more detailed doc comment for the same fix.
        if (this.model.movementType === 'FULL_SETTLE') {
          this.model.amount = snap.availableBalance;
          this.rebuildFields();
        } else if (this.selectedFunction?.settlesAcceptanceOnMature && this.model.instrumentType === 'EPLC_ACCEPTANCE') {
          // Business instruction 2026-08-16 ("B6改成B5選資料為有Acceptance Balance>0的EB交易") — same
          // "default to Available, freely editable down to Partial, capped at it" shape as autoRedeemType
          // below. NOTE: since B5's own registry entry now declares movementType: 'FULL_SETTLE' directly
          // (not 'REIMBURSE'), this branch is currently redundant with the FULL_SETTLE branch above for
          // any real B5 submission — both assign the identical `snap.availableBalance` — kept as its own
          // branch rather than merged/removed here since that's outside this fix's scope (Quality-report-
          // balance.md BAL-101 was specifically about the removed `dualInstrumentFallback` field this
          // comment used to describe reaching this branch through; it did not claim this branch itself
          // was dead, and merging/removing it needs its own separate verification pass).
          this.model.amount = snap.availableBalance;
          this.rebuildFields();
        } else if (this.selectedFunction?.autoRedeemType) {
          // Business instruction 2026-08-15 ("Amount default to SG Available Balance", refining the
          // earlier same-day "defaulted amount is the SG Balance" instruction) — Available, not
          // Confirmed: Confirmed ignores any OTHER redemption already reserved PENDING against this
          // same SG, so defaulting/capping to it could offer an amount the server would reject (the
          // same commitment-control distinction as shgtRedeem.ts's confirmed-vs-available fix). NOT
          // locked either way — amountCappedAtSg in rebuildFields() leaves it freely editable down to a
          // Partial Redeem, capped at Available (props.max) rather than disabled.
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

  /**
   * Business instruction 2026-08-14: for IPLC_ACCEPTANCE/EPLC_ACCEPTANCE
   * (search by LC Number + IB Number) and SHGT redemption (search by LC
   * Number + SG Number) — resolves the SPECIFIC contract directly via its
   * natural key, instead of browsing the flat Catalog dropdown used for
   * IPLC_LC/EPLC_LC/EPLC_CONFIRMATION (whose natural key is lcNumber alone).
   */
  searchExistingContract(): void {
    if (!this.model.instrumentType) return;
    this.searchError = null;
    if (!this.searchNaturalKey.lcNumber) {
      this.searchError = 'LC Number is mandatory to search.';
      return;
    }
    // Business instruction 2026-08-14: "If there are multiple document
    // arrival, only the LC Number is not good enough" — IB/SG Number is
    // part of the natural key (unique per LC, see schema.ts's unique index
    // on lc_number+ib_number+sg_number), so it must be entered before
    // searching. Without this check, an empty field silently produced a
    // generic "not found" 404 instead of telling the user what to fill in.
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
          // Business instruction 2026-08-15 ("if SG record balance = 0, then it should no longer require
          // redemption") — same 0-balance exclusion filteredIbIndexCatalog()/filteredCatalogContracts()
          // already apply to their own pickers, extended to this free-text search entry point too (A9's
          // "2ndary Index" browse picker below already excludes 0-balance rows; typing the exact LC+SG of
          // an already-fully-redeemed one bypassed that — this would otherwise only fail at Submit, with a
          // 409 from the server).
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
              // Business instruction 2026-08-16 ("A2-A9/B2-B5 Currency = Carry from A1/B1 + Protected")
              // — see carriedCurrency's own doc comment.
              if (this.carriedCurrency) {
                this.model.currency = this.carriedCurrency;
                this.rebuildFields();
              }
              this.refreshSelectedContractSnapshot();
              this.syncCheckerToContext();
            });
            return;
          }
          this.selectedContract = contract;
          if (this.carriedCurrency) {
            this.model.currency = this.carriedCurrency;
            this.rebuildFields();
          }
          this.refreshSelectedContractSnapshot();
          this.syncCheckerToContext();
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
    // Business instruction 2026-08-16 ("A2-A9/B2-B5 Currency = Carry from A1/B1 + Protected") — see
    // carriedCurrency's own doc comment. Fires for every hasParent function (A6/A7/A8/A9/B3/B5) as soon
    // as the LC/Confirmation itself is picked, before any Step-2 child picker/search.
    if (this.carriedCurrency) {
      this.model.currency = this.carriedCurrency;
      this.rebuildFields();
    }
    // A6/B4 Acceptance (and A8 SG Issue): the LC Number is NOT a
    // freely-typed part of the new contract's natural key here — it must be
    // the SAME LC the Parent was picked from (an Acceptance/SG can only ever
    // be created under an LC that already exists). Auto-fill it from the
    // Parent selection instead of asking the user to type it a second time,
    // where it could drift from what was actually picked as Parent.
    if (this.isCreatingMovement && this.selectedParent) {
      this.naturalKey.lcNumber = this.selectedParent.naturalKey.lcNumber;
    }
    // A7/B5 (Acceptance Settlement) / A9 Redeem: this same Parent LC picker
    // doubles as Step 1 ("LC Index") of the cascading picker — business
    // instruction 2026-08-14. Picking an LC here drives Step 2 ("IB Index")
    // below instead of requiring the LC Number to be typed by hand.
    if (this.usesTwoFieldSearch && this.selectedParent) {
      this.searchNaturalKey.lcNumber = this.selectedParent.naturalKey.lcNumber;
      this.searchNaturalKey.ibNumber = '';
      this.searchNaturalKey.sgNumber = '';
      this.searchError = null;
      this.selectedContract = null;
      this.selectedContractSnapshot = null;
      this.loadIbIndexPage(1);
    }
    // A6 only (business instruction 2026-08-14 "A6 => Approved LC Balance and Create Acceptance Balance") —
    // Step 2: still-PENDING Document Arrivals under the picked parent LC, ready to be released + converted.
    if (this.selectedFunction?.settlesDocumentArrival && this.selectedParent) {
      this.loadPayableMovements(this.selectedParent.balanceContractId);
    }
    // B5 only (business instruction 2026-08-16, "EB Index... those EB records with Acceptance
    // Balance") — Step 2: still-outstanding Due-from-Issuing-Bank/Acceptance records under the picked
    // Confirmation, ready to be settled.
    if (this.selectedFunction?.settleableBalanceIndex && this.selectedParent) {
      this.loadSettleableBalances(this.selectedParent.naturalKey.lcNumber);
    }
    // A6/B4 (business instruction 2026-08-14 "The Tenor Type and Tenor days should carry from the LC Number
    // and protected as well") — copied from the parent LC's own declared values, not freely typed, since the
    // Acceptance's tenor must always match what the LC itself declared at Issue (server-enforced anyway).
    if (this.selectedFunction?.tenorTypeOptions?.length && this.isCreatingMovement && this.hasParent && this.selectedParent) {
      this.model.tenorType = this.selectedParent.tenorType ?? undefined;
      this.model.tenorDays = this.selectedParent.tenorDays ?? undefined;
      this.rebuildFields();
    }
  }

  /**
   * Step 2 of the "LC Index -> IB Index" cascading picker (business instruction 2026-08-14) — one page
   * of IPLC_ACCEPTANCE/EPLC_ACCEPTANCE/SHGT rows under the exact LC picked in Step 1. BAL-003 (8th
   * pass): thin wrapper over `ibIndexPicker.load()`, guard/params unchanged.
   */
  private loadIbIndexPage(page: number): void {
    this.ibIndexPicker.load({
      guardFails: !this.model.instrumentType || !this.searchNaturalKey.lcNumber,
      instrumentType: this.model.instrumentType!,
      page,
      lcNumber: this.searchNaturalKey.lcNumber,
    });
  }

  ibIndexPrevPage(): void {
    const page = this.ibIndexPicker.prevTarget();
    if (page !== null) this.loadIbIndexPage(page);
  }

  ibIndexNextPage(): void {
    const page = this.ibIndexPicker.nextTarget();
    if (page !== null) this.loadIbIndexPage(page);
  }

  /**
   * B5's own "EB Index" Step 2 (business instruction 2026-08-16) — still-outstanding candidates of
   * selectedFunction.instrumentType (EPLC_ACCEPTANCE, B5's own fixed type) under the given
   * Confirmation's own LC Number. Unlike loadIbIndexPage() above (single type, server-paginated), this
   * loads its one catalog unpaginated (up to 50, same cap as loadPayableMovementsAcrossChildContracts())
   * and filters to Available > 0 — nothing left to settle isn't worth offering as a target. `types`
   * stays an array (rather than a single instrumentType) purely so the forkJoin below can stay written
   * generically — earlier in B5's history (when it briefly also covered the Sight case) this merged in
   * a second instrumentType via a `dualInstrumentFallback` field; removed as dead code
   * (Quality-report-balance.md BAL-101) once B5 reverted to Usance-only and the field was left
   * permanently unset.
   */
  private loadSettleableBalances(lcNumber: string): void {
    const fn = this.selectedFunction;
    if (!fn?.instrumentType) {
      this.settleableBalances = [];
      return;
    }
    const types: InstrumentType[] = [fn.instrumentType];
    this.settleableBalancesLoading = true;
    forkJoin(
      types.map((instrumentType) =>
        this.api.catalog(instrumentType, 'ACTIVE', undefined, 1, 50, lcNumber).pipe(
          map((result) => result.items.map((c) => ({ contract: c, instrumentType }))),
          catchError(() => of([] as { contract: BalanceContract; instrumentType: InstrumentType }[])),
        ),
      ),
    ).subscribe((lists) => {
      const candidates = lists.flat();
      if (!candidates.length) {
        this.settleableBalancesLoading = false;
        this.settleableBalances = [];
        return;
      }
      forkJoin(
        candidates.map((cand) =>
          this.api.getSnapshot(cand.contract.balanceContractId).pipe(
            map((snap) => ({ cand, snap })),
            catchError(() => of(null)),
          ),
        ),
      ).subscribe((results) => {
        this.settleableBalancesLoading = false;
        this.settleableBalances = results
          .filter(
            (r): r is { cand: { contract: BalanceContract; instrumentType: InstrumentType }; snap: BalanceSnapshot } =>
              !!r && Number(r.snap.availableBalance) > 0,
          )
          .map((r) => ({
            balanceContractId: r.cand.contract.balanceContractId,
            instrumentType: r.cand.instrumentType,
            ibNumber: r.cand.contract.naturalKey.ibNumber ?? null,
            availableBalance: r.snap.availableBalance,
            currency: r.cand.contract.currency,
          }));
      });
    });
  }

  /** Pick handler for the "EB Index" picker above — routes to whichever real instrumentType that specific candidate actually is (currently always EPLC_ACCEPTANCE, B5's own fixed type — see loadSettleableBalances' own doc comment). */
  onSelectSettleableBalance(balanceContractId: string): void {
    const picked = this.settleableBalances.find((s) => s.balanceContractId === balanceContractId);
    if (!picked) return;
    this.model.instrumentType = picked.instrumentType;
    this.selectedContract = {
      balanceContractId: picked.balanceContractId,
      instrumentType: picked.instrumentType,
      naturalKey: { lcNumber: this.selectedParent?.naturalKey.lcNumber ?? '', ibNumber: picked.ibNumber },
      status: 'ACTIVE',
      currency: picked.currency,
    } as BalanceContract;
    // Business instruction 2026-08-16 ("B2-B5 Currency = Carry from B1 + Protected") — already carried
    // from Step 1's selectedParent (onSelectParent()) in the normal flow; re-asserted here too so it's
    // correct even if Step 2 is reached some other way. See carriedCurrency's own doc comment.
    if (this.carriedCurrency) {
      this.model.currency = this.carriedCurrency;
      this.rebuildFields();
    }
    this.searchNaturalKey.ibNumber = picked.ibNumber ?? '';
    this.refreshSelectedContractSnapshot();
    this.syncCheckerToContext();
  }

  /** Same 0-balance exclusion as filteredCatalogContracts()/filteredParentCatalog() — don't offer an already fully-settled/redeemed row as a Settlement/Redeem target. */
  get filteredIbIndexCatalog(): BalanceContract[] {
    if (!this.model.movementType || !DECREASING_MOVEMENT_TYPES.has(this.model.movementType)) return this.ibIndexPicker.contracts;
    return this.ibIndexPicker.contracts.filter((c) => {
      const snap = this.ibIndexPicker.snapshots.get(c.balanceContractId);
      return !snap || snap.availableBalance !== '0';
    });
  }

  /** Step 2 selection — sets selectedContract directly from the already-fetched row, no separate Search click needed. */
  onSelectIbIndex(contractId: string): void {
    this.selectedContract = this.ibIndexPicker.contracts.find((c) => c.balanceContractId === contractId) ?? null;
    this.searchError = null;
    if (this.selectedContract) {
      this.searchNaturalKey.ibNumber = this.selectedContract.naturalKey.ibNumber ?? '';
      this.searchNaturalKey.sgNumber = this.selectedContract.naturalKey.sgNumber ?? '';
    }
    // Business instruction 2026-08-16 ("A7/A9/B5 Currency = Carry from A1/B1 + Protected") — already
    // carried from Step 1's selectedParent (onSelectParent()) in the normal flow; re-asserted here too
    // so it's correct even if Step 2 is reached some other way. See carriedCurrency's own doc comment.
    if (this.carriedCurrency) {
      this.model.currency = this.carriedCurrency;
      this.rebuildFields();
    }
    this.refreshSelectedContractSnapshot();
    this.syncCheckerToContext();
  }

  get lcNumberFromParent(): boolean {
    return policy.lcNumberFromParent(this.model);
  }

  /** The state slice `contextLcNumber`/`contextSecondaryRef` resolve against — see function-policy.ts. */
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
   * The specific contract the Checker queue below lists PENDING movements
   * for — resolved via the Checker's OWN independent search
   * (searchCheckerLc()), never a direct read of the Maker's own
   * selectedContract/submitResult. See checkerLcNumber's own doc comment
   * for why this was deliberately decoupled 2026-08-15.
   */
  get checkerContractId(): string | null {
    return this.checkerContract?.balanceContractId ?? null;
  }

  get checkerSecondaryField(): 'ibNumber' | 'sgNumber' | null {
    return policy.checkerSecondaryField(this.selectedFunction);
  }

  get checkerSecondaryLabel(): string {
    return policy.checkerSecondaryLabel(this.selectedFunction);
  }

  /**
   * Mirrors checkerAct()'s own isCompoundOwnSubmission check (see its doc comment) — single source of
   * truth so the template's "Approve (acknowledgment only)" vs "Release" label/disabled-state can never
   * disagree with what a click will actually do (that exact drift was the 2026-08-15 bug: A3S's
   * compound release() was unreachable because deferSettlement was checked first).
   */
  get isCheckerCompoundOwnSubmission(): boolean {
    if (!this.selectedCheckerMovement) return false;
    // Bug fixed 2026-08-16 (reviewer-reported — "A1 -> A8 -> A3S -> A4, the related SG entries was
    // not shown"): A3S (documentArrivalWithSg) and B5 (settlesAcceptanceOnMature) route here based on
    // the picked item's OWN shape — movementType plus a real businessEventId — instead of requiring a
    // match against THIS session's own submitResult. Their linked leg (A3S's SG redemption, B5's
    // Reimbursement Receivable) is now resolved server-side via businessEventId
    // (checker-actions.service.ts's resolveLinkedMovementId) regardless of which browser session is
    // acting — the whole point of Maker/Checker 4-eyes separation. The businessEventId check is the
    // disambiguator for A3S specifically: a plain A3's own UTILIZE (no matched SG, submitted via
    // submitPlain()) never has one, so it correctly falls through to the existing deferSettlement/
    // acknowledgment-only path below instead of wrongly attempting (and failing) a compound release.
    if (this.selectedFunction?.documentArrivalWithSg) {
      return this.selectedCheckerMovement.movementType === 'UTILIZE' && !!this.selectedCheckerMovement.businessEventId;
    }
    if (this.selectedFunction?.settlesAcceptanceOnMature) {
      return (
        (this.selectedCheckerMovement.movementType === 'FULL_SETTLE' || this.selectedCheckerMovement.movementType === 'PARTIAL_SETTLE') &&
        !!this.selectedCheckerMovement.businessEventId
      );
    }
    // Bug fixed 2026-08-16 ("A6/B4 也修一下", extending the A3S/B5 fix above): A6/B4 (settlesDocumentArrival)
    // now ALSO route here based on the picked item's own shape — a real referencedTransactionId
    // (stamped on the primary movement at Submit time, pointing at the picked source Document Arrival/
    // Present Docs record — see CreateMovementRequest.referencedTransactionId's own doc comment) —
    // instead of requiring a submitResult match. Presence alone is a safe disambiguator:
    // referencedTransactionId is ONLY ever stamped by A6/B4's own settlesDocumentArrival-gated
    // buildSubmitRequest() path, never by B1/B2's plain ISSUE/AMEND, so a genuine ISSUE/AMEND item
    // picked while on B4's own tab is never mistaken for a compound one.
    if (this.selectedFunction?.settlesDocumentArrival) {
      return !!this.selectedCheckerMovement.referencedTransactionId;
    }
    // B4's own Sight/HONOUR (createsIssuingBankReceivableOnHonour) — UNCHANGED, still requires the
    // SAME session's own submitResult; kept for completeness even though, per the doc comment just
    // below, this branch is unreachable via any real function object today (settlesDocumentArrival,
    // unconditional on B4, always matches first).
    if (this.selectedCheckerMovement.movementId !== this.submitResult?.movementId) return false;
    // Business instruction 2026-08-15 ("B4 should index records from B3") — B3 now shares one function
    // across both HONOUR (its own real compound, createsIssuingBankReceivableOnHonour) and ACCEPT (a
    // DIFFERENT, deferSettlement-based acknowledgment-only path — see checkerAct()'s own doc comment).
    // Without this movementType check, reviewing a just-submitted ACCEPT record would ALSO match here
    // (createsIssuingBankReceivableOnHonour is set unconditionally on B3) and wrongly route it into
    // release()'s HONOUR-shaped compound instead of the acknowledgment-only path.
    if (this.selectedFunction?.createsIssuingBankReceivableOnHonour) {
      return this.selectedCheckerMovement.movementType === 'HONOUR';
    }
    return false;
  }

  /**
   * Business instruction 2026-08-15 ("按Submit, Release, Reject後 Button 直接灰掉 不要重複提交...
   * 二選一後兩個都灰掉") — single source of truth for "is a Checker action in flight right now",
   * for both Release and Reject's own [disabled] binding. checkerAct()'s plain (non-compound) path
   * only ever sets checkerBusy; the compound path (isCheckerCompoundOwnSubmission — A3S/A6/B3-HONOUR)
   * delegates to release()/reject(), which only set actionBusy. Before this getter, Release/Reject
   * were bound to checkerBusy alone, so a compound action left both buttons clickable during its own
   * async round-trip — this getter combines both flags so clicking either button immediately disables
   * both, for every function, compound or not.
   */
  get checkerActionInFlight(): boolean {
    return this.checkerBusy || this.actionBusy;
  }

  /**
   * Business instruction 2026-08-15 ("S001 B01 still in PENDING, which is incorrect. Issue -> SG ->
   * Document Arrival w SG -> Sight Settlement") — traced to the OPPOSITE of the earlier same-day bug:
   * releaseArrivalDocument() used to call the REAL release API on the Document Arrival, contradicting
   * A3S's own help text ("Document Arrival moves to Pending LC Balance, still not finalized — go to
   * A4/A6 next, same as a plain A3") and the whole point of A4/A6 existing as the actual finalization
   * step. True for the UTILIZE half of BOTH plain A3 (deferSettlement, standalone acknowledgment) and
   * A3S (documentArrivalWithSg, compound — the matched SG's own redemption DOES release for real, only
   * the Document Arrival itself stays PENDING/acknowledged).
   */
  get isArrivalAcknowledgmentStep(): boolean {
    return (
      !!this.selectedCheckerMovement &&
      this.selectedCheckerMovement.movementType === 'UTILIZE' &&
      !!(this.selectedFunction?.deferSettlement || this.selectedFunction?.documentArrivalWithSg)
    );
  }

  /** Drives the Checker Release/Approve button's label — kept as one getter so it can never drift from what checkerAct() actually does (see its own doc comment). */
  get checkerActionButtonLabel(): string {
    if (this.checkerBusy) return 'Working…';
    if (this.selectedFunction?.documentArrivalWithSg && this.isCheckerCompoundOwnSubmission) {
      return 'Release (Shipping Guarantee redemption)';
    }
    if (this.isArrivalAcknowledgmentStep) return 'Approve (acknowledgment only)';
    return 'Release';
  }

  /**
   * Business instruction 2026-08-15 ("there is no way to Approve pending.
   * Would it be possible to have separate option in Amendment function to
   * release those pending events? Same requirement for all other
   * functions.") — resolves checkerLcNumber via THIS function's own
   * instrumentType (selectedFunction.instrumentType, the static field —
   * available immediately on function selection, unlike model.instrumentType
   * which stays unset until a subChoice like A2's Direction is picked), so
   * a Checker can search and act on a PENDING item without ever touching
   * the Maker's own Direction/Parent-picker/natural-key flow. Independent
   * of loadCheckerQueue() below only in HOW the contract is found — once
   * found, the queue/release/reject mechanics are identical either way.
   *
   * Business-reported gap 2026-08-15 ("Check[er] function is not working for
   * Shipping Gtee (Issue)", repro'd with LC S001 / SG G01): this used to send
   * lcNumber alone, which 404'd on every SHGT/Acceptance lookup — an LC can
   * have multiple SG/IB records, so lcNumber alone doesn't identify one (same
   * reasoning already applied to searchExistingContract() above).
   */
  searchCheckerLc(): void {
    this.checkerSearchError = null;
    this.checkerContract = null;
    this.checkerItems = [];
    this.selectedCheckerMovement = null;
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
        this.checkerSearchError = this.describeApiError(err);
      },
    });
  }

  /**
   * Business instruction 2026-08-15 ("Look Up Current Balance should use
   * the existing LC Number on Screen... Once Maker Submit or Checker
   * display, it will just use the LC Number instead of keyin") — syncs the
   * Look Up panel from contextLcNumber and re-runs it, so a
   * Maker/Checker never has to separately retype an LC Number they already
   * picked/typed elsewhere on the same screen. Called after a Submit and
   * whenever the Checker queue is (re)displayed — not on every intermediate
   * contract pick while still browsing, to avoid firing lookups mid-search.
   * The guard stays here (not in `LookUpPanelService`) since both
   * `contextLcNumber` and `model.instrumentType` are Maker-side selection
   * concepts the panel deliberately doesn't own — see that class's own
   * `syncFrom()` doc comment.
   */
  private syncLookupToContext(): void {
    const lcNumber = this.contextLcNumber;
    if (!lcNumber || !this.model.instrumentType) return;
    this.lookUp.syncFrom(lcNumber, this.model.instrumentType);
  }

  /**
   * Convenience auto-fill for the Checker's OWN independent LC search
   * (business instruction 2026-08-15) — pre-fills checkerLcNumber from
   * whatever the Maker just picked/typed/submitted and runs the search,
   * purely so a Maker who just submitted doesn't have to retype the same
   * LC Number a second time. The field and searchCheckerLc() stay fully
   * usable on their own regardless — this is a default, not a binding.
   */
  private syncCheckerToContext(): void {
    const lcNumber = this.contextLcNumber;
    if (!lcNumber) return;
    this.checkerLcNumber = lcNumber;
    // Business-reported gap 2026-08-15: without this, the auto-search below always ran with a
    // blank SG/IB Number on SHGT/Acceptance functions and 404'd — see searchCheckerLc()'s own doc
    // comment.
    this.checkerSecondaryRef = this.contextSecondaryRef ?? '';
    this.searchCheckerLc();
  }

  /**
   * Business instruction 2026-08-15 ("Seperate Maker and Checker... allow
   * Check to release unrelease Pending events") — every PENDING movement
   * on checkerContractId, independent of submitResult. Re-run after any
   * action that could change what's PENDING on this contract (a Maker
   * Submit, or a Checker Release/Reject from this same queue).
   */
  loadCheckerQueue(): void {
    this.selectedCheckerMovement = null;
    this.checkerItems = [];
    this.checkerError = null;
    const contractId = this.checkerContractId;
    if (!contractId) return;
    this.checkerLoading = true;
    this.api.listMovements(contractId).subscribe({
      next: (list) => {
        this.checkerLoading = false;
        this.checkerItems = list.filter((m: any) => m.status === 'PENDING');
        this.syncLookupToContext();
      },
      error: () => {
        this.checkerLoading = false;
        this.checkerItems = [];
      },
    });
  }

  onSelectCheckerMovement(movementId: string): void {
    this.selectedCheckerMovement = this.checkerItems.find((m) => m.movementId === movementId) ?? null;
    // Clear any stale acknowledgment from a PREVIOUSLY selected queue item — see checkerAct()'s
    // deferSettlement branch below; this flag must be scoped to whichever item is selected right now.
    this.arrivalApproved = false;
  }

  /**
   * Release/Reject picked from the Checker queue.
   *
   * A3 (deferSettlement) is special: business instruction 2026-08-14 (revised Maker/Checker statement)
   * — "Checker: Release/approve the Document Arrival. No further LC Balance update." The Checker step
   * here must NEVER call the real release API on a UTILIZE movement, or A4/A6 would no longer find it
   * PENDING to actually finalize. Reusing the existing approveArrival() (acknowledgment-only, sets
   * arrivalApproved) instead of a real API call — Reject still calls the real reject API either way,
   * since declining a presentation is a genuine, correctness-critical action.
   *
   * Otherwise: when the picked item is EXACTLY what this same Maker session just submitted for a
   * compound function (A6's settlesDocumentArrival / A3S's documentArrivalWithSg), routes through the
   * existing, already-tested compound release()/reject() below so the "one click approves both linked
   * movements" convenience is preserved — otherwise this is a plain, independent single-movement action
   * (safe regardless of order: release()/reject() only ever check the target movement's OWN current
   * status, never a linked movement's).
   *
   * Bug fixed 2026-08-15 (reported live: "S001 B04 was settled, but the SG B04 still in Pending" —
   * A3S's own compound release() was NEVER reachable): isCompoundOwnSubmission must be checked BEFORE
   * the deferSettlement branch, not after — A3S sets BOTH deferSettlement (copied from plain A3) AND
   * documentArrivalWithSg, and its own picked item is always a UTILIZE, so the deferSettlement check
   * always matched first and silently no-op'd (approveArrival() only sets a client-side flag, no API
   * call) instead of ever reaching release()'s SG-then-Document-Arrival compound logic below. Plain A3
   * (no documentArrivalWithSg/settlesDocumentArrival) is unaffected — isCompoundOwnSubmission is always
   * false for it, so it still falls through to the deferSettlement branch exactly as before.
   */
  checkerAct(action: 'release' | 'reject'): void {
    if (!this.selectedCheckerMovement) return;
    const movementId = this.selectedCheckerMovement.movementId;

    if (this.isCheckerCompoundOwnSubmission) {
      if (action === 'release') this.release();
      else this.reject();
      return;
    }

    // Business instruction 2026-08-15 ("B4 should index records from B3") — deferSettlementMovementType
    // lets B3's Usance/ACCEPT branch reuse this same acknowledgment-only path (defaults to 'UTILIZE'
    // when unset, so A3 is unchanged).
    if (
      action === 'release' &&
      this.selectedFunction?.deferSettlement &&
      this.selectedCheckerMovement.movementType === (this.selectedFunction?.deferSettlementMovementType ?? 'UTILIZE')
    ) {
      this.approveArrival();
      return;
    }

    // Business instruction 2026-08-16 ("Add real Maker Submit, then have Checker to Release it.
    // Exactly the same as A1.") — A4 only. Its own target UTILIZE is a PRE-EXISTING record (A3/A3S's
    // own earmark, already earning its Account Entries at that earlier stage — see A3's own submit()
    // flow), so nothing else stops a Checker from finding and releasing it before any Maker has
    // actually used A4's own new Submit button (submitA4()). makerSubmittedAt is the real,
    // backend-persisted gate that closes that gap — visible to any independent Checker session, not
    // just a same-session flag. Server-side release() deliberately does NOT enforce this itself (see
    // service.submitByMaker()'s own doc comment for why) — this client-side check is the real gate.
    if (action === 'release' && this.selectedFunction?.payExistingUtilize && !this.selectedCheckerMovement.makerSubmittedAt) {
      this.checkerError = 'This Document Arrival has not been Submitted by a Maker yet (A4) — go to the Maker section above, pick it, and Submit first.';
      return;
    }

    this.checkerBusy = true;
    this.checkerError = null;
    const obs = action === 'release' ? this.api.release(movementId, this.checkerId) : this.api.reject(movementId, this.checkerId, 'MANUAL_QUEUE_REJECT');
    obs.subscribe({
      next: () => {
        this.checkerBusy = false;
        this.refreshSelectedContractSnapshot();
        this.syncCheckerToContext();
      },
      error: (err) => {
        this.checkerBusy = false;
        this.checkerError = this.describeApiError(err);
      },
    });
  }

  /**
   * BAL-003 (God Component, 2026-08-17) — the 131-line Formly config body moved verbatim into
   * `buildFields()` (builder-fields.ts) as a pure function. It never mutated anything but
   * `this.fields`, so all that is left here is assembling the context and assigning the result;
   * same "guard/params unchanged, only the body moves" convention as `loadPagedCatalog`,
   * `finishCheckerAction`, and `loadSnapshotAndMovements` before it.
   */
  private rebuildFields(): void {
    this.fields = buildFields({
      model: this.model,
      selectedFunction: this.selectedFunction,
      selectedPayMovement: this.selectedPayMovement,
      selectedContract: this.selectedContract,
      selectedContractSnapshot: this.selectedContractSnapshot,
      selectedParent: this.selectedParent,
      dynamicSecondaryRefLabel: this.dynamicSecondaryRefLabel,
    });
  }

  /**
   * BAL-003 (God Component, 2026-08-17) — validateSubmit()/buildSubmitRequest()'s own bodies moved
   * into `submit-rules.ts` as pure functions.
   *
   * This reverses the reasoning the previous doc comment here gave for keeping them ("they read/write
   * `model`/`naturalKey`/`selectedParent`/`selectedContractSnapshot`/etc. so pervasively — including
   * in-place derivations like `model.movementType`/`model.tenorDays` — that a service extraction
   * would only relocate that coupling"). That argument holds against a SERVICE extraction, which
   * would need mutable component state handed to it and written back. It does not hold against a
   * PURE FUNCTION: the reads become one explicit context parameter, and the two in-place derivations
   * become an explicit returned `patch` applied here — the coupling is made visible, then removed.
   *
   * The `patch` is applied REGARDLESS of `error`, deliberately: in the old inline version a mutation
   * made by an early guard survived a later guard's own failure return, and that is observable.
   */
  private validateSubmit(): boolean {
    const { error, patch } = validateSubmitRules(this.submitRulesContext);
    Object.assign(this.model, patch);
    if (error) {
      this.submitError = error;
      return false;
    }
    return true;
  }

  /** The state slice the two pure Maker-submit rule functions read — see submit-rules.ts. */
  private get submitRulesContext(): SubmitRulesContext {
    return {
      model: this.model,
      naturalKey: this.naturalKey,
      selectedFunction: this.selectedFunction,
      dynamicSecondaryRefLabel: this.dynamicSecondaryRefLabel,
      activeFunctionSide: this.activeFunctionSide,
      selectedPayMovement: this.selectedPayMovement,
      selectedArrivalSg: this.selectedArrivalSg,
      arrivalSgSnapshot: this.arrivalSgSnapshot,
      selectedContractSnapshot: this.selectedContractSnapshot,
      selectedContract: this.selectedContract,
      selectedParent: this.selectedParent,
      exposureNature: this.exposureNature,
    };
  }

  /** BAL-003 — thin wrapper over `buildSubmitRequest()` (submit-rules.ts); surfaces its one "no contract picked" error the same way the inline version did. */
  private buildSubmitRequest(): CreateMovementRequest | null {
    const { request, error } = buildSubmitRequestRules(this.submitRulesContext);
    if (error) this.submitError = error;
    return request;
  }

  /**
   * BAL-003 (6th same-day OOD/SOLID pass, "Maker Submit service") — the four compound submission
   * shapes and the dispatch `if` chain that used to decide between them now live in
   * `MakerSubmitService.submit()`; this method just builds the narrow `MakerSubmitContext` it needs.
   * Mirrors `buildCheckerActionContext()`'s own shape exactly.
   */
  private buildMakerSubmitContext(): MakerSubmitContext {
    return {
      model: this.model,
      naturalKey: this.naturalKey,
      selectedFunction: this.selectedFunction,
      selectedContract: this.selectedContract,
      selectedArrivalSg: this.selectedArrivalSg,
      arrivalSgSnapshot: this.arrivalSgSnapshot,
    };
  }

  /**
   * The one place `MakerSubmitService`'s outcomes turn back into component state/side effects —
   * mirrors `applyCheckerActionOutcome()` exactly. `outcome.secondary`'s fields are only ever present
   * when that specific flow actually resolved them (a secondary/tertiary leg succeeding before a LATER
   * leg failed still needs its own id recorded) — `undefined` means "leave this field alone", never
   * "clear it", which is why each is applied with its own explicit presence check rather than a blanket
   * object spread.
   */
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
      // Earmark takes effect immediately at PENDING, before Release (Design doc §6) —
      // refresh right away so the panel shows the drop, not just after Release.
      this.refreshSelectedContractSnapshot();
      this.syncCheckerToContext();
      this.syncLookupToContext();
      return;
    }
    this.submitError = outcome.message;
    if ('result' in outcome && outcome.result !== undefined) this.submitResult = outcome.result;
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
   * A3 (Document Arrival (Sight)) Checker action — business instruction
   * 2026-08-14 (revised Maker/Checker statement): "Checker: Release/approve
   * the Document Arrival. No further LC Balance update." Deliberately does
   * NOT call the release API — the movement stays PENDING server-side, so
   * A4 (Sight Settlement) can still find and pay it. This only records a
   * local UI acknowledgment; it never claims the backend status changed.
   *
   * B3 is the one exception (business instruction 2026-08-15, "Present Docs
   * Earmark (Pending/Approved)" needs a real Pending-vs-Approved split that
   * survives reload and is visible across Checker sessions) —
   * deferSettlementRequiresBackendAck routes it through the real
   * acknowledge() API instead, which still never touches status (movement
   * stays PENDING for B4 to find), only acknowledgedBy/acknowledgedAt.
   */
  approveArrival(): void {
    if (this.selectedFunction?.deferSettlementRequiresBackendAck && this.selectedCheckerMovement) {
      this.checkerBusy = true;
      this.checkerError = null;
      this.api.acknowledge(this.selectedCheckerMovement.movementId, this.checkerId).subscribe({
        next: () => {
          this.checkerBusy = false;
          this.arrivalApproved = true;
          this.refreshSelectedContractSnapshot();
          this.syncCheckerToContext();
        },
        error: (err) => {
          this.checkerBusy = false;
          this.checkerError = this.describeApiError(err);
        },
      });
      return;
    }
    this.arrivalApproved = true;
  }

  /**
   * Quality-report-balance.md BAL-003 (third of three planned extractions, previously deferred as
   * "the highest-risk, money-moving ~800+ lines... isn't a safe same-behavior consolidation the way
   * [the first two] are" — re-scoped, not attempted whole: rather than moving this compound
   * release/reject/cancel chain's business logic into a separate service (which would need to pass
   * ~10 pieces of component state back and forth for no real benefit), this consolidates only the
   * mechanical success-tail shape every leg of the chain already shared byte-for-byte —
   * `actionBusy=false; submitResult=res; refreshSelectedContractSnapshot(); syncCheckerToContext();`,
   * plus two call sites' worth of optional follow-up (`syncLookupToContext()`/
   * `reloadPayableMovementsAfterCompound()`) — same "guard/branch logic unchanged, only the repeated
   * body moves" convention as `loadPagedCatalog`/`loadSnapshotAndMovements` above. WHICH release/
   * reject/cancel call to make, in what order, and under what business condition is completely
   * untouched by this helper — every `if` branch below still decides that for itself.
   */
  private finishCheckerAction(res: any, opts: { syncLookup?: boolean; reloadPayables?: boolean } = {}): void {
    this.actionBusy = false;
    this.submitResult = res;
    this.refreshSelectedContractSnapshot();
    this.syncCheckerToContext();
    if (opts.syncLookup) this.syncLookupToContext();
    if (opts.reloadPayables) this.reloadPayableMovementsAfterCompound();
  }

  /** BAL-003 — the release/reject/cancel chain's other shared shape: every failed leg sets `actionBusy` false and surfaces its own (always distinct, business-context-specific) message via `submitError`. The message itself is still composed at each call site — only the two-field assignment is shared. */
  private failCheckerAction(message: string): void {
    this.actionBusy = false;
    this.submitError = message;
  }

  /**
   * BAL-003 (Checker Actions extraction, OOD/SOLID) — the compound orchestration this used to own
   * directly now lives in `CheckerActionsService.release()` (Dependency Inversion: the service depends
   * on `CheckerActionContext`, never on this component). This wrapper keeps exactly the same guard and
   * the same `actionBusy`/`submitError` reset the original had, then hands off.
   */
  release(): void {
    if (!this.submitResult?.movementId) return;
    this.actionBusy = true;
    this.submitError = null;
    this.checkerActions.release(this.buildCheckerActionContext()).subscribe((outcome) => this.applyCheckerActionOutcome(outcome));
  }

  private buildCheckerActionContext(): CheckerActionContext {
    return {
      submitResult: this.submitResult,
      selectedFunction: this.selectedFunction,
      selectedPayMovement: this.selectedPayMovement,
      matchedReceivableMovementId: this.matchedReceivableMovementId,
      dueFromIssuingBankMovementId: this.dueFromIssuingBankMovementId,
      acceptanceMovementId: this.acceptanceMovementId,
      acceptanceReimbReceivableMovementId: this.acceptanceReimbReceivableMovementId,
      arrivalSgRedeemMovementId: this.arrivalSgRedeemMovementId,
      createdBy: this.model.createdBy,
      selectedCheckerMovement: this.selectedCheckerMovement,
    };
  }

  /**
   * The one place `CheckerActionsService`'s outcomes turn back into component state/side effects —
   * mirrors `finishCheckerAction`/`failCheckerAction` exactly, plus the old `releaseArrivalDocument()`'s
   * own acknowledgment-only shape for A3S's `documentArrivalAcknowledged` outcome.
   */
  private applyCheckerActionOutcome(outcome: CheckerActionOutcome): void {
    if (outcome.kind === 'failed') {
      this.failCheckerAction(outcome.message);
      return;
    }
    if (outcome.kind === 'documentArrivalAcknowledged') {
      this.actionBusy = false;
      this.arrivalApproved = true;
      this.refreshSelectedContractSnapshot();
      this.syncCheckerToContext();
      // The picked SG's own snapshot is stale otherwise until the user navigates away and back.
      this.loadSgsForArrival();
      return;
    }
    this.finishCheckerAction(outcome.result, { syncLookup: outcome.syncLookup, reloadPayables: outcome.reloadPayables });
  }

  /** Business instruction 2026-08-15 ("Confirm LC Balance 控制" table review) — refreshes whichever picker (A6's Parent LC, B4's flat Catalog) is actually in play, since B4 no longer has a "parent" of its own (its primary instrumentType is EPLC_CONFIRMATION). */
  private reloadPayableMovementsAfterCompound(): void {
    if (this.selectedParent) this.loadPayableMovements(this.selectedParent.balanceContractId);
    else if (this.selectedContract) this.loadPayableMovements(this.selectedContract.balanceContractId);
  }

  /** BAL-003 (Checker Actions extraction) — orchestration moved to `CheckerActionsService.reject()`; unlike `release()`/`deleteMakerPending()`, the original never reset `submitError` here — preserved exactly. */
  reject(): void {
    if (!this.submitResult?.movementId) return;
    this.actionBusy = true;
    this.checkerActions.reject(this.buildCheckerActionContext()).subscribe((outcome) => this.applyCheckerActionOutcome(outcome));
  }

  /**
   * Business instruction 2026-08-15 ("need a option for Maker to Delete Pending (i.e. EC) to ensure
   * the DB design is working properly. for all functions") — Maker-initiated withdrawal of their own
   * just-submitted item while it's still PENDING, via the /cancel endpoint (PENDING -> CANCELLED,
   * distinct from /reject's Checker-side decline). Works uniformly across every function since it only
   * reads submitResult/model.createdBy, both already set generically by submit() — no function-specific
   * wiring needed. BAL-003 (Checker Actions extraction) — the cancel-order branching itself moved to
   * `CheckerActionsService.deleteMakerPending()`; this wrapper keeps the same guard and busy/error reset.
   */
  deleteMakerPending(): void {
    if (!this.submitResult?.movementId || this.submitResult.status !== 'PENDING') return;
    this.actionBusy = true;
    this.submitError = null;
    this.checkerActions.deleteMakerPending(this.buildCheckerActionContext()).subscribe((outcome) => this.applyCheckerActionOutcome(outcome));
  }
}
