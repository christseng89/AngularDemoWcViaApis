import { Injectable } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot } from './balance-component-api.service';
import { InstrumentType } from './balance-component.model';

/**
 * Owns every A1-A9/B1-B5 function's own per-candidate LC Index eligibility data — A4/A6/B4's own "does
 * this LC/Confirmation have an eligible outstanding A3/A3S Document Arrival (or, for B4, an
 * already-Released child B3 Present Docs record) of its own" hint maps, used for both their own inline
 * hint text (e.g. A4's "— IB00001 — Pending: 25,000") and their own eligibility filtering; plus A3S/A9's
 * own "does this LC have an outstanding SG Balance" eligibility. Kept in one service since it's the same
 * underlying concept (per-candidate LC Index eligibility for a paginated picker), just different checks.
 *
 * Deliberately does NOT own the picker's own `contracts`/`total`/paging (that's `CatalogPickerService`'s
 * job) or the business-rule filtering that CONSUMES these maps (`filteredCatalogContracts`/
 * `filteredParentCatalog` stay on `TransactionBuilderComponent` — Maker-flow orchestration).
 *
 * `@Injectable()`, no `providedIn` — genuinely per-component-instance state, not an app-wide singleton —
 * see `LookUpPanelService`'s own doc comment for the full reasoning.
 */
@Injectable()
export class DocumentArrivalHintsService {
  /** A4 (Sight Settlement) only — its own flat Catalog picker, same-contract still-PENDING UTILIZE. */
  readonly catalogPayableIbs = new Map<string, string[]>();
  /** Full movement objects backing catalogPayableIbs, keyed the same way. */
  readonly catalogPayableMovements = new Map<string, BalanceMovement[]>();
  /** A6 (Acceptance, Usance) only — its own Parent LC picker, same-contract still-PENDING UTILIZE. */
  readonly parentPayableIbs = new Map<string, string[]>();
  readonly parentPayableMovements = new Map<string, BalanceMovement[]>();
  /** B4 (Honour / Acceptance) only — its own flat Catalog picker, CROSS-contract (a child EPLC_EXAMINATION contract's own CREATE), RELEASED and not yet consumed. */
  readonly catalogChildPayableIbs = new Map<string, string[]>();
  readonly catalogChildPayableMovements = new Map<string, BalanceMovement[]>();
  /** A3S (Document Arrival w/ Shipping Gtee) only — its own flat Catalog picker. Set of balanceContractId whose LC has at least one child SHGT contract with a non-zero Available Balance — see loadSgBalanceEligibility()'s own doc comment. */
  readonly catalogSgEligible = new Set<string>();
  readonly catalogSgRows = new Map<string, { contract: BalanceContract; snapshot: BalanceSnapshot }[]>();
  /** A9 (Shipping Gtee Redemption) only — its own Parent LC picker. Same eligibility rule as catalogSgEligible above. */
  readonly parentSgEligible = new Set<string>();
  /** A10/B6 (Close) only — see loadCloseEligibility()'s own doc comment for why this is populated by ONE aggregate server call, unlike every other Set/Map above. */
  readonly catalogCloseEligible = new Set<string>();
  /** A11/B7 (Reopen, F1) only — same "one aggregate server call" shape as catalogCloseEligible above, backed by GET /balance-contracts/reopen-eligible instead (CLOSED status, no open Events — no SG/Acceptance-balance-zero condition, that's Close's own rule). See loadReopenEligibility()'s own doc comment. */
  readonly catalogReopenEligible = new Set<string>();
  /** A7 (Acceptance Settlement) only — its own Parent LC picker. Set of balanceContractId whose LC has at least one child IPLC_ACCEPTANCE contract with a non-zero Available Balance — see loadChildBalanceEligibility()'s own doc comment. User-reported 2026-08-25 ("A07 交易選擇是 LC number 有Acceptance balance 再顯示2ndary ref"). */
  readonly parentAcceptanceEligible = new Set<string>();

  constructor(private readonly api: BalanceComponentApiService) {}

  /** A4's own hint fetch — see loadDocumentArrivalHints()'s own doc comment. */
  loadCatalogHints(list: BalanceContract[], onDone: () => void): void {
    this.loadDocumentArrivalHints(list, this.catalogPayableIbs, this.catalogPayableMovements, onDone);
  }

  /** A6's own hint fetch — see loadDocumentArrivalHints()'s own doc comment. */
  loadParentHints(list: BalanceContract[], onDone: () => void): void {
    this.loadDocumentArrivalHints(list, this.parentPayableIbs, this.parentPayableMovements, onDone);
  }

