import { Injectable } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot } from './balance-component-api.service';
import { InstrumentType, TransactionFunction } from './balance-component.model';
import { PagedListState } from './paged-list-state';
import { FunctionStrategy } from './function-strategy';

/**
 * Outcome of picking a still-PENDING/RELEASED "payable movement" (A4/A6/B4's own Step-2 "2ndary Index" —
 * `selectPayMovement()`/`onPayableMovementSearchChange()` below) — the service owns `selectedPayMovement`
 * itself directly (assigned before this is even built), but the FOUR further consequences
 * (`naturalKey.ibNumber`/`model.secondaryRef`/`model.amount`/`rebuildFields()`/clearing `submitResult` —
 * A6/B4's own "carry and protect" rule and A4's own "picking a new item clears the stale MAKER RESULT
 * panel" rule) all read/write component-owned state this service deliberately does not hold, per
 * `PickerSelectionService`'s own class doc comment. Every field but `selectedPayMovement` is optional —
 * `undefined` means "this call site never touches it", never "clear it" — matching the same convention
 * `MakerSubmitOutcome.secondary` already established.
 */
export interface PayMovementSelectionOutcome {
  readonly selectedPayMovement: BalanceMovement | null;
  readonly naturalKeyIbNumber?: string;
  readonly modelSecondaryRef?: string;
  readonly modelAmount?: string;
  readonly needsRebuildFields: boolean;
  readonly clearsSubmitResult: boolean;
}

/** Outcome of picking a row from B5's own "EB Index" (`selectSettleableBalance()` below) — a synthetic `BalanceContract` shape the caller sets as its own `selectedContract`, plus the `ibNumber` it carries into `searchNaturalKey`. */
export interface SettleableBalanceSelectionOutcome {
  readonly instrumentType: InstrumentType;
  readonly contract: BalanceContract;
  readonly ibNumber: string;
}

