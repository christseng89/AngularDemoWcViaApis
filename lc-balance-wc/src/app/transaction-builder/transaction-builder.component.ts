import { Component, HostListener, Inject, InjectionToken, inject } from '@angular/core';
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
import { DocumentArrivalHintsService } from './document-arrival-hints.service';
import { PagedListState } from './paged-list-state';
import { describeApiError as describeApiErrorShared } from './api-error';
import {
  DECREASING_MOVEMENT_TYPES,
  EXPORT_FUNCTIONS,
  IMPORT_FUNCTIONS,
  InstrumentType,
  TransactionFunction,
  amountExceedsCurrencyDecimals,
  decimalPlacesForCurrency,
  displayStatus as displayStatusShared,
  groupThousands,
  statusBadgeClass as statusBadgeClassShared,
} from './balance-component.model';
import { AccountEntriesDialogComponent } from './account-entries-dialog.component';
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
 * Fetch-cap constants for the 3 `CatalogPickerService` instances this component owns (business
 * requirement 2026-08-19 — NOT the display page size, fixed at 5 inside `CatalogPickerService` itself).
 * Module-level `const`, not class members (desiger-comments.md F-04, 2026-08-19) — these values are
 * needed both inside the `@Component` decorator's own `providers` array (textually OUTSIDE the class
 * body, so a `private`/`static` class member wouldn't even be visible there) and inside the class as the
 * `catalogPageSize`/`parentPageSize`/`ibIndexPageSize` getters below (kept for the ~8 existing tests that
 * read `comp.catalogPageSize` etc. directly) — a plain module-scoped constant is visible to both without
 * any class-visibility question at all.
 */
const CATALOG_PAGE_SIZE = 100;
const PARENT_PAGE_SIZE = 100;
const IB_INDEX_PAGE_SIZE = 100;

/**
 * Injection tokens for the 3 `CatalogPickerService` instances (desiger-comments.md F-04, 2026-08-19) —
 * Angular's DI resolves a plain class-type provider (`providers: [CatalogPickerService]`) to exactly ONE
 * instance; this component genuinely needs THREE, each with a different `fetchSize`, so each needs its
 * own token rather than sharing the bare class as its own token. Provided via an explicit `useFactory`
 * entry in this component's own `@Component({ providers: [...] })` below (component-scoped, not
 * `providedIn: 'root'` — see `LookUpPanelService`'s own doc comment for why these 4 services must never
 * be app-wide singletons), each factory reading the matching page-size constant above and resolving
 * `BalanceComponentApiService` itself via `inject()` (safe here — `BalanceComponentApiService` is a real
 * `providedIn: 'root'` service, not a self-injection of this component, which IS a documented Angular DI
 * trap — see the constructor's own doc comment below for the pattern this deliberately avoids).
 */