  /**
   * Shared by A4 and A6 — both functions' own "eligible LC" definition is identical (a still-PENDING
   * A3/A3S Document Arrival — an IPLC_LC/UTILIZE movement — on the SAME contract, not cross-contract like
   * B4's own EPLC_EXAMINATION check below), so this is one fetch/populate body rather than two copies of
   * the same forkJoin.
   *
   * Business instruction 2026-08-20 ("A4 選取 EARMARKED 的交易" / "狀態必須是 EARMARKED") — genuine 4-eyes
   * separation: a Document Arrival that's only Maker-Submitted (EARMARKING, `acknowledgedAt` still null)
   * is not yet eligible here; it must first be Checker-acknowledged by A3/A3S's own Checker (EARMARKED,
   * see `balance-component.model.ts`'s own `displayStatus()` doc comment) before A4/A6 can act on it.
   *
   * Bug fixed same day (reviewer-reported live, "已經Submit 為何可以A4重複出現再選取" — S101 repro): once
   * A4's OWN Maker Submit has already happened (`makerSubmittedAt` set — A6 never sets this field, so
   * this exclusion is a no-op for A6), the item has nothing left for A4's own Maker step to do — it must
   * also drop out of this same eligible list, not keep re-offering itself for a second (409-doomed) Submit.
   */
  private loadDocumentArrivalHints(list: BalanceContract[], ibs: Map<string, string[]>, movements: Map<string, BalanceMovement[]>, onDone: () => void): void {
    ibs.clear();
    movements.clear();
    if (!list.length) {
      onDone();
      return;
    }
    forkJoin(list.map((c) => this.api.listMovements(c.balanceContractId).pipe(catchError(() => of([] as any[]))))).subscribe((results) => {
      list.forEach((c, i) => {
        const pending = (results[i] ?? []).filter((m: any) => m.status === 'PENDING' && m.movementType === 'UTILIZE' && !!m.acknowledgedAt && !m.makerSubmittedAt);
        if (pending.length) {
          ibs.set(
            c.balanceContractId,
            pending.map((m: any) => m.sourceTransactionRef || '(no IB Number)'),
          );
          movements.set(c.balanceContractId, pending);
        }
      });
      onDone();
    });
  }

  /**
   * B4 only — mirrors `loadPayableMovementsAcrossChildContracts()`'s own two-step resolution
   * (catalog-search the child instrumentType by lcNumber, then fetch each child's own movements), run
   * once per LC Index candidate. Same RELEASED + not-yet-consumed condition as B4's own Step-2 picker —
   * a still-PENDING B3 record isn't eligible, unlike A4/A6's own same-contract PENDING check above.
   */
  loadChildHints(list: BalanceContract[], childInstrumentType: InstrumentType, wantedMovementType: string, onDone: () => void): void {
    this.catalogChildPayableIbs.clear();
    this.catalogChildPayableMovements.clear();
    if (!list.length) {
      onDone();
      return;
    }
    forkJoin(
      list.map((c) =>
        this.api.catalog(childInstrumentType, 'ACTIVE', undefined, 1, 50, c.naturalKey.lcNumber).pipe(
          switchMap((result) => {
            if (!result.items.length) return of([] as BalanceMovement[]);
            return forkJoin(
              result.items.map((child) =>
                this.api.listMovements(child.balanceContractId).pipe(
                  map((movs) =>
                    (movs as any[])
                      .filter((m: any) => m.movementType === wantedMovementType && m.status === 'RELEASED' && !m.presentDocsConsumedAt)
                      .map((m: any) => ({ ...m, sourceTransactionRef: m.sourceTransactionRef || child.naturalKey.ibNumber || '(no EB Number)' })),
                  ),
                  catchError(() => of([] as BalanceMovement[])),
                ),
              ),
            ).pipe(map((lists) => lists.flat()));
          }),
          catchError(() => of([] as BalanceMovement[])),
        ),
      ),
    ).subscribe((results) => {
      list.forEach((c, i) => {
        const movements = results[i];
        if (movements.length) {
          this.catalogChildPayableMovements.set(c.balanceContractId, movements);
          this.catalogChildPayableIbs.set(
            c.balanceContractId,
            movements.map((movement) => movement.sourceTransactionRef!),
          );
        }
      });
      onDone();
    });
  }