/**
 * BAL-003 (desiger-comments.md, 2026-08-19 — researched against official Angular docs first, see
 * `TransactionBuilderComponent`'s own F-04 doc comment for the citation) — the three "2ndary Index"
 * cascading-picker subsystems A3S/B5/A4-A6-B4 each drive once their own Step-1 LC/Parent is picked:
 * A3S's own SG picker (`sgsForArrival`), B5's own EB Index (`settleableBalances`), and A4/A6/B4's shared
 * "still-PENDING/RELEASED payable movement" picker (`payableMovements`). Previously ~300 lines of
 * `TransactionBuilderComponent`'s own state + `loadXxx()`/`onSelectXxx()` methods.
 *
 * **Deliberately does NOT own `onSelectContract()`/`onSelectParent()`/`onSelectIbIndex()` themselves** —
 * an earlier same-session investigation (see the "BAL-003 — the three paginated pickers' load-and-page
 * bookkeeping" decision-log entry) found those three Step-1 handlers read/write `model`/`naturalKey`/
 * `selectedContract`/`selectedParent` far too pervasively to extract without moving those fields too — a
 * much larger blast radius than this pass's own approved scope. This service instead owns exactly the
 * state and load/select logic that is genuinely exclusive to the THREE Step-2 pickers, called by the
 * component's own (unchanged, still-on-component) `onSelectContract()`/`onSelectParent()` at the points
 * they already used to call the plain methods this service now provides.
 *
 * **Dependency Inversion, same shape as `CheckerActionsService`/`MakerSubmitService`**: every method that
 * would otherwise need to write back to `model`/`naturalKey`/`submitResult`/call `rebuildFields()` (all
 * component-owned) instead either (a) takes the read-only values it needs as plain parameters — this
 * service has only 3 narrow "what do I need to know" surfaces, not one large shared Context interface,
 * since each of the 3 pickers is independent of the other two — or (b) returns/passes-forward an Outcome
 * object (`PayMovementSelectionOutcome`/`SettleableBalanceSelectionOutcome`) the CALLER applies to its own
 * state, exactly mirroring `CheckerActionOutcome`/`MakerSubmitOutcome`. An async chain that needs to
 * trigger a component-owned side effect it doesn't otherwise return a value for (`rebuildFields()` after
 * an SG snapshot loads) takes an explicit `onUpdated: () => void` callback instead — the same pattern
 * `LookUpPanelService.runLookup()`'s own `onBeforeLookup` callback already established for an identical
 * "service needs to trigger a side effect it doesn't own" situation.
 *
 * **`arrivalSgRedeemAmount`/`arrivalSgRedeemType`/`arrivalSgRemaining` deliberately stayed ON THE
 * COMPONENT**, not moved here — all three are genuinely derived from BOTH this service's own
 * `arrivalSgSnapshot` AND the component-owned `model.amount` (the typed Bill Amount), so moving them here
 * would only relocate the coupling, not remove it, and would additionally force every template call site
 * to pass `model.amount` through as an argument for no real benefit. The component's own three getters
 * read `this.pickerSelection.arrivalSgSnapshot` directly — a legitimate cross-cutting combinator, the same
 * class as `carriedCurrency`/`arrivalAlreadyApproved` already staying on the component for the identical
 * reason.
 *
 * **Action methods (`onSelectArrivalSg`/`onSelectSettleableBalance`/`onSelectPayMovement`/
 * `onPayableMovementSearchChange`/every `xxxPrevPage()`/`xxxNextPage()`) stay as one-line wrapper methods
 * on the component**, delegating into this service's own like-named methods — matching
 * `catalogPrevPage()`/`catalogNextPage()`'s own already-established precedent (`CatalogPickerService`,
 * BAL-003 8th pass) of keeping the template's own action bindings unchanged even once the underlying state
 * moves to a service; only the STATE bindings (`[items]`/`[loading]`/`[selectedId]`/`[page]`/`{{ }}`
 * interpolations) needed a `pickerSelection.` prefix added in the template.
 *
 * `@Injectable()`, no `providedIn` (desiger-comments.md F-04, 2026-08-19) — genuinely per-component-
 * instance mutable state (three pickers' own results), same reasoning `LookUpPanelService`/
 * `DocumentArrivalHintsService`/`InquireEventsService` already carry; `providedIn: 'root'` would wrongly
 * make Angular hand out ONE shared instance app-wide. Registered as a component-scoped provider in
 * `TransactionBuilderComponent`'s own `@Component({ providers: [...] })` array.
 */
@Injectable()
export class PickerSelectionService {
  constructor(private readonly api: BalanceComponentApiService) {}

  // ---------------------------------------------------------------------------------------------------
  // A3S (Document Arrival w/ Shipping Gtee) — Step 2: the picked LC's own outstanding SHGT records.
  // ---------------------------------------------------------------------------------------------------

  sgsForArrival: BalanceContract[] = [];
  sgsForArrivalLoading = false;
  readonly arrivalSgPaging = new PagedListState(10);
  selectedArrivalSg: BalanceContract | null = null;
  arrivalSgSnapshot: BalanceSnapshot | null = null;

