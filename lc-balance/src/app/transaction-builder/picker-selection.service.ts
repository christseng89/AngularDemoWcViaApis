import { Injectable } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot } from './balance-component-api.service';
import { InstrumentType, TransactionFunction } from './balance-component.model';
import { PagedListState } from './paged-list-state';
import { FunctionStrategy } from './function-strategy';

/**
 * Outcome of picking a still-PENDING/RELEASED "payable movement" (A4/A6/B4's own Step-2 picker). The
 * further consequences (naturalKey/model writes, `rebuildFields()`, clearing `submitResult`) read/write
 * component-owned state this service doesn't hold. Every field but `selectedPayMovement` is optional —
 * `undefined` means "untouched", never "clear it", matching `MakerSubmitOutcome.secondary`'s convention.
 */
export interface PayMovementSelectionOutcome {
  readonly selectedPayMovement: BalanceMovement | null;
  readonly naturalKeyIbNumber?: string;
  readonly modelSecondaryRef?: string;
  readonly modelAmount?: string;
  readonly needsRebuildFields: boolean;
  readonly clearsSubmitResult: boolean;
}

/** Outcome of picking a row from B5's own "EB Index" — a synthetic `BalanceContract` the caller sets as `selectedContract`, plus the `ibNumber` it carries into `searchNaturalKey`. */
export interface SettleableBalanceSelectionOutcome {
  readonly instrumentType: InstrumentType;
  readonly contract: BalanceContract;
  readonly ibNumber: string;
}