  /** A3S's own hint fetch — see loadChildBalanceEligibility()'s own doc comment. */
  loadCatalogSgEligibility(list: BalanceContract[], onDone: () => void): void {
    this.catalogSgEligible.clear();
    this.catalogSgRows.clear();
    if (!list.length) {
      onDone();
      return;
    }
    forkJoin(
      list.map((lc) =>
        this.api.catalog('SHGT', 'ACTIVE', undefined, 1, 50, lc.naturalKey.lcNumber, undefined, true).pipe(
          switchMap((result) => {
            if (!result.items.length) return of([] as { contract: BalanceContract; snapshot: BalanceSnapshot }[]);
            return forkJoin(
              result.items.map((contract) =>
                this.api.getSnapshot(contract.balanceContractId).pipe(
                  map((snapshot) => ({ contract, snapshot })),
                  catchError(() => of(null)),
                ),
              ),
            ).pipe(
              map((rows) => rows.filter((row): row is { contract: BalanceContract; snapshot: BalanceSnapshot } => !!row && row.snapshot.availableBalance !== '0')),
            );
          }),
          catchError(() => of([] as { contract: BalanceContract; snapshot: BalanceSnapshot }[])),
        ),
      ),
    ).subscribe((results) => {
      list.forEach((lc, index) => {
        const rows = results[index];
        if (rows.length) {
          this.catalogSgEligible.add(lc.balanceContractId);
          this.catalogSgRows.set(lc.balanceContractId, rows);
        }
      });
      onDone();
    });
  }

  /**
   * A10/B6 (Close) only. Unlike every other hint method in this service, this does NOT fan out one
   * request per Step-1 candidate — SG/Acceptance-balance-plus-whole-event-tree eligibility is exactly
   * what `GET /balance-contracts/close-eligible` already computes server-side (BalanceService's own
   * `evaluateContractCloseEligibility()`), so replicating that per-candidate on the client would mean
   * several extra round-trips per LC for no benefit — unlike the other loadXxx methods, this takes no
   * `list` param at all; the eligible set is derived directly from the server's own response, not
   * filtered from an already-fetched catalog page.
   */
  loadCloseEligibility(instrumentType: InstrumentType, onDone: () => void): void {
    this.catalogCloseEligible.clear();
    this.api.closeEligible(instrumentType).subscribe({
      next: (result) => {
        result.items.forEach((c) => this.catalogCloseEligible.add(c.balanceContractId));
        onDone();
      },
      error: () => onDone(),
    });
  }

  /**
   * A11/B7 (Reopen, F1) only. Same "one aggregate server call, no per-candidate `list` param" shape as
   * loadCloseEligibility() above — `GET /balance-contracts/reopen-eligible` already computes the whole
   * eligibility (CLOSED status, no open Events anywhere in the tree) server-side.
   */
  loadReopenEligibility(instrumentType: InstrumentType, onDone: () => void): void {
    this.catalogReopenEligible.clear();
    this.api.reopenEligible(instrumentType).subscribe({
      next: (result) => {
        result.items.forEach((c) => this.catalogReopenEligible.add(c.balanceContractId));
        onDone();
      },
      error: () => onDone(),
    });
  }

  /** A9's own hint fetch — see loadChildBalanceEligibility()'s own doc comment. */
  loadParentSgEligibility(list: BalanceContract[], onDone: () => void): void {
    this.loadChildBalanceEligibility(list, 'SHGT', this.parentSgEligible, onDone);
  }

  /** A7's own hint fetch — see loadChildBalanceEligibility()'s own doc comment. Same shape as A9's SG
   * eligibility, just gated on a child IPLC_ACCEPTANCE instead of a child SHGT. */
  loadParentAcceptanceEligibility(list: BalanceContract[], onDone: () => void): void {
    this.loadChildBalanceEligibility(list, 'IPLC_ACCEPTANCE', this.parentAcceptanceEligible, onDone);
  }

  /**
   * Shared by A3S/A9 (childInstrumentType 'SHGT') and A7 (childInstrumentType 'IPLC_ACCEPTANCE') —
   * only LC Numbers with an outstanding child balance of the given instrumentType are eligible. For
   * each LC Index candidate, catalog-searches its own children of that instrumentType by lcNumber, then
   * fetches each child's own live snapshot — mirrors `loadSgsForArrival()`'s own "outstanding SG" filter
   * (`availableBalance !== '0'`), run once per Step-1 candidate. An LC with no children of that
   * instrumentType, or whose every child is fully redeemed/settled, is not eligible.
   */
  private loadChildBalanceEligibility(list: BalanceContract[], childInstrumentType: InstrumentType, eligible: Set<string>, onDone: () => void): void {
    eligible.clear();
    if (!list.length) {
      onDone();
      return;
    }
    forkJoin(
      list.map((c) =>
        this.api.catalog(childInstrumentType, 'ACTIVE', undefined, 1, 50, c.naturalKey.lcNumber).pipe(
          switchMap((result) => {
            if (!result.items.length) return of(false);
            return forkJoin(result.items.map((child) => this.api.getSnapshot(child.balanceContractId).pipe(catchError(() => of(null))))).pipe(
              map((snaps) => snaps.some((snap) => !!snap && snap.availableBalance !== '0')),
            );
          }),
          catchError(() => of(false)),
        ),
      ),
    ).subscribe((results) => {
      list.forEach((c, i) => {
        if (results[i]) eligible.add(c.balanceContractId);
      });
      onDone();
    });
  }
}