  /** The current page's own slice of `sgsForArrival` — the template iterates this instead of `sgsForArrival` directly. */
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
   * Business instruction 2026-08-14 ("When SG Full_redemp then it should no longer available from
   * Document Arrival w/ Shipping Gtee") — a fully redeemed SG's own `BalanceContract.status` stays ACTIVE
   * (nothing in this design ever transitions a contract to CLOSED just because its balance hit 0), so the
   * only reliable signal that it has nothing left is its own live snapshot showing 0 Available — same
   * "0-balance exclusion" principle every other picker in this app already applies. `requireIssueReleased:
   * true` — business-reported gap 2026-08-18 ("There are function dependency, if pending in previous
   * event, then next event cannot be accessed") — an SG whose own A8 Issue hasn't been Checker-Released
   * yet shouldn't be redeemable via A3S. `onUpdated` fires once, at the point the auto-picked SG's own
   * snapshot finishes loading (or immediately, if nothing was auto-picked) — the caller's own
   * `rebuildFields()`, since Formly's field config depends on `arrivalSgSnapshot`.
   */
  loadSgsForArrival(lcNumber: string | undefined, onUpdated: () => void): void {
    this.selectedArrivalSg = null;
    this.arrivalSgSnapshot = null;
    this.sgsForArrival = [];
    this.arrivalSgPaging.reset();
    if (!lcNumber) return;
    this.sgsForArrivalLoading = true;
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
          // UX 2026-08-14 "UX要做好 方便操作" — same "only one thing to pick, don't make the user pick
          // it" pattern as `loadPayableMovements()` below. Reads the FULL (unwindowed) `sgsForArrival`,
          // not `pagedSgsForArrival` — "if this LC has only one outstanding SG, automatic selection can
          // remain" applies to the true total across all pages, not just page 1's own count.
          if (this.sgsForArrival.length === 1) this.selectArrivalSg(this.sgsForArrival[0].balanceContractId, onUpdated);
        });
      },
      error: () => {
        this.sgsForArrivalLoading = false;
        this.sgsForArrival = [];
        this.arrivalSgPaging.total = 0;
      },
    });
  }

  /**
   * Business instruction 2026-08-15 ("SG redemption should support partial redemption... Bill Amount =
   * actual Document Arrival amount, freely typed") — only fetches the picked SG's CURRENT snapshot (not
   * the stale Catalog row) so the component's own `arrivalSgRedeemAmount`/`arrivalSgRedeemType` compute
   * against a live outstanding figure; Bill Amount itself (component-owned `model.amount`) is untouched.
   */
  selectArrivalSg(contractId: string, onUpdated: () => void): void {
    this.selectedArrivalSg = this.sgsForArrival.find((c) => c.balanceContractId === contractId) ?? null;
    this.arrivalSgSnapshot = null;
    if (!this.selectedArrivalSg) {
      onUpdated();
      return;
    }
    this.api.getSnapshot(this.selectedArrivalSg.balanceContractId).subscribe({
      next: (snapshot) => {
        this.arrivalSgSnapshot = snapshot;
        onUpdated();
      },
      error: () => {
        this.arrivalSgSnapshot = null;
        onUpdated();
      },
    });
  }

  // ---------------------------------------------------------------------------------------------------
  // B5 (Settlement — Reimbursement / Maturity) — Step 2: the picked Confirmation's own "EB Index"
  // (still-outstanding Due-from-Issuing-Bank/Acceptance records).
  // ---------------------------------------------------------------------------------------------------

  settleableBalances: Array<{
    balanceContractId: string;
    instrumentType: InstrumentType;
    ibNumber: string | null;
    availableBalance: string;
    currency: string;
  }> = [];
  settleableBalancesLoading = false;
  readonly settleableBalancesPaging = new PagedListState(10);

  /** The current page's own slice of `settleableBalances`. */
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

  /**
   * B5's own "EB Index" Step 2 (business instruction 2026-08-16) — still-outstanding candidates of the
   * given `instrumentType` (B5's own fixed `EPLC_ACCEPTANCE`) under the given Confirmation's own LC
   * Number, filtered to Available > 0. `requireIssueReleased: true` — business-reported gap 2026-08-18 —
   * safe here since an Acceptance/receivable's own CREATE is released as part of B4's own compound
   * Release, so any genuinely-settleable candidate already clears this by the time B5 looks.
   */
  loadSettleableBalances(lcNumber: string, instrumentType: InstrumentType | undefined): void {
    this.settleableBalancesPaging.reset();
    if (!instrumentType) {
      this.settleableBalances = [];
      return;
    }
    this.settleableBalancesLoading = true;
    forkJoin([
      this.api.catalog(instrumentType, 'ACTIVE', undefined, 1, 50, lcNumber, undefined, true).pipe(
        map((result) => result.items.map((c) => ({ contract: c, instrumentType }))),
        catchError(() => of([] as { contract: BalanceContract; instrumentType: InstrumentType }[])),
      ),
    ]).subscribe((lists) => {
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

  /** Pick handler for the "EB Index" picker above — resolves to whichever real instrumentType that specific candidate actually is (currently always `EPLC_ACCEPTANCE`, B5's own fixed type). Returns `null` for an id that no longer matches (defensive — the caller's own template only ever offers ids from this exact list). */
  selectSettleableBalance(balanceContractId: string, parentLcNumber: string | undefined): SettleableBalanceSelectionOutcome | null {
    const picked = this.settleableBalances.find((s) => s.balanceContractId === balanceContractId);
    if (!picked) return null;
    return {
      instrumentType: picked.instrumentType,
      contract: {
        balanceContractId: picked.balanceContractId,
        instrumentType: picked.instrumentType,
        naturalKey: { lcNumber: parentLcNumber ?? '', ibNumber: picked.ibNumber },
        status: 'ACTIVE',
        currency: picked.currency,
      } as BalanceContract,
      ibNumber: picked.ibNumber ?? '',
    };
  }

  // ---------------------------------------------------------------------------------------------------
  // A4 (Sight Settlement) / A6 (Acceptance, Usance) / B4 (Honour / Acceptance) — Step 2: the picked
  // LC/Confirmation's own still-PENDING (or, for B4, still-RELEASED-but-not-yet-consumed) presentation.
  // ---------------------------------------------------------------------------------------------------

  payableMovements: BalanceMovement[] = [];
  payableMovementsLoading = false;
  selectedPayMovement: BalanceMovement | null = null;
  payableMovementSearch = '';
  readonly payableMovementsPaging = new PagedListState(10);

  /** Business instruction 2026-08-15 ("Index Search") — client-side filter, since `payableMovements` is a fully-loaded, unpaginated array (one `listMovements()` call per contract, not server-paginated). */
  get filteredPayableMovements(): BalanceMovement[] {
    const q = this.payableMovementSearch.trim().toLowerCase();
    if (!q) return this.payableMovements;
    return this.payableMovements.filter((m) => (m.sourceTransactionRef ?? '').toLowerCase().includes(q));
  }

  /** The current page's own slice of `filteredPayableMovements` — shared by all three template call sites (A4/A6's own unfiltered picker and B4's two search-filtered ones), same "exactly one is ever visible for a given selectedFunction" safety this app's own `CatalogPickerService`-backed pickers already rely on. */
  get pagedFilteredPayableMovements(): BalanceMovement[] {
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
   * Business instruction 2026-08-14 ("pickup LC then pickup IB Number... Amount will be captured...
   * without further input") — A4/A6's own plain `listMovements(contractId)` path; routes to
   * `loadPayableMovementsAcrossChildContracts()` instead for B4 (`selectedFunction.
   * payableMovementInstrumentType` set — B3's own CREATE lives on a SEPARATE child `EPLC_EXAMINATION`
   * contract, not on the Confirmation contract itself, so `listMovements(contractId)` would never find
   * it). `onAutoPicked` fires the same `PayMovementSelectionOutcome` `selectPayMovement()` itself would
   * return, for the "only one candidate, don't make the user pick it" auto-select case (UX 2026-08-14) —
   * the caller applies it exactly like a real pick.
   */
  loadPayableMovements(opts: {
    contractId: string | undefined;
    lcNumber: string | undefined;
    selectedFunction: TransactionFunction | null;
    selectedFunctionStrategy: FunctionStrategy | null;
    onAutoPicked: (outcome: PayMovementSelectionOutcome) => void;
  }): void {
    const { contractId, lcNumber, selectedFunction, selectedFunctionStrategy, onAutoPicked } = opts;
    this.selectedPayMovement = null;
    this.payableMovementSearch = '';
    this.payableMovementsPaging.reset();
    if (!contractId) {
      this.payableMovements = [];
      return;
    }
    if (selectedFunction?.payableMovementInstrumentType) {
      this.loadPayableMovementsAcrossChildContracts(
        selectedFunction.payableMovementInstrumentType,
        lcNumber,
        selectedFunction,
        selectedFunctionStrategy,
        onAutoPicked,
      );
      return;
    }
    this.payableMovementsLoading = true;
    // Business instruction 2026-08-15 ("B4 should index records from B3") — payableMovementType lets B4
    // filter for still-PENDING ACCEPT records instead of A4/A6's own UTILIZE; defaults to 'UTILIZE' when
    // unset so A4/A6 are unchanged.
    const wantedMovementType = selectedFunction?.payableMovementType ?? 'UTILIZE';
    this.api.listMovements(contractId).subscribe({
      next: (list) => {
        this.payableMovementsLoading = false;
        this.payableMovements = list.filter((m) => m.status === 'PENDING' && m.movementType === wantedMovementType);
        this.payableMovementsPaging.total = this.payableMovements.length;
        if (this.payableMovements.length === 1) {
          onAutoPicked(this.selectPayMovement(this.payableMovements[0].movementId, selectedFunctionStrategy, selectedFunction?.secondaryRefLabel));
        }
      },
      error: () => {
        this.payableMovementsLoading = false;
        this.payableMovements = [];
      },
    });
  }

  /**
   * B4 (`payableMovementInstrumentType`) only — the cross-contract half of `loadPayableMovements()`
   * above: catalog-search still-ACTIVE child contracts of the given `childInstrumentType` under the
   * given LC Number (same "search by lcNumber" mechanism as `loadSgsForArrival()`), then fetch EACH
   * one's own movements to find its still-PENDING/RELEASED record. One `EPLC_EXAMINATION` contract only
   * ever carries one `CREATE` movement, so this is always at most one movement per candidate contract.
   *
   * Bug fixed 2026-08-18, reviewer-reported live ("Export Confirmed LC Sight B4 Submit後 不應該再出現 S01
   * E01 E02" — after B4 has already consumed a presentation, it must stop appearing as a pickable
   * candidate): a status filter alone isn't enough once a presentation can be RELEASED (EARMARKED) YET
   * ALSO already fully consumed by an earlier B4 — excludes anything with `presentDocsConsumedAt`
   * already set. A no-op for A6's own candidates (plain A3 UTILIZEs never set it).
   */
  private loadPayableMovementsAcrossChildContracts(
    childInstrumentType: InstrumentType,
    lcNumber: string | undefined,
    selectedFunction: TransactionFunction | null,
    selectedFunctionStrategy: FunctionStrategy | null,
    onAutoPicked: (outcome: PayMovementSelectionOutcome) => void,
  ): void {
    if (!lcNumber) {
      this.payableMovements = [];
      return;
    }
    const wantedMovementType = selectedFunction?.payableMovementType ?? 'UTILIZE';
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
              // EPLC_EXAMINATION's own EB Number lives on the CONTRACT's naturalKey.ibNumber — merge it
              // onto each movement here as a synthetic sourceTransactionRef, so selectPayMovement()/the
              // row template can keep reading `.sourceTransactionRef` generically without knowing which
              // case this is.
              map((list) => list.map((m) => ({ ...m, sourceTransactionRef: m.sourceTransactionRef ?? c.naturalKey.ibNumber }))),
              catchError(() => of([] as BalanceMovement[])),
            ),
          ),
        ).subscribe((movementLists) => {
          this.payableMovementsLoading = false;
          // Basis changed 2026-08-18 ("所有交易要RELEASE過後 才能根據流程走下一個交易"): B3 now genuinely
          // RELEASEs on its own, so B4's own candidate filter looks for status === 'RELEASED' instead of
          // 'PENDING' when this flag is set; A6's own equivalent (still-PENDING A3 Document Arrivals) is
          // unaffected, still filters on 'PENDING'.
          const requiresRelease = !!selectedFunctionStrategy?.checkerRelease.sourceAlreadyReleasedBeforePick;
          this.payableMovements = movementLists
            .flat()
            .filter((m) => m.movementType === wantedMovementType && m.status === (requiresRelease ? 'RELEASED' : 'PENDING') && !m.presentDocsConsumedAt);
          this.payableMovementsPaging.total = this.payableMovements.length;
          if (this.payableMovements.length === 1) {
            onAutoPicked(this.selectPayMovement(this.payableMovements[0].movementId, selectedFunctionStrategy, selectedFunction?.secondaryRefLabel));
          }
        });
      },
      error: () => {
        this.payableMovementsLoading = false;
        this.payableMovements = [];
      },
    });
  }

  /**
   * Business instruction 2026-08-15 ("Index Search") — the `IndexPicker`'s own `autoPickedHint` text
   * fires purely off `items.length === 1`, but the actual auto-pick behavior only ever ran once, against
   * the ORIGINAL unfiltered list at load time — so narrowing to one match via search would show the hint
   * without it being true. This re-runs that same auto-pick whenever typing narrows `filteredPayableMovements`
   * down to exactly one, keeping the hint and the actual behavior in sync — returns the resulting
   * `PayMovementSelectionOutcome` for the caller to apply, or `null` when no auto-pick happened.
   */
  onPayableMovementSearchChange(
    value: string,
    selectedFunctionStrategy: FunctionStrategy | null,
    secondaryRefLabel: string | undefined,
  ): PayMovementSelectionOutcome | null {
    this.payableMovementSearch = value;
    this.payableMovementsPaging.total = this.filteredPayableMovements.length;
    this.payableMovementsPaging.page = 1;
    if (this.filteredPayableMovements.length === 1) {
      return this.selectPayMovement(this.filteredPayableMovements[0].movementId, selectedFunctionStrategy, secondaryRefLabel);
    }
    return null;
  }

  /**
   * A6 only (business instruction 2026-08-14 "The amount should carry from the related LC number + IB
   * number and protected"): auto-fills AND locks the Acceptance's own natural key IB Number and Amount
   * from the Document Arrival being converted — `needsRebuildFields: true` so the caller disables the
   * Amount input, matching every other "carried and protected" field's own convention. A4 only
   * (`releasesExistingMovementInPlace`): `clearsSubmitResult: true` — picking a NEW Document Arrival
   * clears any PREVIOUS Submit result so the Maker isn't left looking at a stale MAKER RESULT panel for a
   * DIFFERENT movement.
   */
  selectPayMovement(movementId: string, selectedFunctionStrategy: FunctionStrategy | null, secondaryRefLabel: string | undefined): PayMovementSelectionOutcome {
    this.selectedPayMovement = this.payableMovements.find((m) => m.movementId === movementId) ?? null;
    const outcome: {
      selectedPayMovement: BalanceMovement | null;
      naturalKeyIbNumber?: string;
      modelSecondaryRef?: string;
      modelAmount?: string;
      needsRebuildFields: boolean;
      clearsSubmitResult: boolean;
    } = {
      selectedPayMovement: this.selectedPayMovement,
      needsRebuildFields: false,
      clearsSubmitResult: false,
    };
    if (selectedFunctionStrategy?.checkerRelease.settlesDocumentArrival && this.selectedPayMovement) {
      outcome.naturalKeyIbNumber = this.selectedPayMovement.sourceTransactionRef ?? '';
      // B4's instrumentType (EPLC_CONFIRMATION) has no ibNumber natural-key field of its own — it carries
      // its EB Number via secondaryRef instead. Set both so either kind of consumer picks up the right
      // one; harmless no-op for a function that doesn't use secondaryRef.
      if (secondaryRefLabel) outcome.modelSecondaryRef = this.selectedPayMovement.sourceTransactionRef ?? '';
      outcome.modelAmount = this.selectedPayMovement.amount;
      outcome.needsRebuildFields = true;
    }
    if (selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace) {
      outcome.clearsSubmitResult = true;
    }
    return outcome;
  }
}