/**
 * Owns the three "2ndary Index" cascading-picker subsystems driven by A3S/B5/A4-A6-B4 once their own
 * Step-1 LC/Parent is picked: A3S's SG picker, B5's EB Index, and A4/A6/B4's shared payable-movement
 * picker.
 *
 * Deliberately does NOT own `onSelectContract()`/`onSelectParent()`/`onSelectIbIndex()` — those Step-1
 * handlers read/write `model`/`naturalKey`/`selectedContract`/`selectedParent` too pervasively to extract
 * without moving those fields too. This service owns only the state/logic exclusive to the three Step-2
 * pickers; the component's own Step-1 handlers call into it at the points they used to call plain methods.
 *
 * Dependency Inversion, same shape as `CheckerActionsService`/`MakerSubmitService`: a method either takes
 * the read-only values it needs as plain parameters, or returns an Outcome object
 * (`PayMovementSelectionOutcome`/`SettleableBalanceSelectionOutcome`) the caller applies to its own
 * state. An async chain needing a component-owned side effect (`rebuildFields()`) takes an explicit
 * `onUpdated: () => void` callback instead, same pattern as `LookUpPanelService.runLookup()`'s own
 * `onBeforeLookup`.
 *
 * `arrivalSgRedeemAmount`/`arrivalSgRedeemType`/`arrivalSgRemaining` stayed on the component — derived
 * from both this service's `arrivalSgSnapshot` and the component-owned `model.amount`, so moving them
 * here would only relocate the coupling.
 *
 * Action methods (`onSelectArrivalSg`/`onSelectSettleableBalance`/`onSelectPayMovement`/
 * `onPayableMovementSearchChange`/every `xxxPrevPage()`/`xxxNextPage()`) stay as one-line wrappers on the
 * component, delegating here — only the state bindings needed a `pickerSelection.` prefix in the template.
 *
 * `@Injectable()`, no `providedIn` — per-component-instance mutable state; `providedIn: 'root'` would
 * wrongly share one instance app-wide. Registered as a component-scoped provider on
 * `TransactionBuilderComponent`'s own `@Component({ providers: [...] })`.
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
  /** Live outstanding amount for every A3S SG Index row, keyed by contract id. */
  readonly arrivalSgSnapshots = new Map<string, BalanceSnapshot>();

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
   * A fully redeemed SG's own `BalanceContract.status` stays ACTIVE, so the only reliable "nothing left"
   * signal is its live snapshot showing 0 Available — same 0-balance exclusion every picker applies.
   * `requireIssueReleased: true` — an SG whose own A8 Issue isn't yet Checker-Released shouldn't be
   * redeemable via A3S. `onUpdated` fires once the auto-picked SG's snapshot loads (or immediately if
   * nothing auto-picked) — the caller's `rebuildFields()`, since Formly depends on `arrivalSgSnapshot`.
   */
  loadSgsForArrival(lcNumber: string | undefined, onUpdated: () => void): void {
    this.selectedArrivalSg = null;
    this.arrivalSgSnapshot = null;
    this.arrivalSgSnapshots.clear();
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
          result.items.forEach((contract, index) => {
            const snapshot = snapshots[index];
            if (snapshot) this.arrivalSgSnapshots.set(contract.balanceContractId, snapshot);
          });
          this.sgsForArrival = result.items.filter((_, i) => {
            const snap = snapshots[i];
            return !!snap && snap.availableBalance !== '0';
          });
          this.arrivalSgPaging.total = this.sgsForArrival.length;
          this.arrivalSgPaging.page = 1;
          // Only-one-candidate auto-pick, same pattern as loadPayableMovements() below — checked against
          // the true total across all pages (sgsForArrival), not just page 1.
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

  /** Fetches the picked SG's current snapshot (not the stale Catalog row) so the component's own arrivalSgRedeemAmount/Type compute against a live outstanding figure. */
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
   * B5's own "EB Index" Step 2 — still-outstanding candidates of the given instrumentType under the
   * Confirmation's own LC Number, filtered to Available > 0. `requireIssueReleased: true` is safe here
   * since an Acceptance/receivable's CREATE is released as part of B4's own compound Release.
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

  /** Pick handler for the "EB Index" picker above. Returns `null` for an id that no longer matches (defensive — the template only ever offers ids from this list). */
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

  /** Client-side filter, since `payableMovements` is a fully-loaded, unpaginated array. */
  get filteredPayableMovements(): BalanceMovement[] {
    const q = this.payableMovementSearch.trim().toLowerCase();
    if (!q) return this.payableMovements;
    return this.payableMovements.filter((m) => (m.sourceTransactionRef ?? '').toLowerCase().includes(q));
  }

  /** Current page's own slice of `filteredPayableMovements`, shared by A4/A6's unfiltered picker and B4's two search-filtered ones — exactly one is ever visible for a given selectedFunction. */
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
   * A4/A6's own plain `listMovements(contractId)` path; routes to
   * `loadPayableMovementsAcrossChildContracts()` for B4 instead (`payableMovementInstrumentType` set —
   * B3's own CREATE lives on a separate child `EPLC_EXAMINATION` contract, not the Confirmation itself).
   * `onAutoPicked` fires the same Outcome a real pick would, for the only-one-candidate auto-select case.
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
        contractId,
        selectedFunction.payableMovementInstrumentType,
        lcNumber,
        selectedFunction,
        selectedFunctionStrategy,
        onAutoPicked,
      );
      return;
    }
    this.payableMovementsLoading = true;
    // payableMovementType lets B4 filter for still-PENDING ACCEPT records instead of A4/A6's UTILIZE;
    // defaults to 'UTILIZE' so A4/A6 are unchanged.
    const wantedMovementType = selectedFunction?.payableMovementType ?? 'UTILIZE';
    this.api.listMovements(contractId).subscribe({
      next: (list) => {
        this.payableMovementsLoading = false;
        // Business instruction 2026-08-20 ("A4 選取 EARMARKED 的交易") — A4/A6's own UTILIZE candidates
        // must be genuinely EARMARKED (Checker-acknowledged, acknowledgedAt set), not merely
        // Maker-Submitted (EARMARKING) — mirrors DocumentArrivalHintsService's own Step-1 LC-level gate,
        // needed again here since one LC can have MULTIPLE outstanding Document Arrivals and Step-1 only
        // requires at least one to be eligible. B4's own ACCEPT-shaped payableMovementType is unrelated
        // to A3/A3S's earmark concept, so it's excluded from this gate. Also excludes one A4 has already
        // Maker-Submitted itself (makerSubmittedAt set — bug fixed same day, reviewer-reported live,
        // "已經Submit 為何可以A4重複出現再選取"); A6 never sets this field, so it's a no-op there.
        this.payableMovements = list.filter(
          (m) =>
            m.status === 'PENDING' &&
            m.movementType === wantedMovementType &&
            (wantedMovementType !== 'UTILIZE' || (!!m.acknowledgedAt && !m.makerSubmittedAt)),
        );
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
   * B4 only — the cross-contract half of `loadPayableMovements()`: catalog-search still-ACTIVE child
   * contracts of `childInstrumentType` under the LC Number, then fetch each one's own movements to find
   * its still-PENDING/RELEASED record. One `EPLC_EXAMINATION` contract carries at most one `CREATE`.
   * Excludes anything with `presentDocsConsumedAt` already set — a status filter alone isn't enough once
   * a presentation can be RELEASED yet already consumed by an earlier B4 (a no-op for A6's candidates).
   *
   * Real bug fixed 2026-08-29 (live-reported, "B4 S02 E01 Submit -> Maker Queue (看不到) -> B4 還可以選同一筆
   * 再SUBMIT" — a duplicate `sourceTransactionRef` rejection at the SECOND Submit): unlike A4/A6 (whose own
   * candidate filter above already excludes `!m.makerSubmittedAt` — set on the referenced UTILIZE ITSELF
   * at A6's own CREATE time), B4's own HONOUR/ACCEPT is a genuinely SEPARATE movement referencing the B3
   * CREATE via `referencedTransactionId` — the B3 record itself carries no equivalent "already has a live
   * attempt" marker, so a still-PENDING (not yet Released or Rejected/Cancelled) B4 attempt left the
   * SAME B3 presentation fully re-pickable. Fixed by ALSO fetching the parent Confirmation's own
   * `contractId` movements (now passed in) alongside the child catalog fetch, and excluding any B3
   * candidate whose `movementId` is already `referencedTransactionId` on a still-PENDING parent movement
   * — the same "referencing sibling still live" signal `resolveLinkedAccountingMovement()` already reads
   * elsewhere for a different purpose (Account Entries), applied here to eligibility instead. A REJECTED
   * or CANCELLED prior B4 attempt does NOT exclude the candidate — exactly the case this bug report's own
   * Delete Pending step needs to keep working (re-pick the same E01 after the first attempt is retired).
   */
  private loadPayableMovementsAcrossChildContracts(
    contractId: string | undefined,
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
    forkJoin({
      children: this.api.catalog(childInstrumentType, 'ACTIVE', undefined, 1, 50, lcNumber),
      parentMovements: contractId ? this.api.listMovements(contractId).pipe(catchError(() => of([] as BalanceMovement[]))) : of([] as BalanceMovement[]),
    }).subscribe({
      next: ({ children, parentMovements }) => {
        const alreadyReferencedByPendingParent = new Set(
          parentMovements.filter((m) => m.status === 'PENDING' && m.referencedTransactionId).map((m) => m.referencedTransactionId as string),
        );
        if (!children.items.length) {
          this.payableMovementsLoading = false;
          this.payableMovements = [];
          return;
        }
        forkJoin(
          children.items.map((c) =>
            this.api.listMovements(c.balanceContractId).pipe(
              // EPLC_EXAMINATION's EB Number lives on the contract's naturalKey.ibNumber — merge it onto
              // each movement as a synthetic sourceTransactionRef so callers can read that field generically.
              map((list) => list.map((m) => ({ ...m, sourceTransactionRef: m.sourceTransactionRef ?? c.naturalKey.ibNumber }))),
              catchError(() => of([] as BalanceMovement[])),
            ),
          ),
        ).subscribe((movementLists) => {
          this.payableMovementsLoading = false;
          // B3 genuinely RELEASEs on its own, so B4's candidate filter looks for status === 'RELEASED'
          // instead of 'PENDING' when this flag is set; A6's still-PENDING A3 candidates are unaffected.
          const requiresRelease = !!selectedFunctionStrategy?.checkerRelease.sourceAlreadyReleasedBeforePick;
          this.payableMovements = movementLists
            .flat()
            .filter(
              (m) =>
                m.movementType === wantedMovementType &&
                m.status === (requiresRelease ? 'RELEASED' : 'PENDING') &&
                !m.presentDocsConsumedAt &&
                !alreadyReferencedByPendingParent.has(m.movementId),
            );
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
   * `IndexPicker`'s own `autoPickedHint` fires off `items.length === 1`, but auto-pick itself only ran
   * once at load time — so narrowing to one match via search would show the hint without it being true.
   * Re-runs the auto-pick when typing narrows to exactly one match, keeping hint and behavior in sync.
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
   * A6 only: auto-fills AND locks the Acceptance's own IB Number and Amount from the Document Arrival
   * being converted (`needsRebuildFields: true` disables the Amount input). A4 only
   * (`releasesExistingMovementInPlace`): `clearsSubmitResult: true` — picking a new item clears any stale
   * MAKER RESULT panel from a previous one.
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
    // 2026-08-28 ("A4 銀幕改成配置方式"／"A4 沒抓到2ndary number" — live-reported bug) — widened from
    // settlesDocumentArrival-only (A6/B4) to also cover releasesExistingMovementInPlace (A4): A4's own
    // template used to read `pickerSelection.selectedPayMovement.amount`/`.sourceTransactionRef` DIRECTLY
    // in a bespoke readout, bypassing `model` entirely — masking the fact that THIS method never actually
    // populated `modelAmount`/`modelSecondaryRef` for A4's own shape. Once that bespoke readout was
    // replaced with the generic, config-driven Amount field + protected-natural-key card (both reading
    // `model.amount`/`model.secondaryRef`), the underlying gap became visible: neither ever got set.
    if ((selectedFunctionStrategy?.checkerRelease.settlesDocumentArrival || selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace) && this.selectedPayMovement) {
      // naturalKeyIbNumber only applies to A6/B4 — they CREATE a new contract whose own natural key needs
      // it; A4 creates nothing (submitA4() only ever calls maker-submit on the picked movementId), so
      // naturalKey.ibNumber is irrelevant to its own Submit and stays untouched.
      if (selectedFunctionStrategy?.checkerRelease.settlesDocumentArrival) {
        outcome.naturalKeyIbNumber = this.selectedPayMovement.sourceTransactionRef ?? '';
      }
      // B4 (EPLC_CONFIRMATION) has no ibNumber field — carries its EB Number via secondaryRef instead.
      // A4 has no secondaryRefLabel of its own at all (its "2ndary Number" is the picked record's own
      // reference, not a freely-typed natural-key field — see the protected-card template's own doc
      // comment), but still needs this value for that same protected-card readout.
      if (secondaryRefLabel || selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace) {
        outcome.modelSecondaryRef = this.selectedPayMovement.sourceTransactionRef ?? '';
      }
      outcome.modelAmount = this.selectedPayMovement.amount;
      outcome.needsRebuildFields = true;
    }
    if (selectedFunctionStrategy?.checkerRelease.releasesExistingMovementInPlace) {
      outcome.clearsSubmitResult = true;
    }
    return outcome;
  }
}