const CATALOG_PICKER = new InjectionToken<CatalogPickerService>('TransactionBuilderComponent.catalogPicker');
const PARENT_PICKER = new InjectionToken<CatalogPickerService>('TransactionBuilderComponent.parentPicker');
const IB_INDEX_PICKER = new InjectionToken<CatalogPickerService>('TransactionBuilderComponent.ibIndexPicker');

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
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FormlyModule, IndexPickerComponent, AccountEntriesDialogComponent],
  templateUrl: './transaction-builder.component.html',
  styleUrl: './transaction-builder.component.scss',
  /**
   * desiger-comments.md F-04 (2026-08-19) — component-scoped providers for the 4 services that are
   * genuinely per-component-instance mutable state, not app-wide singletons (see each service's own
   * `@Injectable()` doc comment for why `providedIn: 'root'` would be wrong for them). This is the piece
   * the ORIGINAL F-04 attempt skipped entirely — it made these 4 (well, 6, counting the 3
   * `CatalogPickerService` instances) genuine constructor parameters with TS default values but
   * registered NO Angular provider anywhere, so production's own Ivy-compiled DI factory (which tries to
   * inject every constructor parameter by type/token regardless of default values) found nothing and
   * threw `NullInjectorError` on every single page load — confirmed live in the browser, not by any
   * static check. With a real provider entry here, Angular's DI now genuinely succeeds; the constructor's
   * own default values remain solely for the ~90 existing tests that construct this component via a
   * plain `new TransactionBuilderComponent(mockApi)` call, which never goes through this `providers`
   * array (or any other Angular machinery) at all — both paths coexist without conflict.
   */
  providers: [
    LookUpPanelService,
    InquireEventsService,
    DocumentArrivalHintsService,
    { provide: CATALOG_PICKER, useFactory: () => new CatalogPickerService(CATALOG_PAGE_SIZE, inject(BalanceComponentApiService)) },
    { provide: PARENT_PICKER, useFactory: () => new CatalogPickerService(PARENT_PAGE_SIZE, inject(BalanceComponentApiService)) },
    { provide: IB_INDEX_PICKER, useFactory: () => new CatalogPickerService(IB_INDEX_PAGE_SIZE, inject(BalanceComponentApiService)) },
  ],
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

  /**
   * Inquire Events (2026-08-17, user-requested, "使用OOD Design Patterns 新增 Inquire Events 功能") — a
   * second top-level mode, sibling to the existing function-picker/Maker/Checker/Look-Up workspace
   * (activeMode === 'PROCESSING', unchanged), reachable without first picking a business function
   * (unlike the existing "Look Up Current Balance" panel, which only renders once selectedFunction is
   * set — deliberately not changed here, out of scope for this feature).
   */
  activeMode: 'PROCESSING' | 'INQUIRE' = 'PROCESSING';

  selectedFunction: TransactionFunction | null = null;

  /**
   * PR-3 of the F-01 Strategy refactoring (`desiger-comments.md`, OOD review finding F-01) —
   * `selectedFunction`'s own derived `FunctionStrategy`, used by the A-series-exclusive call sites below
   * instead of reading the 11 boolean flags directly — those flags were fully removed from
   * `TransactionFunction`/the registry in PR-5, so this Strategy lookup is now the ONLY way to answer
   * any of these questions. Public (not `private`) since PR-5 — the template's own Checker-panel
   * bindings (deferSettlement's acknowledgment-only hint/button label) read this directly too.
   */
  get selectedFunctionStrategy() {
    return this.selectedFunction ? deriveFunctionStrategy(this.selectedFunction) : null;
  }

  /** Value of the function's subChoice (e.g. 'AMEND_INCREASE', or 'CONFIRMED' for B1/B2). */
  subChoiceValue = '';
  /**
   * B2 only (business requirement 2026-08-19, "Amount figure should > 0", follow-up clarification —
   * B2's own Amount field stays a plain positive magnitude; this Direction pick is what now carries
   * Increase-vs-Decrease instead of the amount's own sign). Not part of `model`/`BuilderModel` — it's
   * pure UI selection state, threaded into `submitRulesContext` for `validateSubmit()`'s own new
   * B2-only guard (submit-rules.ts) to read and turn into the actual signed wire amount via `patch`.
   */
  amendDirection: 'INCREASE' | 'DECREASE' | null = null;
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
  /**
   * How many raw candidates CatalogPickerService fetches from the server in ONE shot (business
   * requirement 2026-08-19) — NOT the display page size (fixed at 5 inside CatalogPickerService itself,
   * uniformly for every picker it backs). Bumped 10 -> 100 as part of the same fix: showing an accurate
   * "N total, qualified" figure requires knowing every candidate's own filter outcome up front, which
   * needs (almost) all of them fetched, not just the first page — see CatalogPickerService's own module
   * doc comment for the full reasoning. Delegates to the module-level `CATALOG_PAGE_SIZE` constant
   * (desiger-comments.md F-04, 2026-08-19 — see that constant's own doc comment) purely so every existing
   * `comp.catalogPageSize` test assertion keeps reading the identical public surface unchanged.
   */
  get catalogPageSize(): number {
    return CATALOG_PAGE_SIZE;
  }
  // catalogPicker (BAL-003, OOD/SOLID 8th pass — "Page by Page設計") and documentArrivalHints (BAL-003
  // 9th same-day pass, desiger-comments.md F-03 reassessment 2026-08-19, "只抽這個 session 新增的
  // paging/eligibility 狀態" — owns A4/A6/B4's own per-candidate LC Index "eligible outstanding Document
  // Arrival" hint maps) are both constructor PARAMETER properties (desiger-comments.md F-04, 2026-08-19)
  // — see the constructor's own doc comment below for why, and its own two parameters for their
  // construction. Declared there instead of here so TypeScript's parameter-property syntax can
  // auto-generate this same public `readonly` field declaration; a second one here would collide.
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
  /** Fetch-cap, not display page size — see catalogPageSize's own doc comment above (same module-level-constant reasoning, F-04). */
  get ibIndexPageSize(): number {
    return IB_INDEX_PAGE_SIZE;
  }
  // ibIndexPicker (BAL-003, OOD/SOLID 8th pass) is now a constructor parameter property — see the
  // constructor's own doc comment (F-04) and its own `ibIndexPicker` parameter.

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
   * Business requirement 2026-08-19 ("Page-by-Page Pagination Design Pattern" for every Primary AND
   * 2ndary Key Index, A3S's SG Index used as the worked example) — settleableBalances is a fully-loaded,
   * unpaginated in-memory array (same shape as sgsForArrival/payableMovements below), so this windows it
   * client-side rather than re-fetching per page — same "no per-page API call makes sense once everything
   * is already in memory" reasoning InquireEventsService.eventsPaging already established for the merged
   * Events table.
   */
  readonly settleableBalancesPaging = new PagedListState(10);

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
   * Business requirement 2026-08-19 ("Page-by-Page Pagination Design Pattern" for every Primary AND
   * 2ndary Key Index) — windows filteredPayableMovements (below) client-side, same reasoning as
   * settleableBalancesPaging/arrivalSgPaging. Shared by all three template call sites (A4/A6's own
   * unfiltered picker and B4's two search-filtered ones) — safe, since exactly one is ever visible for a
   * given selectedFunction, and when payableMovementSearch is '' (A4/A6's own case, which never wires a
   * search box) filteredPayableMovements already just returns payableMovements unfiltered.
   */
  readonly payableMovementsPaging = new PagedListState(10);
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
  /**
   * Business requirement 2026-08-19 ("Page-by-Page Pagination Design Pattern... A3S — Document Arrival
   * w/ Shipping Gtee used as the worked example: Primary Key = LC Number [already Page-by-Page via
   * parentPicker/catalogPicker], 2ndary Key = SG Number — this 2ndary Index should ALSO provide the same
   * Page-by-Page design when multiple Shipping Guarantees exist under one LC"). sgsForArrival is a
   * fully-loaded, unpaginated in-memory array (loadSgsForArrival() below), so this windows it client-side
   * — same reasoning as InquireEventsService.eventsPaging. If exactly ONE SG exists under the LC,
   * loadSgsForArrival()'s own pre-existing auto-pick (unaffected by this change — it reads the full,
   * unwindowed sgsForArrival) still selects it automatically; pagination only ever matters once more than
   * one SG exists, matching the business's own stated rule exactly.
   */
  readonly arrivalSgPaging = new PagedListState(10);
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
  /** Fetch-cap, not display page size — see catalogPageSize's own doc comment above (same module-level-constant reasoning, F-04). */
  get parentPageSize(): number {
    return PARENT_PAGE_SIZE;
  }
  // parentPicker (BAL-003, OOD/SOLID 8th pass) is now a constructor parameter property — see the
  // constructor's own doc comment (F-04) and its own `parentPicker` parameter.
  selectedParent: BalanceContract | null = null;
  exposureNature: 'ACTUAL' | 'MEMO' = 'ACTUAL';

  submitting = false;
  submitResult: any = null;
  submitError: string | null = null;
  actionBusy = false;
  /**
   * UX improvement, business-directed 2026-08-17: "After Release is successfully completed, the system
   * should automatically return to the same transaction function and reset the screen for a new
   * transaction." Set by `release()` right after it re-invokes `selectFunction()` on a successful
   * outcome (which is what actually performs the reset — this field only carries the brief confirmation
   * across that reset, since `selectFunction()` itself clears it to null like every other piece of
   * per-function state). Cleared by the very next `selectFunction()` call, whatever triggers it.
   */
  releaseSuccessHint: string | null = null;
  /**
   * analysis/contingent-liability-ledger.html (business-requested 2026-08-16, "Account Entries button +
   * pop-up dialog") — whichever movement's own contingentAccountEntry is currently shown in the dialog,
   * or null when the dialog is closed. Set by an explicit "Account Entries" button click, from either
   * the Maker Result panel (submitResult) or an Event Timeline row — deliberately NOT a fetch: the
   * movement object already carries its own server-derived, immutable entry (Design doc "Event-Level
   * Relationship" requirement — never recalculated from the current balance at inquiry time).
   */
  accountEntryDialogMovement: BalanceMovement | null = null;
  /**
   * 2026-08-18 (EARMARK/APPROVED status split) — companion to accountEntryDialogMovement:
   * `BalanceMovement` itself carries no `instrumentType` of its own (only its parent `BalanceContract`
   * does), but `displayStatus()`'s own EARMARK-vs-APPROVED decision needs it. Set alongside
   * `accountEntryDialogMovement` at every `openAccountEntryDialog()` call site, reset alongside it too.
   */
  accountEntryDialogInstrumentType: InstrumentType | null = null;
  /**
   * 2026-08-18, reviewer-caught bug fix — companion to accountEntryDialogMovement/
   * accountEntryDialogInstrumentType: `displayStatus()`'s own EARMARKING/EARMARKED-vs-PENDING/APPROVED
   * decision needs the Inquire Events 'primary'/'create'/'finalize' phase too (see
   * `isEarmarkFunction()`'s own doc comment, balance-component.model.ts, for the full A4-Sight-
   * Settlement bug this closes) — without it, opening the dialog from a 'finalize'-phase row (A4's own
   * completion of a Sight Document Arrival) would show the SAME wrong "EARMARKED" the merged table's own
   * fix corrects. `null`/omitted defaults `isEarmarkFunction()` to its non-'finalize' behavior, correct
   * for every call site that never splits anything (the Maker Result panel's own buttons — always a
   * freshly-PENDING movement, which `toEventRows()` can never phase as 'finalize' regardless).
   */
  accountEntryDialogPhase: 'primary' | 'create' | 'finalize' | null = null;
  /** A3 (Document Arrival (Sight)) only — set by approveArrival(), a Checker acknowledgment that does NOT call the backend release API. */
  arrivalApproved = false;

  /**
   * Bug fixed 2026-08-18, reviewer-reported live (LC U01 / IB E03 — Checker's own "Approve
   * (acknowledgment only)" button stayed clickable on an item already acknowledged, and clicking it
   * again 409'd as "already acknowledged", surfacing as "cannot be approved"): `arrivalApproved` alone
   * is only a per-session CLIENT flag, reset to `false` by `onSelectCheckerMovement()` every time an
   * item is (re-)picked — it says nothing about whether THIS item was already acknowledged in an
   * EARLIER session/page-load. B3's own `deferSettlementRequiresBackendAck` path calls the real,
   * persisted `acknowledge()` API (`selectedCheckerMovement.acknowledgedAt`/`acknowledgedBy` — see
   * `approveArrival()`'s own doc comment), so a Checker searching the SAME still-PENDING item again
   * later (by design — B3 never transitions status, see `guardSecondaryAction()`'s own doc comment on
   * the microservice side) always saw the button re-enabled regardless of that persisted state. This
   * getter combines both signals — the ephemeral session flag (still needed for plain A3, which has NO
   * backend acknowledgment at all, `deferSettlementRequiresBackendAck` false, so `acknowledgedAt` never
   * populates for it) and the real persisted field (closes the gap for B3 specifically) — so the button
   * correctly disables/relabels either way, and a stale second acknowledge attempt can no longer be
   * triggered from the UI.
   */
  get arrivalAlreadyApproved(): boolean {
    return this.arrivalApproved || !!this.selectedCheckerMovement?.acknowledgedAt;
  }

  /**
   * desiger-comments.md F-04 (2026-08-19, "three incompatible ways of constructing a dependency, in
   * one constructor") — every dependency below now uses the SAME construction style: a constructor
   * PARAMETER with a default value building the real thing, so `new TransactionBuilderComponent(mockApi)`
   * (the single-arg form 90+ existing tests across 4 spec files already use) keeps working completely
   * unmodified. `api` itself stays the one genuinely required parameter (no default — every other
   * default reads it).
   *
   * **This is a SECOND attempt at F-04** — the FIRST one (same day) shipped a hard, page-breaking
   * production regression: it made `lookUp`/`inquireEvents`/`catalogPicker`/`parentPicker`/
   * `ibIndexPicker`/`documentArrivalHints` genuine constructor parameters with TS default values, but
   * registered NO Angular provider anywhere for any of them. Production's own Ivy-compiled DI factory
   * tries to inject EVERY constructor parameter by type/token, unconditionally, regardless of whether a
   * TS default value exists — it found no provider for any of the six and threw `NullInjectorError` on
   * every single page load, confirmed live in the browser (user-caught: "用UI測 全部不能用?" / "用
   * BROWSER測 全部不能用?"), not by any static check (`tsc`/`ng build`/the 880-test suite all passed,
   * since Jest constructs this component via a plain `new` call that never touches Angular's own
   * compiled factory at all). That attempt was fully reverted. THIS attempt closes the actual gap the
   * first one skipped: `TransactionBuilderComponent`'s own `@Component({ providers: [...] })` above
   * registers a genuine, COMPONENT-SCOPED Angular provider for each of the six — Angular constructs
   * exactly ONE instance per `TransactionBuilderComponent` instance (destroyed when the component is,
   * never shared app-wide), and its own DI factory can now actually resolve every parameter below for
   * real. Researched against Angular's own official docs (angular.dev/guide/di) plus community
   * discussion of the specific "self-injection into a component's own provider factory" trap
   * (github.com/angular/angular/issues/51639, `NG0200: Circular dependency in DI`) before writing this —
   * see `LookUpPanelService`'s own doc comment for the one place that trap was a genuine risk here, and
   * how it was avoided (a call-time parameter instead of a constructor-time callback), not worked around
   * with `forwardRef()` or similar.
   *
   * `checkerActions`/`makerSubmit` are unchanged throughout both attempts — they were already correctly
   * `@Injectable({providedIn: 'root'})` singletons with a real provider Angular could already satisfy;
   * neither F-04 attempt touched them.
   *
   * The 3 `CatalogPickerService` parameters use `@Inject(TOKEN)` rather than plain type-based injection
   * — Angular resolves a class-type provider to exactly ONE shared instance per token, but this
   * component genuinely needs THREE (different `fetchSize` each), so each gets its own `InjectionToken`
   * (declared above, alongside its own `useFactory` provider entry) instead of sharing the bare class as
   * its own implicit token.
   */
  constructor(
    private readonly api: BalanceComponentApiService,
    private readonly checkerActions: CheckerActionsService = new CheckerActionsService(api),
    private readonly makerSubmit: MakerSubmitService = new MakerSubmitService(api),
    readonly lookUp: LookUpPanelService = new LookUpPanelService(api),
    readonly inquireEvents: InquireEventsService = new InquireEventsService(api),
    @Inject(CATALOG_PICKER) readonly catalogPicker: CatalogPickerService = new CatalogPickerService(CATALOG_PAGE_SIZE, api),
    @Inject(PARENT_PICKER) readonly parentPicker: CatalogPickerService = new CatalogPickerService(PARENT_PAGE_SIZE, api),
    @Inject(IB_INDEX_PICKER) readonly ibIndexPicker: CatalogPickerService = new CatalogPickerService(IB_INDEX_PAGE_SIZE, api),
    readonly documentArrivalHints: DocumentArrivalHintsService = new DocumentArrivalHintsService(api),
  ) {}

  /**
   * Inquire Events (2026-08-17) — top-level mode toggle, sibling to selectFunctionSide()'s own Import/
   * Export toggle. Closes any open Account Entries dialog when leaving Inquire mode, same "close before
   * the underlying data changes" convention lookUp.runLookup()'s own onBeforeLookup callback already
   * follows. LC Master Records Index (2026-08-19, Import LC; extended the same day to Export Confirmed
   * LC — both sides now share the same Index) — every time Inquire Events is (re-)entered, refresh the
   * Index for whichever side is currently selected (preserving whatever page/search the user last had —
   * loadIndex() with no argument re-fetches the CURRENT indexPaging.page) so a stale browse from an
   * earlier visit never lingers; a harmless no-op re-fetch when nothing has changed.
   */
  selectMode(mode: 'PROCESSING' | 'INQUIRE'): void {
    this.activeMode = mode;
    this.accountEntryDialogMovement = null;
    this.accountEntryDialogInstrumentType = null;
    this.accountEntryDialogPhase = null;
    if (mode === 'INQUIRE') {
      this.inquireEvents.loadIndex();
    }
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
    this.amendDirection = null;
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
    this.settleableBalancesPaging.reset();
    this.payableMovements = [];
    this.payableMovementSearch = '';
    this.payableMovementsPaging.reset();
    this.selectedPayMovement = null;
    this.arrivalApproved = false;
    this.submitResult = null;
    this.submitError = null;
    this.releaseSuccessHint = null;
    this.accountEntryDialogMovement = null;
    this.accountEntryDialogInstrumentType = null;
    this.accountEntryDialogPhase = null;
    this.sgsForArrival = [];
    this.arrivalSgPaging.reset();
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
    } else if (this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'REDEEM' && this.selectedContractSnapshot) {
      // Business instruction 2026-08-15 ("Amount default to SG Available Balance") — Confirmed Balance
      // ignores any OTHER redemption already reserved PENDING against this same SG; Available is what's
      // actually still redeemable right now (same distinction as the shgtRedeem.ts commitment-control fix).
      this.model.amount = this.selectedContractSnapshot.availableBalance;
    } else if (
      this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'SETTLE' &&
      this.model.instrumentType === 'EPLC_ACCEPTANCE' &&
      this.selectedContractSnapshot
    ) {
      // B5 only — kept symmetric with FULL_SETTLE/autoRedeemType above; unreachable in practice since B5
      // has no subChoice to re-trigger this with a contract already selected (refreshSelectedContractSnapshot() does the real work).
      this.model.amount = this.selectedContractSnapshot.availableBalance;
    }
    this.rebuildFields();
    if (!this.isCreatingMovement && !this.usesTwoFieldSearch) this.reloadCatalog();
    if (this.parentInstrumentType) this.onParentInstrumentTypeChange();
  }

  /**
   * Business instruction 2026-08-14 "pickup 時 Order by Reference 而且需要 Page by Page設計". BAL-003
   * (8th pass): thin wrapper over `catalogPicker.load()` — guard/tenorFamily/onLoaded (this picker's own
   * A4 payable-hint follow-up) are unchanged, only the fetch/populate/error body moved into the service.
   * Business requirement 2026-08-19 (fixing "Page 1/2 (12 total)" wrongly counting unfiltered candidates
   * — see CatalogPickerService's own module doc comment): no longer takes a `page` argument — a fresh
   * reload always fetches the full (capped) candidate batch and re-derives Page 1 of the QUALIFIED
   * result via the new `qualifies` callback; Prev/Next are now pure client-side windowing
   * (catalogPrevPage()/catalogNextPage() below), never a second reload.
   */
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
        // Business requirement 2026-08-19 ("B4 也是一樣的業務要求 (EARMARKING EVENTS ONLY) 差別是不分
        // SIGHT/USANCE") — B4 only (the one function with payableMovementInstrumentType set).
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
        // Business requirement 2026-08-19 ("A3S/A9 — LC Index Criteria") — A3S only.
        if (this.selectedFunctionStrategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg')) {
          this.documentArrivalHints.loadCatalogSgEligibility(items, () => {
            this.catalogPicker.total = this.filteredCatalogContracts.length;
          });
        }
      },
    });
  }

  /**
   * Business requirement 2026-08-19 ("A6 — LC Index Eligibility Criteria"): true for A6 specifically —
   * `settlesDocumentArrival` is also true for B4, but B4 resolves via the flat Catalog picker instead
   * (never reaches `parentPicker`/`filteredParentCatalog` at all, see B4's own registry doc comment), so
   * `sourceAlreadyReleasedBeforePick` (B4-only) is the safe disambiguator rather than relying on that
   * routing fact alone.
   */
  private get requiresEligibleParentDocumentArrival(): boolean {
    return (
      !!this.selectedFunctionStrategy?.checkerRelease.settlesDocumentArrival && !this.selectedFunctionStrategy?.checkerRelease.sourceAlreadyReleasedBeforePick
    );
  }

  /** Business-reported gap 2026-08-14 ("Why the U003 does not allow for Amendment?") — search resets to page 1 (reloadCatalog() itself always resets, via catalogPicker.load()'s own resetPaging() call). */
  onCatalogSearch(): void {
    this.reloadCatalog();
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

  /**
   * One-click select for A4 — sets both the LC and the specific pending
   * movement in one action (business-reported gap "select S001 IB03 or
   * S001 IB04 separately"). Deliberately does NOT call onSelectContract()
   * — that would kick off an async re-fetch of payableMovements that could
   * race with (and overwrite) the selection made here; everything needed
   * is already sitting in documentArrivalHints.catalogPayableMovements from the LC Index load.
   */
  onSelectFlattenedPayable(contractId: string, movementId: string): void {
    this.selectedContract = this.catalogPicker.contracts.find((c) => c.balanceContractId === contractId) ?? null;
    this.refreshSelectedContractSnapshot();
    this.payableMovements = this.documentArrivalHints.catalogPayableMovements.get(contractId) ?? [];
    this.payableMovementsLoading = false;
    this.payableMovementsPaging.total = this.payableMovements.length;
    this.payableMovementsPaging.page = 1;
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
    const ibs = this.documentArrivalHints.catalogPayableIbs.get(c.balanceContractId);
    if (!ibs?.length) return '';
    return ibs.length === 1 ? ` — ${ibs[0]}` : ` — ${ibs.length} pending: ${ibs.join(', ')}`;
  }

  /** Business requirement 2026-08-19: client-side windowing only, no reload — the full qualified set is already in memory (see CatalogPickerService's own module doc comment). */
  catalogPrevPage(): void {
    const page = this.catalogPicker.prevTarget();
    if (page !== null) this.catalogPicker.page = page;
  }

  catalogNextPage(): void {
    const page = this.catalogPicker.nextTarget();
    if (page !== null) this.catalogPicker.page = page;
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
   * plain 0-balance exclusion below — a PENDING Document Arrival already
   * drops availableBalance before Release (Design doc §6, earmark takes
   * effect immediately), so that heuristic alone would have been the wrong
   * signal to filter A4's own LC Index on.
   *
   * Business requirement 2026-08-19 ("A4 — LC Index Eligibility Criteria"): A4's own LC Index is now
   * genuinely eligibility-driven instead — only an LC with at least one still-PENDING A3/A3S Document
   * Arrival of its own (an entry in catalogPayableIbs, populated by loadPayableIbHints()) appears at
   * all, not simply every ACTIVE Sight LC. catalogPayableIbs is empty until that async fetch resolves,
   * so this list is (correctly) empty for one render tick right after a fresh reload, filling in once
   * hints land — reloadCatalog()'s own onLoaded hook re-syncs catalogPicker.total at that point too.
   */
  get filteredCatalogContracts(): BalanceContract[] {
    let list = this.catalogPicker.contracts;
    const tenorFilter = this.selectedFunction?.catalogTenorFilter;
    if (tenorFilter) {
      list = list.filter((c) => !c.tenorType || (tenorFilter === 'SIGHT' ? c.tenorType === 'SIGHT' : c.tenorType !== 'SIGHT'));
    }
    if (this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace) {
      return list.filter((c) => this.documentArrivalHints.catalogPayableIbs.has(c.balanceContractId));
    }
    // Business requirement 2026-08-19 ("B4 也是一樣的業務要求 (EARMARKING EVENTS ONLY) 差別是不分
    // SIGHT/USANCE") — B4 only. See catalogChildPayableIbs's own doc comment for why this is a
    // cross-contract check, unlike A4's own same-contract one right above.
    if (this.selectedFunction?.payableMovementInstrumentType) {
      return list.filter((c) => this.documentArrivalHints.catalogChildPayableIbs.has(c.balanceContractId));
    }
    // Business requirement 2026-08-19 ("A3S/A9 — LC Index Criteria" — "Only LC Numbers with an
    // outstanding SG Balance should be displayed... once SG Balance = 0, the LC Number should no
    // longer appear") — A3S only. Supersedes the generic 0-balance fallback below for this function,
    // since A3S's own movementType (UTILIZE) would otherwise fall through into it, filtering by the
    // LC's OWN Available Balance — the wrong signal, same class of gap A4's own exemption above already
    // fixed for a different reason. See catalogSgEligible's own doc comment (loadSgBalanceEligibility()).
    if (this.selectedFunctionStrategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg')) {
      return list.filter((c) => this.documentArrivalHints.catalogSgEligible.has(c.balanceContractId));
    }
    if (!this.model.movementType || !DECREASING_MOVEMENT_TYPES.has(this.model.movementType)) return list;
    return list.filter((c) => {
      const snap = this.catalogPicker.snapshots.get(c.balanceContractId);
      return !snap || snap.availableBalance !== '0';
    });
  }

  /** Business requirement 2026-08-19 — the current page's own slice of filteredCatalogContracts (the QUALIFIED set), not the raw fetched candidates. This is what the template's LC Index picker now iterates. */
  get pagedFilteredCatalogContracts(): BalanceContract[] {
    const start = (this.catalogPicker.page - 1) * this.catalogPicker.pageSize;
    return this.filteredCatalogContracts.slice(start, start + this.catalogPicker.pageSize);
  }

  /** Instrument/status changed (or first resolved) — reset selection and reload. */
  onParentInstrumentTypeChange(): void {
    this.selectedParent = null;
    // Business instruction 2026-08-15: EPLC_LC (Unconfirmed, MEMO) removed as a parent option — every
    // Acceptance is now exposureNature ACTUAL (real liability, rationale §7.6 Step 1).
    this.exposureNature = 'ACTUAL';
    this.loadParent();
  }

  /**
   * Business instruction 2026-08-14 "Page by Page設計" — fetches the parent candidate batch without
   * resetting the current parent selection. BAL-003 (8th pass): thin wrapper over `parentPicker.load()`
   * — the guard condition and every parameter below are unchanged, only the fetch/populate/error body
   * moved.
   *
   * Business-reported gap 2026-08-14 ("Why the U002, IB02 does not shown in A6?", "A7 should filter out LC
   * records Tenor = Sight") — same class of bug as A5's flat Catalog picker: filtering client-side AFTER
   * server pagination let a page of raw rows contain almost none of the eligible (Usance) tenor. A6/B4
   * (tenorTypeOptions set) and A7/B5 (catalogTenorFilter — an Acceptance never exists under a Sight LC) both
   * filter server-side (via tenorFamily); A8's SHGT parent (neither) stays unfiltered, same as before.
   *
   * Business requirement 2026-08-19 (fixing "Page 1/2 (12 total)" wrongly counting unfiltered candidates
   * — see CatalogPickerService's own module doc comment): no longer takes a `page` argument — Prev/Next
   * are now pure client-side windowing (parentPrevPage()/parentNextPage() below), never a second reload.
   */
  private loadParent(): void {
    this.parentPicker.load({
      guardFails: !this.parentInstrumentType,
      instrumentType: this.parentInstrumentType as InstrumentType,
      tenorFamily: this.parentTenorFamily,
      qualifies: () => this.filteredParentCatalog.length,
      onLoaded: (items) => {
        // Business requirement 2026-08-19 ("A6 — LC Index Eligibility Criteria") — A6 only, see
        // requiresEligibleParentDocumentArrival's own doc comment.
        if (this.requiresEligibleParentDocumentArrival) {
          this.documentArrivalHints.loadParentHints(items, () => {
            this.parentPicker.total = this.filteredParentCatalog.length;
          });
        }
        // Business requirement 2026-08-19 ("A3S/A9 — LC Index Criteria") — A9 only (the one function
        // whose amountVsAvailableDerivation is REDEEM).
        if (this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'REDEEM') {
          this.documentArrivalHints.loadParentSgEligibility(items, () => {
            this.parentPicker.total = this.filteredParentCatalog.length;
          });
        }
      },
    });
  }

  /** Business-reported gap 2026-08-14 ("Why the U002, IB02 does not shown in A6?") — search resets to page 1 (loadParent() itself always resets, via parentPicker.load()'s own resetPaging() call). */
  onParentSearch(): void {
    this.loadParent();
  }

  /** Business requirement 2026-08-19: client-side windowing only, no reload — the full qualified set is already in memory (see CatalogPickerService's own module doc comment). */
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
   * left unfiltered by tenor — SG can be issued under any tenor.
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
    //
    // Bug fixed 2026-08-18, reviewer-reported live ("A1 Issue Buyer's Usance 10000, A3 10000 w E01,
    // then A6 has no record shown" — reproduced identically for U01/B04 and U02/B01, see this file's
    // own CLAUDE.md decision log): A6/B4 (settlesDocumentArrival) were NOT covered by the bypass above
    // — they fell through into the same 0-balance exclusion filteredCatalogContracts() uses, even
    // though the exact same "remaining balance is irrelevant" reasoning applies to them too. A6/B4
    // finalize an ALREADY-earmarked PENDING Document Arrival/Present Docs record — that earmark is
    // exactly what drops the parent's own Available Balance, often all the way to 0 when a single
    // presentation draws the LC/Confirmation down completely (the common, expected case, not an edge
    // case). Excluding 0-balance parents made every such LC/Confirmation invisible to A6/B4's own
    // Parent LC picker — the more fully a Document Arrival used up the LC, the more certain this bug
    // was to hide it.
    // PR-4 of the F-01 Strategy refactoring (desiger-comments.md) — settlesDocumentArrival (shared with
    // A6, deliberately left on the old path by PR-3 until B-series had its own wiring) and
    // settleableBalanceIndex now read through the Strategy too; behavior unchanged.
    //
    // Business requirement 2026-08-19 ("A6 — LC Index Eligibility Criteria", "only LC Numbers that
    // still have outstanding EARMARKED events should be displayed... once no remaining, no longer
    // appear"): supersedes the plain 0-balance bypass above FOR A6 SPECIFICALLY — an eligible LC is one
    // with at least one still-outstanding (PENDING) A3/A3S Document Arrival of its own (an entry in
    // parentPayableIbs, populated by loadParent()'s own onLoaded hook), not simply any non-zero-balance
    // Usance LC. requiresEligibleParentDocumentArrival is false for B4 (sourceAlreadyReleasedBeforePick)
    // — B4 never reaches this getter at all in practice anyway, see its own doc comment — so this branch
    // is genuinely A6-only.
    if (this.requiresEligibleParentDocumentArrival) {
      return list.filter((c) => this.documentArrivalHints.parentPayableIbs.has(c.balanceContractId));
    }
    // Business requirement 2026-08-19 ("A3S/A9 — LC Index Criteria" — "Only LC Numbers with an
    // outstanding SG Balance should be displayed... once SG Balance = 0, the LC Number should no
    // longer appear") — A9 only (amountVsAvailableDerivation is REDEEM only for A9). Supersedes the
    // generic 0-balance fallback below, which would otherwise filter by the LC's OWN Available Balance
    // — the wrong signal, same class of gap A3S's own filteredCatalogContracts fix addresses. See
    // parentSgEligible's own doc comment (loadSgBalanceEligibility()).
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

  /** Business requirement 2026-08-19 — the current page's own slice of filteredParentCatalog (the QUALIFIED set), not the raw fetched candidates. This is what the template's Parent LC picker now iterates. */
  get pagedFilteredParentCatalog(): BalanceContract[] {
    const start = (this.parentPicker.page - 1) * this.parentPicker.pageSize;
    return this.filteredParentCatalog.slice(start, start + this.parentPicker.pageSize);
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
   * Business requirement 2026-08-19 ("Page-by-Page Pagination Design Pattern" for every Primary AND
   * 2ndary Key Index) — the current page's own slice of filteredPayableMovements, shared by all three
   * template call sites (A4/A6's own unpaginated picker, B4's two search-filtered ones — see
   * payableMovementsPaging's own doc comment for why one shared paging state is safe here).
   */
  get pagedFilteredPayableMovements(): any[] {
    const start = (this.payableMovementsPaging.page - 1) * this.payableMovementsPaging.pageSize;
    return this.filteredPayableMovements.slice(start, start + this.payableMovementsPaging.pageSize);
  }

  payableMovementsPrevPage(): void {
    const target = this.payableMovementsPaging.prevTarget();
    if (target) this.payableMovementsPaging.page = target;
  }

  payableMovementsNextPage(): void {
    const target = this.payableMovementsPaging.nextTarget();
    if (target) this.payableMovementsPaging.page = target;
  }

  /**
   * Business instruction 2026-08-15 ("Index Search") — the IndexPicker's own autoPickedHint text
   * ("picked automatically") fires purely off items.length === 1, but the actual auto-pick behavior
   * (loadPayableMovements()) only ever runs once, against the ORIGINAL unfiltered list at load time —
   * so narrowing to one match via search would show the hint without it being true. This re-runs that
   * same auto-pick whenever typing narrows filteredPayableMovements down to exactly one, keeping the
   * hint and the actual behavior in sync. Also resets the paging window to page 1 and recomputes its own
   * total against the NEW filtered length (business requirement 2026-08-19) — a stale page 2 from before
   * the search would otherwise show an empty window against a narrower filtered result set.
   */
  onPayableMovementSearchChange(value: string): void {
    this.payableMovementSearch = value;
    this.payableMovementsPaging.total = this.filteredPayableMovements.length;
    this.payableMovementsPaging.page = 1;
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
    if (!this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace) return '';
    const snap = this.catalogPicker.snapshots.get(c.balanceContractId);
    if (!snap || snap.pendingEarmarkTotal === '0') return '';
    const ibs = this.documentArrivalHints.catalogPayableIbs.get(c.balanceContractId);
    const label = ibs && ibs.length > 1 ? 'Total Pending' : 'Pending';
    return ` — ${label}: ${this.formatAmount(snap.pendingEarmarkTotal.replace('-', ''))}`;
  }

  /**
   * Thousand-separated display only (business instruction 2026-08-14 example: "Pending: 25,000") —
   * never used for any calculation or API payload, those stay plain decimal strings.
   *
   * Quality-report-balance.md Security Hotspot (SonarQube typescript:S5852): the original
   * implementation grouped digits via `/\B(?=(\d{3})+(?!\d))/g`, whose nested `(\d{3})+` quantifier
   * inside a lookahead backtracks quadratically on a long run of digits — flagged as a potential ReDoS
   * vector. Replaced with a plain linear scan (no regex at all) that walks the digit string once,
   * inserting a comma every 3 digits from the right — same output, no backtracking risk regardless of
   * input length.
   */
  private formatAmount(amount: string): string {
    const [whole, frac] = amount.split('.');
    const withCommas = groupThousands(whole);
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
   * Status display — **settled requirement, 2026-08-18** (business instruction, final locked-in form:
   * "Both Look Up Current Balance and Inquire Events must use exactly the same Status mapping logic...
   * do not get this wrong again"). Full mapping table — see `isEarmarkFunction()`'s own doc comment
   * (balance-component.model.ts) for the authoritative version and exactly which two functions qualify:
   *
   * | Function                  | Not Released | Released  |
   * |----------------------------|--------------|-----------|
   * | Import LC — A3 / A3S       | EARMARKING   | EARMARKED |
   * | Export Confirmed LC — B3   | EARMARKING   | EARMARKED |
   * | All other functions        | PENDING      | APPROVED  |
   *
   * The underlying API/domain status stays PENDING/RELEASED regardless of which label this shows — pure
   * display relabeling. `instrumentType`/`movementType` identify WHICH movement this status belongs to,
   * needed to decide between the two label pairs for BOTH PENDING and RELEASED alike; REJECTED/
   * CANCELLED/SUPERSEDED always pass through unchanged, all three params ignored for those. `phase`
   * (Inquire Events' own 'primary'/'create'/'finalize', see InquiredEvent's own doc comment) is required
   * to correctly exclude A4's own 'finalize' row for a Sight Document Arrival — see
   * `isEarmarkFunction()`'s own doc comment (balance-component.model.ts) for the full bug this closes.
   */
  /**
   * BAL-003 "Account Entries dialog" pilot (2026-08-19, desiger-comments.md — researched against
   * official Angular docs first) — the actual rule moved to a shared, exported pure function
   * (`displayStatus()`, balance-component.model.ts) so the new standalone
   * `AccountEntriesDialogComponent` can use the identical logic without re-deriving it; this stays a
   * thin delegation purely because ~20 existing test assertions and this component's own remaining 2
   * template call sites (Look Up Current Balance's Event Timeline, Inquire Events' merged table) still
   * read it by this name.
   */
  displayStatus(
    status: string,
    instrumentType?: InstrumentType | string | null,
    movementType?: string | null,
    phase?: 'primary' | 'create' | 'finalize' | null,
  ): string {
    return displayStatusShared(status, instrumentType, movementType, phase);
  }

  /** Same delegation, same reason — see `displayStatus()`'s own doc comment immediately above. */
  statusBadgeClass(
    status: string,
    instrumentType?: InstrumentType | string | null,
    movementType?: string | null,
    phase?: 'primary' | 'create' | 'finalize' | null,
  ): string {
    return statusBadgeClassShared(status, instrumentType, movementType, phase);
  }

  /**
   * Bug fixed 2026-08-19, reviewer-reported ("A2 — LC Amendment Increase: Incorrect Available Balance
   * Warning" — Amount 10000 against an LC with Available Balance 0 wrongly showed "exceeds Available
   * Balance... this will be rejected" for an AMEND_INCREASE, even though this function's own registry
   * help text already says "Increase always succeeds; Decrease is checked against Available Balance
   * (Design doc §6.2)"). Root cause: the balance box's own "exceeds Available Balance" warning
   * (`transaction-builder.component.html`) was never scoped by movementType at all — it fired for ANY
   * function once `selectedContractSnapshot` was loaded and the typed amount exceeded Available
   * Balance, including ISSUE/AMEND_INCREASE/CREATE/AMEND — movementTypes the microservice's own
   * `NO_CHECK_MOVEMENT_TYPES` (`service/balanceService.ts`) never runs a sufficiency check against at
   * all, so the warning was actively misleading (promising a rejection that would never happen) for
   * every one of them, not just A2 Increase — including B2 (EPLC_CONFIRMATION `AMEND`, a single signed
   * movementType with no client-side Increase/Decrease split), which has NO sufficiency check server-side
   * in either direction.
   *
   * Fix: gate the warning on `DECREASING_MOVEMENT_TYPES` (`balance-component.model.ts`) instead of
   * showing unconditionally — that set already mirrors the microservice's own checked-movementType union
   * (`UTILIZE_SHAPED_MOVEMENT_TYPES` + `OUTSTANDING_CAPPED_MOVEMENT_TYPES` + `AMEND_DECREASE`) exactly,
   * and is already used elsewhere in this file for the identical "don't offer/imply an action the server
   * will never actually check this way" purpose (filtering 0-balance contracts out of the pickers) — reused
   * here rather than re-deriving a second list. A1/A8's own ISSUE, A2/B2's own Increase, and every other
   * NO_CHECK movementType now correctly show no warning regardless of Available Balance; A2's own
   * AMEND_DECREASE, A3/A3S's UTILIZE, A6/B4's HONOUR/ACCEPT, A7/A9's SETTLE/REDEEM, and B5's
   * REIMBURSE/RECLASSIFY_OUT are all unaffected — `DECREASING_MOVEMENT_TYPES` already covered every one
   * of them before this fix, unchanged.
   */
  movementTypeChecksAvailableBalance(movementType?: string | null): boolean {
    return !!movementType && DECREASING_MOVEMENT_TYPES.has(movementType);
  }

  /**
   * analysis/contingent-liability-ledger.html — opens the Account Entries pop-up for one specific
   * movement. The movement's own contingentAccountEntry is already loaded (Submit response / Event
   * Timeline list) — this never issues its own fetch. `instrumentType` (2026-08-18) is required
   * alongside it purely for `displayStatus()`'s own EARMARK-vs-APPROVED decision — `BalanceMovement`
   * itself carries no `instrumentType` of its own, only its parent `BalanceContract` does, so every
   * call site must supply it explicitly (from whichever contract/function context it already has on
   * hand — see each call site's own comment for where that value comes from). `phase` (optional,
   * defaults to undefined) is the SAME Inquire Events 'primary'/'create'/'finalize' phase — required
   * only by the 2 call sites that pass an actual `InquiredEvent` row (Look Up's own Event Timeline,
   * Inquire Events' own "View" screen); every other call site (the Maker Result panel's 3 buttons)
   * omits it, correct since those are always a freshly-PENDING movement `toEventRows()` can never phase
   * as 'finalize' regardless — see `isEarmarkFunction()`'s own doc comment for the bug this closes.
   */
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

  /** Escape closes the Account Entries dialog, same as the backdrop click / Close button. */
  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.accountEntryDialogMovement) this.closeAccountEntryDialog();
  }

  /**
   * Thin template-binding wrapper (F-04, 2026-08-19) — the "Look Up" button used to bind directly to
   * `lookUp.runLookup()`, which closed the Account Entries dialog for free via a constructor-time
   * callback; that callback moved to a call-time parameter (see `LookUpPanelService`'s own doc comment),
   * so this wrapper supplies it explicitly. A template expression referencing `closeAccountEntryDialog`
   * bare (without a wrapper) would pass an unbound method reference, losing its own `this` — a real,
   * silent regression risk avoided by keeping the binding call as an actual method invocation here.
   */
  onLookUpClick(): void {
    this.lookUp.runLookup(() => this.closeAccountEntryDialog());
  }

  onSelectContract(contractId: string): void {
    this.selectedContract = this.catalogPicker.contracts.find((c) => c.balanceContractId === contractId) ?? null;
    // Business instruction 2026-08-15 ("B3 不須選 Sight/Usance 因為交易本身已經有此訊息了") — B3 only.
    // Sight/Usance is no longer a manual subChoice; derive it from the picked Confirmation's own
    // tenorType (declared once, at B1) instead of asking the Maker to re-pick it here.
    // PR-4 of the F-01 Strategy refactoring (desiger-comments.md) — movementTypeFromContractTenor now
    // reads through the Strategy instead of the raw flag; behavior unchanged.
    if (this.selectedFunctionStrategy?.movementDerivation.derivesMovementTypeFromTenor && this.selectedContract) {
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
    // PR-4 of the F-01 Strategy refactoring (desiger-comments.md) — settlesDocumentArrival (shared with
    // A6, deliberately left on the old path by PR-3 until B-series had its own wiring) now reads
    // through the Strategy too; behavior unchanged.
    if (this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace || this.selectedFunctionStrategy?.checkerRelease.settlesDocumentArrival) {
      this.loadPayableMovements(this.selectedContract?.balanceContractId);
    }
    if (this.selectedFunctionStrategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg')) this.loadSgsForArrival();
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
    this.arrivalSgPaging.reset();
    const lcNumber = this.selectedContract?.naturalKey.lcNumber;
    if (!lcNumber) return;
    this.sgsForArrivalLoading = true;
    // requireIssueReleased: true — business-reported gap 2026-08-18 ("There are function dependency, if
    // pending in previous event, then next event cannot be accessed") — an SG whose own A8 Issue hasn't
    // been Checker-Released yet shouldn't be redeemable via A3S.
    this.api.catalog('SHGT', 'ACTIVE', undefined, 1, 50, lcNumber, undefined, true).subscribe({
      next: (result) => {
        if (!result.items.length) {
          this.sgsForArrivalLoading = false;
          this.sgsForArrival = [];
          this.arrivalSgPaging.total = 0;
          return;
        }
        forkJoin(result.items.map((c) => this.api.getSnapshot(c.balanceContractId).pipe(catchError(() => of(null))))).subscribe((snapshots) => {
          this.sgsForArrivalLoading = false;
          this.sgsForArrival = result.items.filter((_, i) => {
            const snap = snapshots[i];
            return !!snap && snap.availableBalance !== '0';
          });
          this.arrivalSgPaging.total = this.sgsForArrival.length;
          this.arrivalSgPaging.page = 1;
          // UX 2026-08-14 "UX要做好 方便操作" — same "only one thing to pick, don't make the user pick it" pattern as loadPayableMovements().
          // Business requirement 2026-08-19: this auto-pick deliberately still reads the FULL (unwindowed)
          // sgsForArrival, not pagedSgsForArrival — "if LC S09 has only one outstanding SG, automatic
          // selection can remain" applies to the true total across all pages, not just page 1's own count.
          if (this.sgsForArrival.length === 1) this.onSelectArrivalSg(this.sgsForArrival[0].balanceContractId);
        });
      },
      error: () => {
        this.sgsForArrivalLoading = false;
        this.sgsForArrival = [];
        this.arrivalSgPaging.total = 0;
      },
    });
  }

  /** The current page's own slice of sgsForArrival — the template iterates this instead of sgsForArrival directly. */
  get pagedSgsForArrival(): BalanceContract[] {
    const start = (this.arrivalSgPaging.page - 1) * this.arrivalSgPaging.pageSize;
    return this.sgsForArrival.slice(start, start + this.arrivalSgPaging.pageSize);
  }

  arrivalSgPrevPage(): void {
    const target = this.arrivalSgPaging.prevTarget();
    if (target) this.arrivalSgPaging.page = target;
  }

  arrivalSgNextPage(): void {
    const target = this.arrivalSgPaging.nextTarget();
    if (target) this.arrivalSgPaging.page = target;
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
    this.payableMovementsPaging.reset();
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
        this.payableMovementsPaging.total = this.payableMovements.length;
        // UX 2026-08-14 "UX要做好 方便操作" — when there's only one thing to pick, don't make the user pick it.
        // Business requirement 2026-08-19: reads the FULL (unwindowed) payableMovements — "only one
        // candidate in total" auto-selects regardless of page size, same rule as arrivalSgPaging above.
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
          // record must have passed its OWN, genuine Checker Release before it can be picked here for
          // Honour/Accept, enforcing the 4-eyes check on the presentation itself as a real gate, not
          // just a courtesy. Basis changed 2026-08-18 ("所有交易要RELEASE過後 才能根據流程走下一個交易"):
          // B3 now genuinely RELEASEs on its own (status RELEASED), superseding the prior
          // acknowledgedAt-while-still-PENDING design — so B4's own candidate filter looks for
          // status === 'RELEASED' instead of 'PENDING' when this flag is set; A6's own equivalent
          // (still-PENDING A3 Document Arrivals) is unaffected, still filters on 'PENDING'.
          //
          // Bug fixed 2026-08-18, reviewer-reported live ("Export Confirmed LC Sight B4 Submit後 不應該
          //再出現 S01 E01 E02" — after B4 has already consumed a presentation, it must stop appearing
          // as a pickable candidate): status alone isn't enough once a presentation can be RELEASED
          // (EARMARKED) YET ALSO already fully consumed by an earlier B4 — an already-consumed record
          // never leaves PENDING or transitions again, so `status === 'RELEASED'` alone kept matching it
          // forever. Also exclude anything with `presentDocsConsumedAt` already set (see
          // BalanceMovement.presentDocsConsumedAt's own doc comment — set as a side effect of B4's own
          // compound release). This check is a no-op for A6 (its own candidates, plain A3 UTILIZEs,
          // never set presentDocsConsumedAt at all).
          // PR-4 of the F-01 Strategy refactoring (desiger-comments.md) — reads through the Strategy
          // instead of the raw flag; behavior unchanged.
          const requiresRelease = !!this.selectedFunctionStrategy?.checkerRelease.sourceAlreadyReleasedBeforePick;
          this.payableMovements = movementLists
            .flat()
            .filter((m: any) => m.movementType === wantedMovementType && m.status === (requiresRelease ? 'RELEASED' : 'PENDING') && !m.presentDocsConsumedAt);
          this.payableMovementsPaging.total = this.payableMovements.length;
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
    // PR-4 of the F-01 Strategy refactoring (desiger-comments.md) — settlesDocumentArrival (shared with
    // A6, deliberately left on the old path by PR-3 until B-series had its own wiring) now reads
    // through the Strategy too; behavior unchanged.
    if (this.selectedFunctionStrategy?.checkerRelease.settlesDocumentArrival && this.selectedPayMovement) {
      this.naturalKey.ibNumber = this.selectedPayMovement.sourceTransactionRef ?? '';
      // Business instruction 2026-08-15 ("Confirm LC Balance 控制" table review) — B4 only. A6 reads
      // naturalKey.ibNumber (its own instrumentType, IPLC_ACCEPTANCE, has ibNumber as a natural key
      // field); B4's instrumentType, EPLC_CONFIRMATION, does not — it carries its EB Number via
      // secondaryRef instead (secondaryRefLabel), same as old-B3 did. Set both so either kind of
      // consumer picks up the right one; harmless no-op for a function that doesn't use secondaryRef.
      if (this.selectedFunction?.secondaryRefLabel) {
        this.model.secondaryRef = this.selectedPayMovement.sourceTransactionRef ?? '';
      }
      this.model.amount = this.selectedPayMovement.amount;
      this.rebuildFields();
    }
    // A4 only (business instruction 2026-08-16, real Maker Submit): picking a NEW Document Arrival
    // clears any PREVIOUS Submit result so the Maker isn't left looking at a stale MAKER RESULT panel
    // for a DIFFERENT movement.
    if (this.selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace) {
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
        } else if (
          this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'SETTLE' &&
          this.model.instrumentType === 'EPLC_ACCEPTANCE'
        ) {
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
        } else if (this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'REDEEM') {
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
      this.loadIbIndex();
    }
    // A6 only (business instruction 2026-08-14 "A6 => Approved LC Balance and Create Acceptance Balance") —
    // Step 2: still-PENDING Document Arrivals under the picked parent LC, ready to be released + converted.
    // PR-4 of the F-01 Strategy refactoring (desiger-comments.md) — settlesDocumentArrival (shared with
    // A6, deliberately left on the old path by PR-3 until B-series had its own wiring) and
    // settleableBalanceIndex now read through the Strategy too; behavior unchanged.
    if (this.selectedFunctionStrategy?.checkerRelease.settlesDocumentArrival && this.selectedParent) {
      this.loadPayableMovements(this.selectedParent.balanceContractId);
    }
    // B5 only (business instruction 2026-08-16, "EB Index... those EB records with Acceptance
    // Balance") — Step 2: still-outstanding Due-from-Issuing-Bank/Acceptance records under the picked
    // Confirmation, ready to be settled.
    if (this.selectedFunctionStrategy?.selectionFlow.usesSettleableBalanceIndex && this.selectedParent) {
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
   * Step 2 of the "LC Index -> IB Index" cascading picker (business instruction 2026-08-14) — the
   * IPLC_ACCEPTANCE/EPLC_ACCEPTANCE/SHGT rows under the exact LC picked in Step 1. BAL-003 (8th pass):
   * thin wrapper over `ibIndexPicker.load()`, guard/params unchanged. Business requirement 2026-08-19
   * (fixing "Page 1/2 (12 total)" wrongly counting unfiltered candidates — see CatalogPickerService's own
   * module doc comment): no longer takes a `page` argument — Prev/Next are now pure client-side windowing
   * (ibIndexPrevPage()/ibIndexNextPage() below), never a second reload.
   */
  private loadIbIndex(): void {
    this.ibIndexPicker.load({
      guardFails: !this.model.instrumentType || !this.searchNaturalKey.lcNumber,
      instrumentType: this.model.instrumentType!,
      lcNumber: this.searchNaturalKey.lcNumber,
      qualifies: () => this.filteredIbIndexCatalog.length,
    });
  }

  /** Business requirement 2026-08-19: client-side windowing only, no reload — the full qualified set is already in memory (see CatalogPickerService's own module doc comment). */
  ibIndexPrevPage(): void {
    const page = this.ibIndexPicker.prevTarget();
    if (page !== null) this.ibIndexPicker.page = page;
  }

  ibIndexNextPage(): void {
    const page = this.ibIndexPicker.nextTarget();
    if (page !== null) this.ibIndexPicker.page = page;
  }

  /**
   * B5's own "EB Index" Step 2 (business instruction 2026-08-16) — still-outstanding candidates of
   * selectedFunction.instrumentType (EPLC_ACCEPTANCE, B5's own fixed type) under the given
   * Confirmation's own LC Number. Unlike loadIbIndex() above (which now also just does a single-shot
   * capped fetch, see CatalogPickerService's own 2026-08-19 module doc comment), this
   * loads its one catalog unpaginated (up to 50, same cap as loadPayableMovementsAcrossChildContracts())
   * and filters to Available > 0 — nothing left to settle isn't worth offering as a target. `types`
   * stays an array (rather than a single instrumentType) purely so the forkJoin below can stay written
   * generically — earlier in B5's history (when it briefly also covered the Sight case) this merged in
   * a second instrumentType via a `dualInstrumentFallback` field; removed as dead code
   * (Quality-report-balance.md BAL-101) once B5 reverted to Usance-only and the field was left
   * permanently unset.
   */
  private loadSettleableBalances(lcNumber: string): void {
    this.settleableBalancesPaging.reset();
    const fn = this.selectedFunction;
    if (!fn?.instrumentType) {
      this.settleableBalances = [];
      return;
    }
    const types: InstrumentType[] = [fn.instrumentType];
    this.settleableBalancesLoading = true;
    // requireIssueReleased: true — business-reported gap 2026-08-18 ("There are function dependency, if
    // pending in previous event, then next event cannot be accessed"). Safe here (unlike B4's own
    // loadPayableMovementsAcrossChildContracts() search below, which deliberately wants a still-PENDING
    // EPLC_EXAMINATION CREATE): an Acceptance/receivable's own CREATE is released as part of B4's own
    // compound Release, so any genuinely-settleable candidate already clears this by the time B5 looks.
    forkJoin(
      types.map((instrumentType) =>
        this.api.catalog(instrumentType, 'ACTIVE', undefined, 1, 50, lcNumber, undefined, true).pipe(
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
        this.settleableBalancesPaging.total = this.settleableBalances.length;
      });
    });
  }

  /**
   * Business requirement 2026-08-19 ("Page-by-Page Pagination Design Pattern" for every Primary AND
   * 2ndary Key Index) — the current page's own slice of settleableBalances (B5's own EB Index).
   */
  get pagedSettleableBalances(): Array<{
    balanceContractId: string;
    instrumentType: InstrumentType;
    ibNumber: string | null;
    availableBalance: string;
    currency: string;
  }> {
    const start = (this.settleableBalancesPaging.page - 1) * this.settleableBalancesPaging.pageSize;
    return this.settleableBalances.slice(start, start + this.settleableBalancesPaging.pageSize);
  }

  settleableBalancesPrevPage(): void {
    const target = this.settleableBalancesPaging.prevTarget();
    if (target) this.settleableBalancesPaging.page = target;
  }

  settleableBalancesNextPage(): void {
    const target = this.settleableBalancesPaging.nextTarget();
    if (target) this.settleableBalancesPaging.page = target;
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

  /** Business requirement 2026-08-19 — the current page's own slice of filteredIbIndexCatalog (the QUALIFIED set), not the raw fetched candidates. This is what the template's IB/SG Index picker now iterates. */
  get pagedFilteredIbIndexCatalog(): BalanceContract[] {
    const start = (this.ibIndexPicker.page - 1) * this.ibIndexPicker.pageSize;
    return this.filteredIbIndexCatalog.slice(start, start + this.ibIndexPicker.pageSize);
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
    if (this.selectedFunctionStrategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg')) {
      return this.selectedCheckerMovement.movementType === 'UTILIZE' && !!this.selectedCheckerMovement.businessEventId;
    }
    // PR-4 of the F-01 Strategy refactoring (desiger-comments.md) — the 3 flag reads below now read
    // through the Strategy instead of the raw flags; behavior unchanged, including the ordering (B4's
    // own settlesDocumentArrival branch below always matches before createsIssuingBankReceivableOnHonour
    // is reached, per this method's own existing doc comment).
    if (this.selectedFunctionStrategy?.movementDerivation.amountVsAvailableDerivation === 'SETTLE') {
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
    if (this.selectedFunctionStrategy?.checkerRelease.settlesDocumentArrival) {
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
    if (this.selectedFunctionStrategy?.compoundSubmission.possibleShapes.includes('confirmationHonourWithReceivable')) {
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
      !!(
        this.selectedFunctionStrategy?.checkerRelease.deferSettlement ||
        this.selectedFunctionStrategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg')
      )
    );
  }

  /** Drives the Checker Release/Approve button's label — kept as one getter so it can never drift from what checkerAct() actually does (see its own doc comment). */
  get checkerActionButtonLabel(): string {
    if (this.checkerBusy) return 'Working…';
    if (this.selectedFunctionStrategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg') && this.isCheckerCompoundOwnSubmission) {
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
    // F-04 (2026-08-19) — onBeforeLookup moved from LookUpPanelService's own constructor to a call-time
    // parameter on syncFrom()/runLookup() (see LookUpPanelService's own doc comment); every call site
    // that used to get this for free now supplies it explicitly.
    this.lookUp.syncFrom(lcNumber, this.model.instrumentType, () => this.closeAccountEntryDialog());
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
      this.selectedFunctionStrategy?.checkerRelease.deferSettlement &&
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
   * UX improvement, business-directed 2026-08-17: "once the user clicks Submit, all input fields must
   * become protected / read-only... Any subsequent change must be performed through the appropriate
   * follow-up transaction or amendment function, rather than modifying the submitted transaction
   * directly. Apply the same behavior consistently across A1–A9 and B1–B5." Locked on `submitResult`
   * being set (a real movement now exists — whether the overall Submit fully succeeded or a later
   * compound leg failed after the primary one already posted, per `applyMakerSubmitOutcome()`'s own
   * partial-failure case), not merely on the Submit click itself: a validation failure with no movement
   * created (`submitError` only, `submitResult` still null) must leave the form editable so the Maker
   * can correct it and resubmit — locking then would contradict the same instruction's own "review in
   * View / Read-Only Mode" framing, which presumes something real was actually submitted. `submitA4()`
   * (A4's own dedicated Maker-Submit action) sets `submitResult` on success exactly the same way, so
   * this applies to it for free with no separate wiring.
   */
  get formLocked(): boolean {
    return !!this.submitResult;
  }

  /**
   * Business requirement 2026-08-19 ("A2–A9 / B2–B5 — No Eligible Records") — true for every function
   * except A1/B1 (LC Issue / Confirm LC), which create a brand-new Logical Contract with no existing
   * target to pick at all; every other function operates on (or hangs off) an existing record, so the
   * "protect fields / disable Submit until an eligible record is selected" gate applies to it. Pure
   * derivation, same "A1/B1 structurally never populate selectedParent/selectedContract" boundary
   * `carriedCurrency` already uses elsewhere in this file.
   */
  get requiresEligibleTarget(): boolean {
    return !!this.selectedFunction && !(policy.isCreatingMovement(this.model) && !policy.hasParent(this.model));
  }

  /**
   * See `hasEligibleTargetSelected()`'s own doc comment (submit-rules.ts) for the full per-function
   * rule — re-derived from the same Strategy fields `validateSubmit()`/`buildSubmitRequest()` already
   * use for their own "pick a record first" guards, but independent of typed field VALUES (Amount/
   * Currency/etc.) and of `validateSubmit()`'s own call path (A4's `submitA4()` never calls it at all,
   * but still needs this same gate).
   */
  get hasEligibleTargetSelected(): boolean {
    return hasEligibleTargetSelectedRule(this.submitRulesContext);
  }

  /** A2–A9/B2–B5's own currently-active picker (Parent LC for a `hasParent` function, else the flat Catalog) — whichever one determines "are there any eligible records at all" for the message below. Public — the template reads it directly to choose between the `.tb-error`/`.tb-hint` severity. */
  get eligibleCandidateCount(): number {
    return policy.hasParent(this.model) ? this.parentPicker.total : this.catalogPicker.total;
  }

  /**
   * Business requirement 2026-08-19 — "Display a clear message such as: 'No eligible records available
   * for this transaction.'" shown specifically when the active picker's own qualified candidate count
   * is genuinely zero; a milder prompt otherwise (candidates exist, e.g. the LC Index itself, but the
   * function's own Step 2 — a specific pending record/SG/Acceptance — hasn't been picked yet). `null`
   * once `hasEligibleTargetSelected` is true, or for A1/B1 (`requiresEligibleTarget` false).
   */
  get noEligibleRecordsMessage(): string | null {
    if (!this.requiresEligibleTarget || this.hasEligibleTargetSelected) return null;
    return this.eligibleCandidateCount === 0
      ? 'No eligible records available for this transaction.'
      : 'Pick an eligible record from the list below to continue.';
  }

  /** Combines the post-Submit lock (`formLocked`) with the new pre-Submit "no eligible record selected yet" lock — `displayFields` below reads this one flag rather than two separate conditions. */
  get fieldsLocked(): boolean {
    return this.formLocked || (this.requiresEligibleTarget && !this.hasEligibleTargetSelected);
  }

  /**
   * Business requirement 2026-08-19 ("Submit Button Enablement — A1–A9 / B1–B5" — "The Submit button
   * should be enabled only when all mandatory fields have been entered and contain valid values.").
   * Unlike `requiresEligibleTarget`/`hasEligibleTargetSelected` above, this applies to EVERY function
   * including A1/B1 — reuses the exact same `validateSubmit()` guard sequence a real Submit click
   * already runs, called here purely for its `error` result (never applying the `patch` it also
   * returns — that stays the click-time `validateSubmit()` wrapper's own job) so this stays
   * byte-consistent with what a click would actually do rather than a second, independently-maintained
   * "is the form valid" check. `hasEligibleTargetSelected` is ALSO required — not merely implied —
   * because `validateSubmit()` alone never checks the generic flat-Catalog/two-field-search "a contract
   * must be picked" case (that guard lives in `buildSubmitRequest()` instead, which only ever runs
   * AFTER `validateSubmit()` already passed); `hasEligibleTargetSelected` already reproduces that same
   * condition (see its own doc comment above), so combining the two here covers exactly the same
   * ground the real `submit()` → `buildSubmitRequest()` call chain does, with zero side effects.
   */
  get isSubmitReady(): boolean {
    return this.hasEligibleTargetSelected && validateSubmitRules(this.submitRulesContext).error === null;
  }

  /**
   * Template binds to this instead of `fields` directly, so the live form flips to
   * `toReadOnlyFields()` (BAL-101/Decorator, already built for Inquire Events' own read-only
   * reconstruction — reused here rather than duplicated) the instant `fieldsLocked` goes true, with no
   * change needed at any of `rebuildFields()`'s own call sites.
   */
  get displayFields(): FormlyFieldConfig[] {
    return this.fieldsLocked ? toReadOnlyFields(this.fields) : this.fields;
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
      amendDirection: this.amendDirection,
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
   * B3's own former exception here (deferSettlementRequiresBackendAck, a real backend acknowledge()
   * call) was REMOVED 2026-08-18 (business instruction, "所有交易要RELEASE過後 才能根據流程走下一個交易")
   * — B3 no longer sets deferSettlement at all, so checkerAct() never routes it through this method any
   * more; it uses the standard release()/reject() Checker path directly instead. A3 is this method's
   * only caller now.
   */
  approveArrival(): void {
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
   * plus one call site's own optional follow-up (`syncLookupToContext()`) — same "guard/branch logic
   * unchanged, only the repeated body moves" convention as `loadPagedCatalog`/`loadSnapshotAndMovements`
   * above. WHICH release/reject/cancel call to make, in what order, and under what business condition is
   * completely untouched by this helper — every `if` branch below still decides that for itself.
   *
   * `opts.reloadPayables`/`reloadPayableMovementsAfterCompound()` (A6/B4's own in-place payable-list
   * refresh after a compound release) were removed 2026-08-17 — see `release()`'s own doc comment for
   * why: superseded by the auto-reset UX, which now bypasses this whole method for every genuine
   * `'released'` outcome, so the flag could never fire again (BAL-101-style dead-code removal).
   */
  private finishCheckerAction(res: any, opts: { syncLookup?: boolean } = {}): void {
    this.actionBusy = false;
    this.submitResult = res;
    this.refreshSelectedContractSnapshot();
    this.syncCheckerToContext();
    if (opts.syncLookup) this.syncLookupToContext();
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
   *
   * UX improvement, business-directed 2026-08-17: "After Release is successfully completed, the system
   * should automatically return to the same transaction function and reset the screen for a new
   * transaction." Only a genuine `'released'` outcome (the plain and every compound-release case —
   * `applyCheckerActionOutcome()`'s own `finishCheckerAction()` path) triggers the reset; a
   * `documentArrivalAcknowledged` outcome (A3S only — the SG redemption is genuinely released, but the
   * Document Arrival record ITSELF stays PENDING for A4/A6 to finalize later, so this isn't a completed
   * transaction to reset away from yet) is deliberately left on its existing `applyCheckerActionOutcome()`
   * path (`arrivalApproved = true`, snapshot/checker/SG-picker refresh) unchanged — same reasoning
   * `reject()`/`deleteMakerPending()` (also unchanged) already apply: the business instruction named
   * Release specifically, not every Checker action. The reset itself re-invokes `selectFunction()` on
   * the SAME function rather than running the normal post-release syncs — reusing the exact reset
   * `selectFunction()` already performs (every per-function field, the natural key, every picker,
   * `submitResult`/`submitError`) is simpler and safer than running those syncs and immediately
   * discarding the result.
   */
  release(): void {
    if (!this.submitResult?.movementId) return;
    this.actionBusy = true;
    this.submitError = null;
    const fn = this.selectedFunction;
    this.checkerActions.release(this.buildCheckerActionContext()).subscribe((outcome) => {
      if (fn && outcome.kind === 'released') {
        this.actionBusy = false;
        this.selectFunction(fn);
        this.releaseSuccessHint = `Release completed (movement ${outcome.result.movementId}) — screen reset for a new ${fn.code} (${fn.label}) transaction.`;
        return;
      }
      this.applyCheckerActionOutcome(outcome);
    });
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
    this.finishCheckerAction(outcome.result, { syncLookup: outcome.syncLookup });
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
