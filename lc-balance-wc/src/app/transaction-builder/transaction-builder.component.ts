import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot, CreateMovementRequest } from './balance-component-api.service';
import { IndexPickerComponent } from './index-picker.component';
import { PagedListState } from './paged-list-state';
import { CheckerActionContext, CheckerActionOutcome, CheckerActionsService } from './checker-actions.service';
import { describeApiError as describeApiErrorShared } from './api-error';
import {
  CREATING_MOVEMENT_TYPES,
  DECREASING_MOVEMENT_TYPES,
  EXPORT_FUNCTIONS,
  HAS_PARENT,
  IMPORT_FUNCTIONS,
  InstrumentType,
  NATURAL_KEY_FIELDS_BY_INSTRUMENT,
  PARENT_INSTRUMENT_OPTIONS,
  TransactionFunction,
  amountExceedsCurrencyDecimals,
  decimalPlacesForCurrency,
  isToleranceApplicable,
} from './balance-component.model';

interface BuilderModel {
  instrumentType?: InstrumentType;
  movementType?: string;
  amount?: string;
  currency?: string;
  tolerancePct?: string;
  eventSeq?: number;
  createdBy?: string;
  /** Business instruction 2026-08-14 — generic secondary reference (Amendment No./IB Number/…), required on every function except LC Issue (A1/B1). Sent as sourceTransactionRef. */
  secondaryRef?: string;
  /** Design doc §7 Tenor Type Routing (v0.7) — mandatory on Acceptance (A6/B4). */
  tenorType?: 'SIGHT' | 'SELLERS_USANCE' | 'BUYERS_USANCE';
  tenorDays?: number;
}

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
  catalogContracts: BalanceContract[] = [];
  readonly catalogPageSize = 10;
  /** Business instruction 2026-08-14 "Page by Page設計". BAL-003 (OOD/SOLID): state/boundary-math now owned by PagedListState — see catalogPage/catalogTotal/catalogTotalPages accessors below. */
  private readonly catalogPaging = new PagedListState(this.catalogPageSize);
  get catalogPage(): number {
    return this.catalogPaging.page;
  }
  set catalogPage(page: number) {
    this.catalogPaging.page = page;
  }
  get catalogTotal(): number {
    return this.catalogPaging.total;
  }
  set catalogTotal(total: number) {
    this.catalogPaging.total = total;
  }
  /**
   * Business-reported gap 2026-08-14 ("Why the U003 does not allow for
   * Amendment?" — it did; it was just on page 2 of 2, alphabetically after
   * "900"/"S001", invisible without clicking Next). Substring search
   * against lc_number (backend's existing `q` LIKE filter), resets to
   * page 1 so a specific LC doesn't require paging through the whole
   * alphabetically-ordered list to find.
   */
  catalogSearch = '';
  /** Business instruction 2026-08-14: snapshot per catalog entry, so the picker itself can filter out 0-balance contracts instead of only failing after submission. */
  catalogSnapshots = new Map<string, BalanceSnapshot>();
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
  ibIndexCatalog: BalanceContract[] = [];
  readonly ibIndexPageSize = 10;
  /** BAL-003 (OOD/SOLID): state/boundary-math now owned by PagedListState — see ibIndexPage/ibIndexTotal/ibIndexTotalPages accessors below. */
  private readonly ibIndexPaging = new PagedListState(this.ibIndexPageSize);
  get ibIndexPage(): number {
    return this.ibIndexPaging.page;
  }
  set ibIndexPage(page: number) {
    this.ibIndexPaging.page = page;
  }
  get ibIndexTotal(): number {
    return this.ibIndexPaging.total;
  }
  set ibIndexTotal(total: number) {
    this.ibIndexPaging.total = total;
  }
  ibIndexSnapshots = new Map<string, BalanceSnapshot>();

  /**
   * Business instruction 2026-08-16 ("B6 要有類似B5[B4]的LC Index — Existing Contract & EB Index —
   * Existing Contract (from B3) 選擇 those EB records with Acceptance Balance") — B5's own "EB Index"
   * Step 2, once its Parent LC (Step 1) is picked. Unlike ibIndexCatalog above (single instrumentType,
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
  parentCatalog: BalanceContract[] = [];
  readonly parentPageSize = 10;
  /** Business instruction 2026-08-14 "Page by Page設計". BAL-003 (OOD/SOLID): state/boundary-math now owned by PagedListState — see parentPage/parentTotal/parentTotalPages accessors below. */
  private readonly parentPaging = new PagedListState(this.parentPageSize);
  get parentPage(): number {
    return this.parentPaging.page;
  }
  set parentPage(page: number) {
    this.parentPaging.page = page;
  }
  get parentTotal(): number {
    return this.parentPaging.total;
  }
  set parentTotal(total: number) {
    this.parentPaging.total = total;
  }
  /** Business-reported gap 2026-08-14 ("Why the U002, IB02 does not shown in A6?") — same fix as the flat Catalog picker's catalogSearch. */
  parentSearch = '';
  /** Business instruction 2026-08-14: snapshot per parent candidate, combined with tenorType in filteredParentCatalog() below. */
  parentSnapshots = new Map<string, BalanceSnapshot>();
  selectedParent: BalanceContract | null = null;
  exposureNature: 'ACTUAL' | 'MEMO' = 'ACTUAL';

  submitting = false;
  submitResult: any = null;
  submitError: string | null = null;
  actionBusy = false;
  /** A3 (Document Arrival (Sight)) only — set by approveArrival(), a Checker acknowledgment that does NOT call the backend release API. */
  arrivalApproved = false;

  lookup = { instrumentType: 'IPLC_LC' as InstrumentType, lcNumber: '', ibNumber: '', sgNumber: '' };
  lookupResult: { contract: BalanceContract; snapshot: BalanceSnapshot } | null = null;
  lookupError: string | null = null;

  /** Event timeline (business instruction 2026-08-14) — populated alongside lookupResult, in eventSeq (time) order. */
  lookupMovements: BalanceMovement[] = [];

  /**
   * Business instruction 2026-08-14 ("`Look Up Current Balance` should be
   * two tabs for Usance LC, one for LC Balance and one for Acceptance
   * Balance"): when the looked-up contract is an IPLC_LC/EPLC_CONFIRMATION declared
   * Usance, a second tab lists every IPLC_ACCEPTANCE/EPLC_ACCEPTANCE
   * carved out under it (one per IB Number, per A6) and lets the user pick
   * which one's own balance/timeline to view — a Usance LC's own Balance
   * and its Acceptance's Balance are genuinely separate ledgers (Design
   * doc §7), so "the balance" is ambiguous without picking which one.
   */
  lookupTab: 'LC' | 'ACCEPTANCE' | 'SG' = 'LC';
  acceptancesUnderLookup: BalanceContract[] = [];
  selectedLookupAcceptance: BalanceContract | null = null;
  acceptanceSnapshot: BalanceSnapshot | null = null;
  acceptanceMovements: BalanceMovement[] = [];

  /**
   * Business instruction 2026-08-14 ("two tabs for Sight LC i.e. LC
   * Balance SG Balance, for Usance LC... three tabs, LC Balance,
   * Acceptance Balance, and SG Balance") — SG applies to a Sight OR
   * Usance IPLC_LC alike (unlike Acceptance, which is Usance-only, Design
   * doc §7), so this tab shows for any IPLC_LC lookup regardless of
   * tenor. EPLC_LC has no SHGT equivalent (PARENT_INSTRUMENT_OPTIONS.SHGT
   * = ['IPLC_LC'] only), so this stays Import-only.
   */
  sgsUnderLookup: BalanceContract[] = [];
  selectedLookupSg: BalanceContract | null = null;
  sgSnapshot: BalanceSnapshot | null = null;
  sgMovements: BalanceMovement[] = [];

  /**
   * BAL-003 (Checker Actions extraction): `checkerActions` defaults to a fresh
   * `CheckerActionsService` bound to the same `api` — preserves every existing `new
   * TransactionBuilderComponent(mockApi)` test call site (70+ across 4 spec files) unmodified. Angular's
   * own DI container always resolves BOTH constructor parameters when it constructs this component for
   * real (default parameter values are never consulted by Angular's DI), so production wiring gets the
   * real injected singleton exactly as if this were a normal required dependency.
   */
  constructor(
    private readonly api: BalanceComponentApiService,
    private readonly checkerActions: CheckerActionsService = new CheckerActionsService(api),
  ) {}

  get isCreatingMovement(): boolean {
    return !!this.model.movementType && CREATING_MOVEMENT_TYPES.has(this.model.movementType);
  }

  get requiredNaturalKeyFields(): ('ibNumber' | 'sgNumber')[] {
    return this.model.instrumentType ? NATURAL_KEY_FIELDS_BY_INSTRUMENT[this.model.instrumentType] : [];
  }

  /** IPLC_ACCEPTANCE uses Import Bill terminology (IB); EPLC_ACCEPTANCE uses Export Bill terminology (EB) — same underlying `ibNumber` field, different real-world label. */
  get ibNumberLabel(): string {
    // Business instruction 2026-08-15 ("Confirm LC Balance 控制" table review) — generalized from
    // checking EPLC_ACCEPTANCE specifically to activeFunctionSide, since B3 (EPLC_EXAMINATION) and
    // B4's own EPLC_DUE_FROM_ISSUING_BANK/EPLC_ACCEPTANCE_REIMB_RECEIVABLE asset creation both need
    // "EB Number" too — every Export instrumentType uses EB terminology, not just EPLC_ACCEPTANCE.
    return this.activeFunctionSide === 'EXPORT' ? 'EB Number' : 'IB Number';
  }

  get hasParent(): boolean {
    return !!this.model.instrumentType && HAS_PARENT.has(this.model.instrumentType);
  }

  get parentOptions(): InstrumentType[] {
    return this.model.instrumentType ? PARENT_INSTRUMENT_OPTIONS[this.model.instrumentType] : [];
  }

  /** Business instruction 2026-08-14 ("two/three tabs...") — whichever tab is active supplies the Event Timeline table. */
  get activeLookupMovements(): any[] {
    if (this.lookupTab === 'ACCEPTANCE') return this.acceptanceMovements;
    if (this.lookupTab === 'SG') return this.sgMovements;
    return this.lookupMovements;
  }

  /** Business instruction 2026-08-14 ("don't show the JSON, start with Event Timeline") — whichever tab is active supplies the live Current Balance summary shown after the Event Timeline, replacing the old raw `| json` dump. */
  get activeLookupSnapshot(): BalanceSnapshot | null {
    if (this.lookupTab === 'ACCEPTANCE') return this.acceptanceSnapshot;
    if (this.lookupTab === 'SG') return this.sgSnapshot;
    return this.lookupResult?.snapshot ?? null;
  }

  get activeLookupContract(): BalanceContract | null {
    if (this.lookupTab === 'ACCEPTANCE') return this.selectedLookupAcceptance;
    if (this.lookupTab === 'SG') return this.selectedLookupSg;
    return this.lookupResult?.contract ?? null;
  }

  /**
   * Business instruction 2026-08-14 ("always use the LC Number if exists") —
   * the LC Number is the one natural-key field every instrumentType always
   * carries (Design doc §3.1's natural key table), so it's always the
   * primary label, never a UUID. Suffixed with IB#/SG# only when the active
   * tab is drilled into that specific Acceptance/SG.
   */
  get activeLookupLabel(): string {
    const lcNumber = this.lookupResult?.contract.naturalKey.lcNumber ?? this.lookup.lcNumber;
    if (this.lookupTab === 'ACCEPTANCE') {
      const ibNumber = this.selectedLookupAcceptance?.naturalKey.ibNumber;
      return ibNumber ? `LC ${lcNumber} / IB ${ibNumber}` : `LC ${lcNumber}`;
    }
    if (this.lookupTab === 'SG') {
      const sgNumber = this.selectedLookupSg?.naturalKey.sgNumber;
      return sgNumber ? `LC ${lcNumber} / SG ${sgNumber}` : `LC ${lcNumber}`;
    }
    return `LC ${lcNumber}`;
  }

  /** A Sight LC never has an Acceptance (Design doc §7 Tenor Type Routing) — that tab is only meaningful for Usance. */
  get lookupIsUsanceLc(): boolean {
    const contract = this.lookupResult?.contract;
    // Business instruction 2026-08-15: EPLC_LC (Unconfirmed) replaced by EPLC_CONFIRMATION as the
    // Export lookup root — B4's Acceptance now always parents off EPLC_CONFIRMATION.
    if (!contract || (contract.instrumentType !== 'IPLC_LC' && contract.instrumentType !== 'EPLC_CONFIRMATION')) return false;
    return !!contract.tenorType && contract.tenorType !== 'SIGHT';
  }

  /** SG applies to any IPLC_LC regardless of tenor (unlike Acceptance) — Import only, PARENT_INSTRUMENT_OPTIONS.SHGT has no EPLC_LC option. */
  get lookupHasSg(): boolean {
    return this.lookupResult?.contract.instrumentType === 'IPLC_LC';
  }

  private acceptanceInstrumentTypeFor(lcInstrumentType: InstrumentType): InstrumentType | null {
    if (lcInstrumentType === 'IPLC_LC') return 'IPLC_ACCEPTANCE';
    // Business instruction 2026-08-15: EPLC_ACCEPTANCE's parent is now EPLC_CONFIRMATION, not EPLC_LC.
    if (lcInstrumentType === 'EPLC_CONFIRMATION') return 'EPLC_ACCEPTANCE';
    return null;
  }

  /** Business instruction 2026-08-14 — LC+IB / LC+SG two-field search replaces the flat Catalog dropdown for these instrumentTypes. */
  get usesTwoFieldSearch(): boolean {
    return !this.isCreatingMovement && this.requiredNaturalKeyFields.length > 0;
  }

  get toleranceApplicable(): boolean {
    return !!this.model.instrumentType && !!this.model.movementType && isToleranceApplicable(this.model.instrumentType, this.model.movementType);
  }

  /** True once the typed Amount has more decimal places than the typed Currency allows (e.g. "10000.5 JPY") — mirrors the same check submit() blocks on. */
  get amountDecimalMismatch(): boolean {
    return amountExceedsCurrencyDecimals(this.model.amount, this.model.currency);
  }

  get currencyDecimalPlaces(): number {
    return decimalPlacesForCurrency(this.model.currency);
  }

  /** True once the function is fully resolved (no pending subChoice) and ready to show the rest of the form. */
  get ready(): boolean {
    return !!this.selectedFunction && !!this.model.instrumentType && !!this.model.movementType;
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
    this.lookup.instrumentType = side === 'IMPORT' ? 'IPLC_LC' : 'EPLC_CONFIRMATION';
    // Business instruction 2026-08-15 ("Export LC LC No, EB No 沒有 SG No") — SG# is Import-only
    // (no Shipping Guarantee equivalent on the Export side); clear any stale value from the Import
    // side rather than silently carrying it into an Export lookup call.
    if (side === 'EXPORT') this.lookup.sgNumber = '';
  }

  selectFunction(fn: TransactionFunction): void {
    this.selectedFunction = fn;
    this.activeFunctionSide = fn.side;
    this.lookup.instrumentType = fn.side === 'IMPORT' ? 'IPLC_LC' : 'EPLC_CONFIRMATION';
    if (fn.side === 'EXPORT') this.lookup.sgNumber = '';
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
    this.parentCatalog = [];
    this.parentPaging.reset();
    this.parentSearch = '';
    this.catalogPaging.reset();
    this.catalogSearch = '';
    this.ibIndexCatalog = [];
    this.ibIndexPaging.reset();
    this.settleableBalances = [];
    this.settleableBalancesLoading = false;
    this.payableMovements = [];
    this.payableMovementSearch = '';
    this.selectedPayMovement = null;
    this.arrivalApproved = false;
    this.submitResult = null;
    this.submitError = null;
    this.sgsForArrival = [];
    this.selectedArrivalSg = null;
    this.arrivalSgSnapshot = null;
    this.arrivalSgRedeemMovementId = null;
    this.dueFromIssuingBankMovementId = null;
    this.acceptanceReimbReceivableMovementId = null;
    this.acceptanceMovementId = null;
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

  /** Business instruction 2026-08-14: fetch each candidate's live balance so filteredCatalogContracts()/filteredParentCatalog() can exclude 0-balance ones — never lets a picker offer a target an action would immediately fail against. */
  private loadSnapshotsInto(list: BalanceContract[], target: Map<string, BalanceSnapshot>): void {
    target.clear();
    if (!list.length) return;
    forkJoin(list.map((c) => this.api.getSnapshot(c.balanceContractId).pipe(catchError(() => of(null))))).subscribe((snapshots) => {
      list.forEach((c, i) => {
        const snap = snapshots[i];
        if (snap) target.set(c.balanceContractId, snap);
      });
    });
  }

  /**
   * Quality-report-balance.md BAL-003 (first of three planned extractions — see that report's
   * "one real extraction now" scope note): shared body behind the Catalog/Parent LC/IB Index pickers'
   * three near-identical "call catalog(), populate items+total(+snapshots), clear both on any failure"
   * state machines. Each picker's own public page/total/pageSize fields, `prevPage()`/`nextPage()`, and
   * `*TotalPages` getter are all UNCHANGED below — this only consolidates the internal fetch/populate
   * logic, since the `.html` template (not covered by this project's Jest config) binds directly to
   * those public names and must not need to change. Each picker's own DIFFERENT guard condition (e.g.
   * Catalog also blocks on `isCreatingMovement`, IB Index also requires a picked LC Number) is still
   * evaluated by that picker's own thin wrapper below, not hidden in here — only the fetch/populate
   * shape that was byte-for-byte identical three times over is shared.
   */
  private loadPagedCatalog(args: {
    guardFails: boolean;
    instrumentType: InstrumentType;
    search?: string;
    page: number;
    pageSize: number;
    lcNumber?: string;
    tenorFamily?: 'SIGHT' | 'USANCE';
    setPage: (page: number) => void;
    setContracts: (items: BalanceContract[]) => void;
    setTotal: (total: number) => void;
    snapshots?: Map<string, BalanceSnapshot>;
    onSuccess?: (items: BalanceContract[]) => void;
  }): void {
    args.setPage(args.page);
    if (args.guardFails) {
      args.setContracts([]);
      args.setTotal(0);
      return;
    }
    this.api.catalog(args.instrumentType, 'ACTIVE', args.search || undefined, args.page, args.pageSize, args.lcNumber, args.tenorFamily).subscribe({
      next: (result) => {
        args.setContracts(result.items);
        args.setTotal(result.total);
        if (args.snapshots) this.loadSnapshotsInto(result.items, args.snapshots);
        args.onSuccess?.(result.items);
      },
      error: () => {
        args.setContracts([]);
        args.setTotal(0);
      },
    });
  }

  /** Business instruction 2026-08-14 "pickup 時 Order by Reference 而且需要 Page by Page設計" — page defaults to 1 (a fresh search), pass an explicit page to page through an already-loaded list. */
  reloadCatalog(page = 1): void {
    this.loadPagedCatalog({
      guardFails: !this.model.instrumentType || this.isCreatingMovement,
      instrumentType: this.model.instrumentType!,
      search: this.catalogSearch,
      page,
      pageSize: this.catalogPageSize,
      tenorFamily: this.selectedFunction?.catalogTenorFilter,
      setPage: (p) => (this.catalogPage = p),
      setContracts: (items) => (this.catalogContracts = items),
      setTotal: (total) => (this.catalogTotal = total),
      snapshots: this.catalogSnapshots,
      onSuccess: (items) => {
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
    this.selectedContract = this.catalogContracts.find((c) => c.balanceContractId === contractId) ?? null;
    this.refreshSelectedContractSnapshot();
    this.payableMovements = this.catalogPayableMovements.get(contractId) ?? [];
    this.payableMovementsLoading = false;
    this.onSelectPayMovement(movementId);
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

  get catalogTotalPages(): number {
    return this.catalogPaging.totalPages;
  }

  catalogPrevPage(): void {
    const page = this.catalogPaging.prevTarget();
    if (page !== null) this.reloadCatalog(page);
  }

  catalogNextPage(): void {
    const page = this.catalogPaging.nextTarget();
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
    let list = this.catalogContracts;
    const tenorFilter = this.selectedFunction?.catalogTenorFilter;
    if (tenorFilter) {
      list = list.filter((c) => !c.tenorType || (tenorFilter === 'SIGHT' ? c.tenorType === 'SIGHT' : c.tenorType !== 'SIGHT'));
    }
    if (this.selectedFunction?.payExistingUtilize) return list;
    if (!this.model.movementType || !DECREASING_MOVEMENT_TYPES.has(this.model.movementType)) return list;
    return list.filter((c) => {
      const snap = this.catalogSnapshots.get(c.balanceContractId);
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
   * current parent selection. See `loadPagedCatalog`'s own doc comment (BAL-003) for why this is now
   * a thin wrapper — the guard condition and every parameter below are unchanged from before the
   * extraction, only the fetch/populate/error body moved into the shared helper.
   *
   * Business-reported gap 2026-08-14 ("Why the U002, IB02 does not shown in A6?", "A7 should filter out LC
   * records Tenor = Sight") — same class of bug as A5's flat Catalog picker: filtering client-side AFTER
   * server pagination let a page of raw rows contain almost none of the eligible (Usance) tenor. A6/B4
   * (tenorTypeOptions set) and A7/B5 (catalogTenorFilter — an Acceptance never exists under a Sight LC) both
   * filter server-side; A8's SHGT parent (neither) stays unfiltered, same as before.
   */
  private loadParentPage(page: number): void {
    this.loadPagedCatalog({
      guardFails: !this.parentInstrumentType,
      instrumentType: this.parentInstrumentType as InstrumentType,
      search: this.parentSearch,
      page,
      pageSize: this.parentPageSize,
      tenorFamily: this.parentTenorFamily,
      setPage: (p) => (this.parentPage = p),
      setContracts: (items) => (this.parentCatalog = items),
      setTotal: (total) => (this.parentTotal = total),
      snapshots: this.parentSnapshots,
    });
  }

  /** Business-reported gap 2026-08-14 ("Why the U002, IB02 does not shown in A6?") — search resets to page 1. */
  onParentSearch(): void {
    this.loadParentPage(1);
  }

  get parentTotalPages(): number {
    return this.parentPaging.totalPages;
  }

  parentPrevPage(): void {
    const page = this.parentPaging.prevTarget();
    if (page !== null) this.loadParentPage(page);
  }

  parentNextPage(): void {
    const page = this.parentPaging.nextTarget();
    if (page !== null) this.loadParentPage(page);
  }

  /** Business instruction 2026-08-14 ("A6 => ...", "A7 should filter out LC records Tenor = Sight") — shared by loadParentPage()'s server-side filter and filteredParentCatalog()'s client-side one below. */
  get parentTenorFamily(): 'SIGHT' | 'USANCE' | undefined {
    if (this.selectedFunction?.tenorTypeOptions?.length) return 'USANCE';
    if (this.selectedFunction?.catalogTenorFilter === 'USANCE') return 'USANCE';
    return undefined;
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
    let list = this.parentCatalog;
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
      const snap = this.parentSnapshots.get(c.balanceContractId);
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
   * pendingEarmarkTotal already fetched into catalogSnapshots for the
   * (now-skipped) 0-balance filter, so no extra API calls are needed.
   * Without this, the user has to click through every Sight LC blind to
   * find the one with a pending Document Arrival.
   */
  catalogPendingHint(c: BalanceContract): string {
    if (!this.selectedFunction?.payExistingUtilize) return '';
    const snap = this.catalogSnapshots.get(c.balanceContractId);
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

  onSelectContract(contractId: string): void {
    this.selectedContract = this.catalogContracts.find((c) => c.balanceContractId === contractId) ?? null;
    // Business instruction 2026-08-15 ("B3 不須選 Sight/Usance 因為交易本身已經有此訊息了") — B3 only.
    // Sight/Usance is no longer a manual subChoice; derive it from the picked Confirmation's own
    // tenorType (declared once, at B1) instead of asking the Maker to re-pick it here.
    if (this.selectedFunction?.movementTypeFromContractTenor && this.selectedContract) {
      this.model.movementType = this.selectedContract.tenorType === 'SIGHT' ? 'HONOUR' : 'ACCEPT';
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
  }

  /** Releases the picked PENDING movement directly — no createMovement call, Amount is whatever A3 already recorded. */
  payExisting(): void {
    if (!this.selectedPayMovement) return;
    this.actionBusy = true;
    this.submitError = null;
    this.api.release(this.selectedPayMovement.movementId, this.model.createdBy === 'maker1' ? 'checker1' : 'checker2').subscribe({
      next: (res) => {
        this.actionBusy = false;
        this.submitResult = res;
        this.refreshSelectedContractSnapshot();
        this.loadPayableMovements(this.selectedContract?.balanceContractId);
        // Business instruction 2026-08-14: "once the Sight Settlement is approved... the LC Index must be
        // refreshed immediately to reflect the latest balance status" — the LC Index's own "Pending: N" / IB
        // hints (catalogSnapshots/catalogPayableIbs) are stale otherwise until the user navigates away and back.
        this.reloadCatalog(this.catalogPage);
      },
      error: (err) => {
        this.actionBusy = false;
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
              this.refreshSelectedContractSnapshot();
              this.syncCheckerToContext();
            });
            return;
          }
          this.selectedContract = contract;
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
    this.selectedParent = this.parentCatalog.find((c) => c.balanceContractId === contractId) ?? null;
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
   * of IPLC_ACCEPTANCE/EPLC_ACCEPTANCE/SHGT rows under the exact LC picked in Step 1. See
   * `loadPagedCatalog`'s own doc comment (BAL-003) — thin wrapper, guard/params unchanged.
   */
  private loadIbIndexPage(page: number): void {
    this.loadPagedCatalog({
      guardFails: !this.model.instrumentType || !this.searchNaturalKey.lcNumber,
      instrumentType: this.model.instrumentType!,
      page,
      pageSize: this.ibIndexPageSize,
      lcNumber: this.searchNaturalKey.lcNumber,
      setPage: (p) => (this.ibIndexPage = p),
      setContracts: (items) => (this.ibIndexCatalog = items),
      setTotal: (total) => (this.ibIndexTotal = total),
      snapshots: this.ibIndexSnapshots,
    });
  }

  get ibIndexTotalPages(): number {
    return this.ibIndexPaging.totalPages;
  }

  ibIndexPrevPage(): void {
    const page = this.ibIndexPaging.prevTarget();
    if (page !== null) this.loadIbIndexPage(page);
  }

  ibIndexNextPage(): void {
    const page = this.ibIndexPaging.nextTarget();
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
    this.searchNaturalKey.ibNumber = picked.ibNumber ?? '';
    this.refreshSelectedContractSnapshot();
    this.syncCheckerToContext();
  }

  /** Same 0-balance exclusion as filteredCatalogContracts()/filteredParentCatalog() — don't offer an already fully-settled/redeemed row as a Settlement/Redeem target. */
  get filteredIbIndexCatalog(): BalanceContract[] {
    if (!this.model.movementType || !DECREASING_MOVEMENT_TYPES.has(this.model.movementType)) return this.ibIndexCatalog;
    return this.ibIndexCatalog.filter((c) => {
      const snap = this.ibIndexSnapshots.get(c.balanceContractId);
      return !snap || snap.availableBalance !== '0';
    });
  }

  /** Step 2 selection — sets selectedContract directly from the already-fetched row, no separate Search click needed. */
  onSelectIbIndex(contractId: string): void {
    this.selectedContract = this.ibIndexCatalog.find((c) => c.balanceContractId === contractId) ?? null;
    this.searchError = null;
    if (this.selectedContract) {
      this.searchNaturalKey.ibNumber = this.selectedContract.naturalKey.ibNumber ?? '';
      this.searchNaturalKey.sgNumber = this.selectedContract.naturalKey.sgNumber ?? '';
    }
    this.refreshSelectedContractSnapshot();
    this.syncCheckerToContext();
  }

  /** True when the natural key's LC Number is sourced from the Parent picker (A6/B4/A8) rather than freely typed (A1/B1). */
  get lcNumberFromParent(): boolean {
    return this.isCreatingMovement && this.hasParent;
  }

  /**
   * Business instruction 2026-08-15 ("Look Up Current Balance should use
   * the existing LC Number on Screen... instead of keyin") — whatever LC
   * Number is currently resolved for THIS function, from whichever picker
   * shape it came from (freely typed A1/B1, Parent picker A6/A8, flat
   * Catalog A2-A5/A3S, or the LC+IB/SG two-field search A7/A9/B5). Feeds
   * both the Checker queue below and runLookup()'s auto-fill.
   */
  get contextLcNumber(): string | null {
    if (this.lcNumberFromParent) return this.selectedParent?.naturalKey.lcNumber ?? null;
    if (this.isCreatingMovement) return this.naturalKey.lcNumber || null;
    if (this.usesTwoFieldSearch) return this.selectedContract?.naturalKey.lcNumber ?? (this.searchNaturalKey.lcNumber || null);
    return this.selectedContract?.naturalKey.lcNumber ?? null;
  }

  /** Same idea as contextLcNumber, for the SG/IB Number half of a two-field natural key (SHGT/Acceptance) — the LC Number is never sourced from the Parent picker for this half, even on A6/A8, since SG/IB Number is always freely typed by the Maker. Feeds syncCheckerToContext() below. */
  get contextSecondaryRef(): string | null {
    const field = this.checkerSecondaryField;
    if (!field) return null;
    if (this.isCreatingMovement) return this.naturalKey[field] || null;
    if (this.usesTwoFieldSearch) return this.selectedContract?.naturalKey[field] ?? (this.searchNaturalKey[field] || null);
    return this.selectedContract?.naturalKey[field] ?? null;
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

  /**
   * Which second natural-key field (if any) the Checker's own search needs,
   * for THIS function's own instrumentType (selectedFunction.instrumentType
   * — same "available immediately, unlike model.instrumentType" rationale as
   * checkerContractId's doc comment above).
   */
  get checkerSecondaryField(): 'ibNumber' | 'sgNumber' | null {
    return this.selectedFunction?.instrumentType ? (NATURAL_KEY_FIELDS_BY_INSTRUMENT[this.selectedFunction.instrumentType][0] ?? null) : null;
  }

  get checkerSecondaryLabel(): string {
    return this.checkerSecondaryField === 'ibNumber' ? (this.selectedFunction?.instrumentType === 'EPLC_ACCEPTANCE' ? 'EB Number' : 'IB Number') : 'SG Number';
  }

  /**
   * Mirrors checkerAct()'s own isCompoundOwnSubmission check (see its doc comment) — single source of
   * truth so the template's "Approve (acknowledgment only)" vs "Release" label/disabled-state can never
   * disagree with what a click will actually do (that exact drift was the 2026-08-15 bug: A3S's
   * compound release() was unreachable because deferSettlement was checked first).
   */
  get isCheckerCompoundOwnSubmission(): boolean {
    if (!this.selectedCheckerMovement) return false;
    if (this.selectedCheckerMovement.movementId !== this.submitResult?.movementId) return false;
    if (this.selectedFunction?.settlesDocumentArrival || this.selectedFunction?.documentArrivalWithSg) return true;
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

  /** Look Up Current Balance is an LC-level view (with Acceptance/SG as sub-tabs) — a function whose own instrumentType IS a child (Acceptance/SG) still looks up its PARENT LC's own contract, not itself. */
  private lcInstrumentTypeFor(instrumentType: InstrumentType): InstrumentType {
    if (instrumentType === 'IPLC_ACCEPTANCE' || instrumentType === 'SHGT') return 'IPLC_LC';
    // Business instruction 2026-08-15: EPLC_ACCEPTANCE's parent is always EPLC_CONFIRMATION now
    // (EPLC_LC/Unconfirmed removed as a parent option) — was wrongly mapping to EPLC_LC, which
    // would sync "Look Up" onto an instrumentType no longer even in its own dropdown.
    if (instrumentType === 'EPLC_ACCEPTANCE') return 'EPLC_CONFIRMATION';
    return instrumentType;
  }

  /**
   * Business instruction 2026-08-15 ("Look Up Current Balance should use
   * the existing LC Number on Screen... Once Maker Submit or Checker
   * display, it will just use the LC Number instead of keyin") — syncs the
   * Look Up panel's own fields from contextLcNumber and re-runs it, so a
   * Maker/Checker never has to separately retype an LC Number they already
   * picked/typed elsewhere on the same screen. Called after a Submit and
   * whenever the Checker queue is (re)displayed — not on every intermediate
   * contract pick while still browsing, to avoid firing lookups mid-search.
   */
  private syncLookupToContext(): void {
    const lcNumber = this.contextLcNumber;
    if (!lcNumber || !this.model.instrumentType) return;
    this.lookup.lcNumber = lcNumber;
    this.lookup.instrumentType = this.lcInstrumentTypeFor(this.model.instrumentType);
    this.lookup.ibNumber = '';
    this.lookup.sgNumber = '';
    this.runLookup();
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

  private rebuildFields(): void {
    // Business instruction 2026-08-14: "The amount should carry from the related LC number + IB number and
    // protected. The Tenor Type and Tenor days should carry from the LC Number and protected as well." — A6/B4
    // only, and only once the source has actually been picked (before that, they're normal editable inputs).
    // Also A7/B5 Full Settle ("the amount should be carried from IB record and protected... if full settle") —
    // Partial Settle stays free-typed, it's a genuine amount decision each time, not a carried-over value.
    const amountFromDocArrival = !!this.selectedFunction?.settlesDocumentArrival && !!this.selectedPayMovement;
    const amountFromFullSettle = this.model.movementType === 'FULL_SETTLE' && !!this.selectedContractSnapshot;
    // Business instruction 2026-08-15 ("There is no need to select Full or Partial as long as the
    // amount is not greater than the SG Balance. The defaulted amount is the SG Balance and
    // mandatory.", refined same day: "Amount default to SG Available Balance") — A9 only, replacing
    // the earlier Full-Redeem-locked/Partial-Redeem-free split with a single freely-editable Amount,
    // pre-filled to the SG's Available Balance (refreshSelectedContractSnapshot()/afterResolved() set
    // this on selection — Available, not Confirmed, so an already-PENDING redemption on the same SG
    // is correctly netted out) and capped at it (props.max below) — never disabled. FULL_REDEEM vs
    // PARTIAL_REDEEM is derived at submit() time from whether the typed amount still equals that
    // Available Balance, not picked by the user (autoRedeemType — see its own doc comment).
    const amountCappedAtSg = !!this.selectedFunction?.autoRedeemType && !!this.selectedContractSnapshot;
    // Business instruction 2026-08-16 ("B6改成B5選資料為有Acceptance Balance>0的EB交易") — same
    // default-to-Available/freely-editable-down-to-Partial/capped-at-it shape as amountCappedAtSg above,
    // just for B5's own Usance/CNF_MATURE branch (model.instrumentType === 'EPLC_ACCEPTANCE', B5's own
    // fixed registry type — see settlesAcceptanceOnMature's own doc comment for why this is always true
    // for a real B5 submission, not a conditional fallback resolution).
    const amountCappedAtAcceptance =
      !!this.selectedFunction?.settlesAcceptanceOnMature && this.model.instrumentType === 'EPLC_ACCEPTANCE' && !!this.selectedContractSnapshot;
    const amountLocked = amountFromDocArrival || amountFromFullSettle;
    const tenorLocked = !!this.selectedFunction?.tenorTypeOptions?.length && this.isCreatingMovement && this.hasParent && !!this.selectedParent;
    this.fields = [
      {
        key: 'amount',
        type: 'input',
        props: {
          label: amountFromFullSettle
            ? "Amount (Full Settle — carried from the Acceptance's Available Balance, protected)"
            : amountCappedAtSg
              ? "Amount (defaults to the Shipping Guarantee's Available Balance — reduce for a Partial Redeem, must not exceed it)"
              : amountCappedAtAcceptance
                ? "Amount (defaults to the Acceptance's Available Balance — reduce for a Partial Settle, must not exceed it; also settles the matching Reimbursement Receivable for the same amount)"
                : this.selectedFunction?.documentArrivalWithSg
                  ? // Business instruction 2026-08-15 ("Bill Amount = actual Document Arrival amount... SG
                    // Redemption Amount = system-calculated MIN(Bill Amount, SG Outstanding)") — reverses the
                    // prior full-match-only design (Bill Amount used to be locked to the SG's outstanding).
                    'Bill Amount (actual document amount — see SG Redemption Amount below)'
                  : amountLocked
                    ? 'Amount (carried from the Document Arrival, protected)'
                    : 'Amount (face-level, per Design doc §6.2)',
          required: true,
          type: 'number',
          disabled: amountLocked,
          max: amountCappedAtSg || amountCappedAtAcceptance ? Number(this.selectedContractSnapshot!.availableBalance) : undefined,
          // Keeps the input's own spinner/step granularity in sync with whichever Currency is typed
          // alongside it (e.g. JPY -> step 1, no cents) — see decimalPlacesForCurrency's own doc
          // comment (balance-component.model.ts) for the ISO 4217 minor-unit table this reads.
          step: Math.pow(10, -decimalPlacesForCurrency(this.model.currency)),
        },
        // Currency is a free-typed sibling field (no fixed dropdown to hook a (change) event off of),
        // so — same as tenorDays' own props.min/props.disabled above — this uses Formly's expressions
        // to keep props.step live as the user types a Currency, rather than rebuildFields() (which
        // would reassign the whole `this.fields` array on every keystroke and risk input-focus loss).
        expressions: {
          'props.step': (f: any) => Math.pow(10, -decimalPlacesForCurrency(f.model?.currency)),
        },
      },
      { key: 'currency', type: 'input', props: { label: 'Currency', required: true } },
      {
        key: 'tolerancePct',
        type: 'input',
        props: { label: 'Tolerance % (Maximum Exposure Basis, only on ISSUE/AMEND*)', type: 'number' },
        hide: !this.toleranceApplicable,
      },
      {
        key: 'secondaryRef',
        type: 'input',
        props: { label: this.dynamicSecondaryRefLabel ?? 'Reference No.', required: !!this.dynamicSecondaryRefLabel },
        hide: !this.dynamicSecondaryRefLabel,
      },
      {
        key: 'tenorType',
        type: 'select',
        props: {
          label: tenorLocked ? 'Tenor Type (carried from the parent LC, protected)' : 'Tenor Type (Design doc §7 Tenor Type Routing)',
          required: !!this.selectedFunction?.tenorTypeOptions?.length,
          options: this.selectedFunction?.tenorTypeOptions ?? [],
          disabled: tenorLocked,
        },
        hide: !this.selectedFunction?.tenorTypeOptions?.length,
      },
      {
        key: 'tenorDays',
        type: 'input',
        props: { label: tenorLocked ? 'Tenor Days (carried from the parent LC, protected)' : 'Tenor Days', type: 'number', disabled: tenorLocked },
        hide: !this.selectedFunction?.tenorTypeOptions?.length,
        // Business instruction 2026-08-15 ("A1: Sight => Tenor Days = 0 and protected; not Sight
        // => Tenor Days must be > 0, mandatory") — extended same-day to B1 (Confirm LC) since it
        // declares its own Tenor Type/Days independently, same as A1. Uses Formly's `expressions`
        // (reacts live to the Tenor Type dropdown, evaluated internally by Formly on every model
        // change) rather than rebuildFields(), which would reassign `this.fields` on every
        // keystroke and risk the same input-focus loss as a live-reordered *ngFor.
        ...((this.selectedFunction?.code === 'A1' || this.selectedFunction?.code === 'B1') && !tenorLocked
          ? {
              expressions: {
                'props.disabled': (f: any) => f.model?.tenorType === 'SIGHT',
                'props.required': (f: any) => !!f.model?.tenorType && f.model.tenorType !== 'SIGHT',
                'props.min': (f: any) => (f.model?.tenorType && f.model.tenorType !== 'SIGHT' ? 1 : null),
                'props.label': (f: any) => (f.model?.tenorType === 'SIGHT' ? 'Tenor Days (Sight — always 0, protected)' : 'Tenor Days'),
                className: (f: any) => (f.model?.tenorType && f.model.tenorType !== 'SIGHT' ? 'tb-field--required' : ''),
                'model.tenorDays': (f: any) => (f.model?.tenorType === 'SIGHT' ? 0 : f.model?.tenorDays),
              },
            }
          : {}),
      },
      { key: 'eventSeq', type: 'input', props: { label: 'Event Seq (idempotency key part, Design doc §8)', required: true, type: 'number' } },
      { key: 'createdBy', type: 'input', props: { label: 'Created By (Maker)', required: true } },
    ];
    // Mandatory-field visual distinction (UI/UX best practice: don't rely on the tiny asterisk
    // alone) — applies uniformly to every function (A1-A9/B1-B5) since it reads props.required
    // rather than hardcoding field keys. See .tb-field--required in the stylesheet.
    for (const f of this.fields) {
      if (f.props?.required) f.className = [f.className, 'tb-field--required'].filter(Boolean).join(' ');
    }
  }

  /**
   * Quality-report-balance.md BAL-003, final increment — submit()'s own ~430-line body split into
   * this validation step, buildSubmitRequest() (request assembly), five named per-shape submission
   * methods (submitDocumentArrivalWithSg/submitConfirmationHonourWithReceivable/
   * submitConfirmationAcceptWithReceivable/submitAcceptanceSettleWithReceivable/submitPlain), and
   * submit() itself, now just a thin dispatcher. Pure code motion — every guard condition, every
   * business-instruction comment, every error message, and the exact order every API call fires in is
   * unchanged; only WHERE each piece lives changed. Not a "guard/params unchanged, only a repeated
   * body moves" consolidation like the extractions above (there's no meaningful duplication here to
   * remove) — this is a straightforward decompose-one-giant-method-into-named-pieces split, chosen
   * over moving anything into a separate service/component for the same reason `finishCheckerAction`'s
   * own doc comment gives: this logic reads/writes deeply into component state
   * (`selectedContract`/`selectedArrivalSg`/`arrivalSgSnapshot`/`naturalKey`/`model`/etc.) and a
   * service extraction would just relocate that coupling, not remove it.
   */
  private validateSubmit(): boolean {
    if (!this.model.instrumentType || !this.model.movementType || !this.model.amount || !this.model.currency || !this.model.createdBy) {
      this.submitError = 'Fill in amount, currency, createdBy.';
      return false;
    }
    if (amountExceedsCurrencyDecimals(this.model.amount, this.model.currency)) {
      this.submitError = `Amount ${this.model.amount} has more decimal places than ${this.model.currency.toUpperCase()} allows (${decimalPlacesForCurrency(this.model.currency)}).`;
      return false;
    }
    if (this.dynamicSecondaryRefLabel && !this.model.secondaryRef) {
      this.submitError = `${this.dynamicSecondaryRefLabel} is mandatory for ${this.selectedFunction?.code}.`;
      return false;
    }
    if (this.isCreatingMovement && this.model.instrumentType === 'SHGT' && !this.naturalKey.sgNumber) {
      this.submitError = 'SG Number is mandatory when issuing a Shipping Guarantee.';
      return false;
    }
    if (this.lcNumberFromParent && !this.naturalKey.lcNumber) {
      this.submitError = "Pick the Parent LC first — that selection supplies this record's LC Number.";
      return false;
    }
    // Business-reported gap 2026-08-14: A1/B1 (LC Issue) never had this
    // check — lcNumberFromParent above only covers A6/B4/A8, which get the
    // LC Number from the Parent picker. A1/B1 type it free-text and had
    // nothing stopping a blank submission, silently creating a Logical
    // Contract with lc_number='' (found live via a blank-LC-Number row in
    // the Catalog during this session's testing).
    if (this.isCreatingMovement && !this.lcNumberFromParent && !this.naturalKey.lcNumber) {
      this.submitError = 'LC Number is mandatory.';
      return false;
    }
    if (this.requiredNaturalKeyFields.includes('ibNumber') && this.isCreatingMovement && !this.naturalKey.ibNumber) {
      this.submitError = `${this.ibNumberLabel} is mandatory.`;
      return false;
    }
    if (this.selectedFunction?.tenorTypeOptions?.length && !this.model.tenorType) {
      this.submitError = `Tenor Type is mandatory for ${this.selectedFunction.code}.`;
      return false;
    }
    // Business instruction 2026-08-15 ("A1: Sight => Tenor Days = 0, protected; not Sight => Tenor
    // Days must be > 0, mandatory") — the tenorDays field's expressions (rebuildFields()) already
    // enforce this visually/reactively; this is the submit-time backstop, matching how every other
    // mandatory field in this method is checked (submit() never gates on this.form.valid).
    if (this.selectedFunction?.code === 'A1') {
      if (this.model.tenorType === 'SIGHT') {
        this.model.tenorDays = 0;
      } else if (!this.model.tenorDays || Number(this.model.tenorDays) <= 0) {
        this.submitError = "Tenor Days must be greater than 0 for Seller's/Buyer's Usance.";
        return false;
      }
    }
    // Business instruction 2026-08-14 ("A6 => Approved LC Balance and Create Acceptance Balance"),
    // generalized 2026-08-15 for B4 ("B4 should index records from B3") — A6/B4 must convert a
    // SPECIFIC still-PENDING record, not create an Acceptance untethered from one.
    if (this.selectedFunction?.settlesDocumentArrival && !this.selectedPayMovement) {
      this.submitError = `Pick the still-PENDING ${this.selectedFunction?.pendingItemLabel ?? 'Document Arrival'} (2ndary Index) to convert first.`;
      return false;
    }
    // A3S must be tied to a SPECIFIC Shipping Guarantee — same reasoning as A6 above, just against an
    // outstanding SG record instead of an existing PENDING Document Arrival.
    if (this.selectedFunction?.documentArrivalWithSg && (!this.selectedArrivalSg || !this.arrivalSgSnapshot)) {
      this.submitError = 'Pick the Shipping Guarantee this Document Arrival is against first.';
      return false;
    }
    // Business instruction 2026-08-15 ("no need to select Full or Partial as long as the amount is not
    // greater than the SG Balance. The defaulted amount is the SG Balance and mandatory.", refined same
    // day: "Amount default to SG Available Balance") — A9 only. props.max in rebuildFields() already
    // guards this reactively; this is the submit-time backstop, matching how every other mandatory rule
    // in this method is checked. Checked against Available (Confirmed minus any other already-PENDING
    // redemption on this same SG), not Confirmed — same distinction as shgtRedeem.ts's commitment-control
    // fix, otherwise this could offer/accept an amount the server's own sufficiency check would reject.
    // movementType is DERIVED here — never picked by the user — FULL_REDEEM when the typed amount still
    // equals the SG's current Available Balance, PARTIAL_REDEEM when it's been reduced below it.
    if (this.selectedFunction?.autoRedeemType) {
      if (!this.selectedContractSnapshot) {
        this.submitError = 'Search for the Shipping Guarantee to redeem first.';
        return false;
      }
      const available = this.selectedContractSnapshot.availableBalance;
      if (Number(this.model.amount) > Number(available)) {
        this.submitError = `Amount must not exceed the SG's Available Balance (${available}).`;
        return false;
      }
      this.model.movementType = Number(this.model.amount) === Number(available) ? 'FULL_REDEEM' : 'PARTIAL_REDEEM';
    }
    // Business instruction 2026-08-16 ("從Balance Component角度來看B5不需要，B6改成B5選資料為有Acceptance
    // Balance>0的EB交易，交易會解除EB交易的Acceptance Balance") — B5 only, same "derive Full/Partial from
    // amount vs Available" shape as autoRedeemType above, just targeting SETTLE instead of REDEEM. B5's
    // own instrumentType is fixed to EPLC_ACCEPTANCE (Usance held-to-maturity — B5 has no Sight branch
    // of its own, see settlesAcceptanceOnMature's own doc comment), so this condition is always true for
    // a real B5 submission. Grounded in the frozen spec's own event table (impl-spec-en.md CNF_MATURE
    // row): "−CONFIRMED_ACCEPTANCE_DPU_OUTSTANDING | −BENEFICIARY_ACCOUNT; +NOSTRO / −ACCEPTANCE_REIMB_
    // RECEIVABLE_ISSUING_BANK" — ONE event clearing both the Acceptance liability and its matching
    // Reimbursement Receivable together, not two independent ones the way CNF_REIMB (Sight/Nego'd) is.
    if (this.selectedFunction?.settlesAcceptanceOnMature && this.model.instrumentType === 'EPLC_ACCEPTANCE') {
      if (!this.selectedContractSnapshot) {
        this.submitError = 'Search for the Acceptance to settle first.';
        return false;
      }
      const available = this.selectedContractSnapshot.availableBalance;
      if (Number(this.model.amount) > Number(available)) {
        this.submitError = `Amount must not exceed the Acceptance's Available Balance (${available}).`;
        return false;
      }
      this.model.movementType = Number(this.model.amount) === Number(available) ? 'FULL_SETTLE' : 'PARTIAL_SETTLE';
    }
    return true;
  }

  /** BAL-003 — assembles the base CreateMovementRequest, same field-by-field logic as before this split. Returns null (and sets submitError) only for the "no contract picked" case — every other precondition was already checked by validateSubmit(). */
  private buildSubmitRequest(): CreateMovementRequest | null {
    const req: CreateMovementRequest = {
      instrumentType: this.model.instrumentType!,
      movementType: this.model.movementType!,
      eventSeq: this.model.eventSeq ?? Date.now(),
      amount: String(this.model.amount),
      currency: this.model.currency!,
      createdBy: this.model.createdBy!,
    };
    if (this.toleranceApplicable && this.model.tolerancePct) req.tolerancePct = String(this.model.tolerancePct);
    if (this.model.secondaryRef) req.sourceTransactionRef = this.model.secondaryRef;
    if (this.selectedFunction?.tenorTypeOptions?.length) {
      req.tenorType = this.model.tenorType;
      if (this.model.tenorDays) req.tenorDays = Number(this.model.tenorDays);
    }

    if (this.isCreatingMovement) {
      req.naturalKey = {
        lcNumber: this.naturalKey.lcNumber,
        ibNumber: this.naturalKey.ibNumber || null,
        sgNumber: this.naturalKey.sgNumber || null,
      };
    } else if (this.selectedContract) {
      req.balanceContractId = this.selectedContract.balanceContractId;
    } else {
      this.submitError = 'Pick a contract from the Catalog below.';
      return null;
    }

    if (this.hasParent && this.selectedParent) {
      req.parentLogicalContractId = this.selectedParent.logicalContractId;
    }
    if (this.model.instrumentType === 'EPLC_ACCEPTANCE' && this.model.movementType === 'CREATE') {
      req.exposureNature = this.exposureNature;
    }
    return req;
  }

  // Business instruction 2026-08-14 ("Document Arrival w Shipping Gtee... will also Redemp SG Balance in
  // Pending via Maker and then Redemp SG Balance in Approved via Checker approved") — A3S only. Creates the
  // matched SG's own redemption FIRST, still PENDING — src/domain/offBalanceExposure.ts's
  // computeOffBalanceExposure() counts a PENDING redemption the same as a RELEASED one, so by the time the
  // second call (the LC's own UTILIZE, req below, for the FULL Bill Amount) runs its sufficiency check
  // server-side, this SG's exposure is already netted out of Tight Available. Only proceeds to the second
  // call if the first genuinely succeeds — a failed SG redemption must never leave an orphaned Document
  // Arrival behind.
  //
  // Business instruction 2026-08-15 ("SG Redemption Amount = system-calculated MIN(Bill Amount, SG
  // Outstanding)... Incremental Exposure = Document Amount − Eligible SG Match") — reverses the prior
  // full-match-only design (the SG call used to always redeem its full outstanding, forced equal to Bill
  // Amount). The SG's own redemption is now only ever for the matched portion — never more than its
  // outstanding — classified FULL_REDEEM/PARTIAL_REDEEM by whether that portion exhausts it. req's own
  // amount (the LC UTILIZE) is untouched here — it already carries the FULL Bill Amount from model.amount;
  // any excess above the SG match is ordinary incremental LC exposure, still checked for real against
  // Tight Available (§6.1 v0.12's hard-409 rule) since only the matched portion was netted out.
  private submitDocumentArrivalWithSg(req: CreateMovementRequest): void {
    const businessEventId = crypto.randomUUID();
    req.businessEventId = businessEventId;
    const sgOutstanding = Number(this.arrivalSgSnapshot!.confirmedBalance);
    const sgRedeemAmount = Math.min(Number(this.model.amount), sgOutstanding);
    const redeemReq: CreateMovementRequest = {
      instrumentType: 'SHGT',
      balanceContractId: this.selectedArrivalSg!.balanceContractId,
      movementType: sgRedeemAmount >= sgOutstanding ? 'FULL_REDEEM' : 'PARTIAL_REDEEM',
      eventSeq: Date.now(),
      amount: String(sgRedeemAmount),
      currency: this.selectedArrivalSg!.currency,
      createdBy: this.model.createdBy!,
      businessEventId,
      sourceTransactionRef: this.model.secondaryRef || undefined,
    };
    this.api.createMovement(redeemReq).subscribe({
      next: (redeemRes: any) => {
        this.arrivalSgRedeemMovementId = redeemRes.body.movementId;
        this.api.createMovement(req).subscribe({
          next: (res: any) => {
            this.submitting = false;
            this.submitResult = res.body;
            this.refreshSelectedContractSnapshot();
            this.syncCheckerToContext();
            this.syncLookupToContext();
          },
          error: (err) => {
            this.submitting = false;
            this.submitError = `Shipping Guarantee redemption reserved (PENDING), but the Document Arrival itself failed: ${this.describeApiError(err)}`;
            this.submitResult = err.error ?? null;
          },
        });
      },
      error: (err) => {
        this.submitting = false;
        this.submitError = `Could not reserve the Shipping Guarantee redemption: ${this.describeApiError(err)}`;
      },
    });
  }

  // Business instruction 2026-08-15 (Gap Analysis Row 5, rationale-en.md §7.4a "paying the exporter
  // under a confirmation creates an asset against the issuing/reimbursing bank, not another
  // liability") — B3's Sight/HONOUR branch only. Creates the EPLC_CONFIRMATION's own HONOUR (req)
  // FIRST — only proceeds to the linked EPLC_DUE_FROM_ISSUING_BANK CREATE if that genuinely
  // succeeds, so a rejected HONOUR (e.g. insufficient Confirmation balance) never leaves an orphaned
  // receivable behind. No ordering dependency the other way — CREATE on a brand-new asset contract
  // is NO_CHECK server-side (no sufficiency check to net against), unlike A3S's SG-first ordering
  // above.
  private submitConfirmationHonourWithReceivable(req: CreateMovementRequest): void {
    const businessEventId = crypto.randomUUID();
    req.businessEventId = businessEventId;
    const cnfContract = this.selectedContract!;
    this.api.createMovement(req).subscribe({
      next: (res: any) => {
        this.submitResult = res.body;
        const receivableReq: CreateMovementRequest = {
          instrumentType: 'EPLC_DUE_FROM_ISSUING_BANK',
          naturalKey: { lcNumber: cnfContract.naturalKey.lcNumber, ibNumber: this.naturalKey.ibNumber || this.model.secondaryRef || null, sgNumber: null },
          parentLogicalContractId: cnfContract.logicalContractId,
          movementType: 'CREATE',
          eventSeq: Date.now(),
          amount: String(this.model.amount),
          // Non-null: submit()'s own mandatory-fields guard already required these before this
          // closure could ever run — TS just can't see that narrowing across the .subscribe() boundary.
          currency: this.model.currency!,
          createdBy: this.model.createdBy!,
          businessEventId,
        };
        this.api.createMovement(receivableReq).subscribe({
          next: (receivableRes: any) => {
            this.submitting = false;
            this.dueFromIssuingBankMovementId = receivableRes.body.movementId;
            this.refreshSelectedContractSnapshot();
            this.syncCheckerToContext();
            this.syncLookupToContext();
          },
          error: (err) => {
            this.submitting = false;
            this.submitError = `Confirmation honoured (PENDING), but the Due from Issuing Bank asset failed to record: ${this.describeApiError(err)}`;
          },
        });
      },
      error: (err) => {
        this.submitting = false;
        this.submitError = err.error?.message ?? err.message ?? String(err);
        this.submitResult = err.error ?? null;
      },
    });
  }

  // Business instruction 2026-08-15 (Gap Analysis Row 6 Critical Gap, then unified into B4's own
  // Honour/Accept legal-event role by the "Confirm LC Balance 控制" table review — B4 now IS
  // `CNF_ACCEPT` itself, not just its follow-up) — B4's Usance branch only. req here is the PRIMARY:
  // the Confirmation's own ACCEPT (movementTypeFromContractTenor already built it as
  // instrumentType=EPLC_CONFIRMATION/movementType=ACCEPT/balanceContractId=selectedContract, same as
  // the Sight/HONOUR branch above). On success, creates the EPLC_ACCEPTANCE liability, THEN the
  // EPLC_ACCEPTANCE_REIMB_RECEIVABLE asset (the piece Row 6 was missing) — each only proceeding if
  // the previous genuinely succeeded, so a failure never leaves a partial compound behind. Tenor
  // Type/Days for the new Acceptance are carried from the Confirmation itself (server-enforced they
  // must match anyway, per B4's own help text).
  private submitConfirmationAcceptWithReceivable(req: CreateMovementRequest): void {
    const businessEventId = crypto.randomUUID();
    req.businessEventId = businessEventId;
    const cnfContract = this.selectedContract!;
    this.api.createMovement(req).subscribe({
      next: (res: any) => {
        this.submitResult = res.body;
        const acceptanceReq: CreateMovementRequest = {
          instrumentType: 'EPLC_ACCEPTANCE',
          naturalKey: { lcNumber: cnfContract.naturalKey.lcNumber, ibNumber: this.naturalKey.ibNumber || this.model.secondaryRef || null, sgNumber: null },
          parentLogicalContractId: cnfContract.logicalContractId,
          movementType: 'CREATE',
          eventSeq: Date.now(),
          amount: String(this.model.amount),
          // Non-null: submit()'s own mandatory-fields guard already required these before this
          // closure could ever run — TS just can't see that narrowing across the .subscribe() boundary.
          currency: this.model.currency!,
          createdBy: this.model.createdBy!,
          businessEventId,
          exposureNature: 'ACTUAL',
          tenorType: cnfContract.tenorType ?? undefined,
          tenorDays: cnfContract.tenorDays ?? undefined,
        };
        this.api.createMovement(acceptanceReq).subscribe({
          next: (acceptanceRes: any) => {
            this.acceptanceMovementId = acceptanceRes.body.movementId;
            const receivableReq: CreateMovementRequest = {
              instrumentType: 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE',
              naturalKey: {
                lcNumber: cnfContract.naturalKey.lcNumber,
                ibNumber: this.naturalKey.ibNumber || this.model.secondaryRef || null,
                sgNumber: null,
              },
              parentLogicalContractId: cnfContract.logicalContractId,
              movementType: 'CREATE',
              eventSeq: Date.now(),
              amount: String(this.model.amount),
              currency: this.model.currency!,
              createdBy: this.model.createdBy!,
              businessEventId,
            };
            this.api.createMovement(receivableReq).subscribe({
              next: (receivableRes: any) => {
                this.submitting = false;
                this.acceptanceReimbReceivableMovementId = receivableRes.body.movementId;
                this.refreshSelectedContractSnapshot();
                this.syncCheckerToContext();
                this.syncLookupToContext();
              },
              error: (err) => {
                this.submitting = false;
                this.submitError = `Confirmation accepted (PENDING) and Acceptance created (PENDING), but the Reimbursement Receivable asset failed to record: ${this.describeApiError(err)}`;
              },
            });
          },
          error: (err) => {
            this.submitting = false;
            this.submitError = `Confirmation accepted (PENDING), but the Acceptance liability failed to record: ${this.describeApiError(err)}`;
          },
        });
      },
      error: (err) => {
        this.submitting = false;
        this.submitError = err.error?.message ?? err.message ?? String(err);
        this.submitResult = err.error ?? null;
      },
    });
  }

  // Business instruction 2026-08-16 ("從Balance Component角度來看B5不需要，B6改成B5選資料為有Acceptance
  // Balance>0的EB交易，交易會解除EB交易的Acceptance Balance") — B5's Usance/CNF_MATURE branch only. req
  // here is the PRIMARY: the Acceptance's own FULL_SETTLE/PARTIAL_SETTLE (derived above). On success,
  // resolves the MATCHING EPLC_ACCEPTANCE_REIMB_RECEIVABLE contract (same LC+EB Number natural key —
  // B4's own compound already created it, linked to the same Acceptance) and creates its REIMBURSE for
  // the SAME amount, same businessEventId — one Checker Release finalizes both (see release()'s own
  // settlesAcceptanceOnMature branch). B5's own instrumentType is fixed to EPLC_ACCEPTANCE (Usance —
  // B5 has no Sight branch of its own, see settlesAcceptanceOnMature's doc comment), so this guard is
  // always true for a real B5 submission; the plain REIMBURSE path below is reached by other functions
  // instead (unchanged from the old B6), never by B5 falling through this one.
  private submitAcceptanceSettleWithReceivable(req: CreateMovementRequest): void {
    const businessEventId = crypto.randomUUID();
    req.businessEventId = businessEventId;
    const acceptanceContract = this.selectedContract!;
    this.api.createMovement(req).subscribe({
      next: (res: any) => {
        this.submitResult = res.body;
        this.api
          .resolveContract('EPLC_ACCEPTANCE_REIMB_RECEIVABLE', {
            lcNumber: acceptanceContract.naturalKey.lcNumber,
            ibNumber: acceptanceContract.naturalKey.ibNumber,
          })
          .subscribe({
            next: (receivableContract) => {
              const reimbReq: CreateMovementRequest = {
                instrumentType: 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE',
                balanceContractId: receivableContract.balanceContractId,
                movementType: 'REIMBURSE',
                eventSeq: Date.now(),
                amount: String(this.model.amount),
                // Non-null: submit()'s own mandatory-fields guard already required these before this
                // closure could ever run — TS just can't see that narrowing across the .subscribe() boundary.
                currency: this.model.currency!,
                createdBy: this.model.createdBy!,
                businessEventId,
              };
              this.api.createMovement(reimbReq).subscribe({
                next: (reimbRes: any) => {
                  this.submitting = false;
                  this.matchedReceivableMovementId = reimbRes.body.movementId;
                  this.refreshSelectedContractSnapshot();
                  this.syncCheckerToContext();
                  this.syncLookupToContext();
                },
                error: (err) => {
                  this.submitting = false;
                  this.submitError = `Acceptance settled (PENDING), but the matching Reimbursement Receivable failed to record: ${this.describeApiError(err)}`;
                },
              });
            },
            error: (err) => {
              this.submitting = false;
              this.submitError = `Acceptance settled (PENDING), but its matching Reimbursement Receivable could not be found: ${this.describeApiError(err)}`;
            },
          });
      },
      error: (err) => {
        this.submitting = false;
        this.submitError = err.error?.message ?? err.message ?? String(err);
        this.submitResult = err.error ?? null;
      },
    });
  }

  // Business instruction 2026-08-14 (revised): "When Submit A6, the LC Balance is remain unchanged but
  // create an Acceptance Balance in Pending." — the Document Arrival release moved OUT of the Maker's
  // Submit and into the Checker's release() below; a Maker submitting a request must never be able to
  // unilaterally finalize the LC's own Balance — that needs the same 4-eyes Checker step as everything else.
  // The default/plain path — every function that doesn't need one of the four compound shapes above.
  private submitPlain(req: CreateMovementRequest): void {
    this.api.createMovement(req).subscribe({
      next: (res: any) => {
        this.submitting = false;
        this.submitResult = res.body;
        // Earmark takes effect immediately at PENDING, before Release (Design doc §6) —
        // refresh right away so the panel shows the drop, not just after Release.
        this.refreshSelectedContractSnapshot();
        this.syncCheckerToContext();
        this.syncLookupToContext();
      },
      error: (err) => {
        this.submitting = false;
        this.submitError = err.error?.message ?? err.message ?? String(err);
        this.submitResult = err.error ?? null;
      },
    });
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

    if (this.selectedFunction?.documentArrivalWithSg && this.selectedArrivalSg && this.arrivalSgSnapshot) {
      this.submitDocumentArrivalWithSg(req);
      return;
    }
    if (this.selectedFunction?.createsIssuingBankReceivableOnHonour && this.model.movementType === 'HONOUR' && this.selectedContract) {
      this.submitConfirmationHonourWithReceivable(req);
      return;
    }
    if (this.selectedFunction?.createsAcceptanceReimbReceivableOnCreate && this.selectedContract) {
      this.submitConfirmationAcceptWithReceivable(req);
      return;
    }
    if (this.selectedFunction?.settlesAcceptanceOnMature && this.model.instrumentType === 'EPLC_ACCEPTANCE' && this.selectedContract) {
      this.submitAcceptanceSettleWithReceivable(req);
      return;
    }
    this.submitPlain(req);
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

  /**
   * Quality-report-balance.md BAL-003 (second of three planned extractions — see
   * `finishCheckerAction`'s own doc comment, above `release()`, for the third/final one). Shared
   * body behind the Look Up panel's three near-identical "fetch snapshot + fetch/sort movements by
   * eventSeq" pairs (Tab 1 LC, Tab 2 Acceptance, Tab 3 SG) — only the fetch/populate shape is shared;
   * each caller still owns its own target fields and its own snapshot-error behavior (Tab 1 surfaces
   * `lookupError`, Tabs 2/3 just null out their own snapshot), same "guard/params unchanged, only the
   * body moves" convention as `loadPagedCatalog` above.
   */
  private loadSnapshotAndMovements(
    contractId: string,
    setSnapshot: (snapshot: BalanceSnapshot) => void,
    setMovements: (movements: BalanceMovement[]) => void,
    onSnapshotError: (err: unknown) => void,
  ): void {
    this.api.getSnapshot(contractId).subscribe({
      next: setSnapshot,
      error: onSnapshotError,
    });
    // Event timeline, in eventSeq (time) order — Design doc §8: eventSeq is strictly increasing per contract.
    this.api.listMovements(contractId).subscribe({
      next: (movements) => setMovements([...movements].sort((a, b) => a.eventSeq - b.eventSeq)),
      error: () => setMovements([]),
    });
  }

  /**
   * Quality-report-balance.md BAL-003 — shared body behind runLookup()'s two near-identical "fetch
   * candidates under this LC, auto-pick if exactly one" catalog calls (Acceptance tab / SG tab).
   */
  private loadUnderLookupCandidates(
    instrumentType: InstrumentType,
    lcNumber: string,
    setCandidates: (items: BalanceContract[]) => void,
    autoSelect: (contractId: string) => void,
  ): void {
    this.api.catalog(instrumentType, undefined, undefined, 1, 50, lcNumber).subscribe({
      next: (result) => {
        setCandidates(result.items);
        if (result.items.length === 1) autoSelect(result.items[0].balanceContractId);
      },
      error: () => setCandidates([]),
    });
  }

  runLookup(): void {
    this.lookupError = null;
    this.lookupResult = null;
    this.lookupMovements = [];
    this.lookupTab = 'LC';
    this.acceptancesUnderLookup = [];
    this.selectedLookupAcceptance = null;
    this.acceptanceSnapshot = null;
    this.acceptanceMovements = [];
    this.sgsUnderLookup = [];
    this.selectedLookupSg = null;
    this.sgSnapshot = null;
    this.sgMovements = [];
    this.api
      .resolveContract(this.lookup.instrumentType, {
        lcNumber: this.lookup.lcNumber,
        ibNumber: this.lookup.ibNumber || null,
        sgNumber: this.lookup.sgNumber || null,
      })
      .subscribe({
        next: (contract) => {
          this.loadSnapshotAndMovements(
            contract.balanceContractId,
            (snapshot) => (this.lookupResult = { contract, snapshot }),
            (movements) => (this.lookupMovements = movements),
            (err) => (this.lookupError = this.describeApiError(err)),
          );
          // Business instruction 2026-08-14 ("two tabs for Usance LC, one for LC Balance and one for Acceptance
          // Balance") — fetch every Acceptance carved out under this LC (one per IB Number, per A6) so the second
          // tab has something to pick from as soon as it's a Usance-tenor LC; harmless no-op for a Sight LC's
          // resolveContract() returning tenorType === 'SIGHT' (or unset legacy), since lookupIsUsanceLc() hides
          // the tab entirely in that case regardless of whether this fetch found anything.
          const acceptanceType = this.acceptanceInstrumentTypeFor(contract.instrumentType);
          if (acceptanceType) {
            this.loadUnderLookupCandidates(
              acceptanceType,
              contract.naturalKey.lcNumber,
              (items) => (this.acceptancesUnderLookup = items),
              (contractId) => this.selectLookupAcceptance(contractId),
            );
          }
          // Business instruction 2026-08-14 ("two tabs for Sight LC i.e. LC Balance SG Balance, for Usance LC...
          // three tabs, LC Balance, Acceptance Balance, and SG Balance") — every SHGT under this LC, any tenor.
          if (contract.instrumentType === 'IPLC_LC') {
            this.loadUnderLookupCandidates(
              'SHGT',
              contract.naturalKey.lcNumber,
              (items) => (this.sgsUnderLookup = items),
              (contractId) => this.selectLookupSg(contractId),
            );
          }
        },
        error: (err) => (this.lookupError = this.describeApiError(err)),
      });
  }

  /** Business instruction 2026-08-14 ("two/three tabs...") — switching tabs with only one candidate under it jumps straight to it. */
  selectLookupTab(tab: 'LC' | 'ACCEPTANCE' | 'SG'): void {
    this.lookupTab = tab;
    if (tab === 'ACCEPTANCE' && !this.selectedLookupAcceptance && this.acceptancesUnderLookup.length === 1) {
      this.selectLookupAcceptance(this.acceptancesUnderLookup[0].balanceContractId);
    }
    if (tab === 'SG' && !this.selectedLookupSg && this.sgsUnderLookup.length === 1) {
      this.selectLookupSg(this.sgsUnderLookup[0].balanceContractId);
    }
  }

  /** SG tab — business instruction 2026-08-14 ("SG Balance"): loads the picked SHGT's own snapshot + Event Timeline, independent of the LC's own and any Acceptance's. */
  selectLookupSg(contractId: string): void {
    this.selectedLookupSg = this.sgsUnderLookup.find((c) => c.balanceContractId === contractId) ?? null;
    if (!this.selectedLookupSg) {
      this.sgSnapshot = null;
      this.sgMovements = [];
      return;
    }
    this.loadSnapshotAndMovements(
      this.selectedLookupSg.balanceContractId,
      (snapshot) => (this.sgSnapshot = snapshot),
      (movements) => (this.sgMovements = movements),
      () => (this.sgSnapshot = null),
    );
  }

  /** Acceptance tab — business instruction 2026-08-14 ("one for Acceptance Balance"): loads the picked Acceptance's own snapshot + Event Timeline, independent of the LC's own (Tab 1's lookupResult/lookupMovements are untouched). */
  selectLookupAcceptance(contractId: string): void {
    this.selectedLookupAcceptance = this.acceptancesUnderLookup.find((c) => c.balanceContractId === contractId) ?? null;
    if (!this.selectedLookupAcceptance) {
      this.acceptanceSnapshot = null;
      this.acceptanceMovements = [];
      return;
    }
    this.loadSnapshotAndMovements(
      this.selectedLookupAcceptance.balanceContractId,
      (snapshot) => (this.acceptanceSnapshot = snapshot),
      (movements) => (this.acceptanceMovements = movements),
      () => (this.acceptanceSnapshot = null),
    );
  }
}
