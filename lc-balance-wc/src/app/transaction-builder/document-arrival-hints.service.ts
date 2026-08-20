import { Injectable } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { BalanceComponentApiService, BalanceContract, BalanceMovement } from './balance-component-api.service';
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
  /** A3S (Document Arrival w/ Shipping Gtee) only — its own flat Catalog picker. Set of balanceContractId whose LC has at least one child SHGT contract with a non-zero Available Balance — see loadSgBalanceEligibility()'s own doc comment. */
  readonly catalogSgEligible = new Set<string>();
  /** A9 (Shipping Gtee Redemption) only — its own Parent LC picker. Same eligibility rule as catalogSgEligible above. */
  readonly parentSgEligible = new Set<string>();

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
    if (!list.length) {
      onDone();
      return;
    }
    forkJoin(
      list.map((c) =>
        this.api.catalog(childInstrumentType, 'ACTIVE', undefined, 1, 50, c.naturalKey.lcNumber).pipe(
          switchMap((result) => {
            if (!result.items.length) return of([] as string[]);
            return forkJoin(
              result.items.map((child) =>
                this.api.listMovements(child.balanceContractId).pipe(
                  map((movs) =>
                    (movs as any[])
                      .filter((m: any) => m.movementType === wantedMovementType && m.status === 'RELEASED' && !m.presentDocsConsumedAt)
                      .map((m: any) => m.sourceTransactionRef || child.naturalKey.ibNumber || '(no EB Number)'),
                  ),
                  catchError(() => of([] as string[])),
                ),
              ),
            ).pipe(map((lists) => lists.flat()));
          }),
          catchError(() => of([] as string[])),
        ),
      ),
    ).subscribe((results) => {
      list.forEach((c, i) => {
        if (results[i].length) this.catalogChildPayableIbs.set(c.balanceContractId, results[i]);
      });
      onDone();
    });
  }

  /** A3S's own hint fetch — see loadSgBalanceEligibility()'s own doc comment. */
  loadCatalogSgEligibility(list: BalanceContract[], onDone: () => void): void {
    this.loadSgBalanceEligibility(list, this.catalogSgEligible, onDone);
  }

  /** A9's own hint fetch — see loadSgBalanceEligibility()'s own doc comment. */
  loadParentSgEligibility(list: BalanceContract[], onDone: () => void): void {
    this.loadSgBalanceEligibility(list, this.parentSgEligible, onDone);
  }

  /**
   * Shared by A3S and A9 — only LC Numbers with an outstanding SG Balance are eligible. For each LC
   * Index candidate, catalog-searches its own child SHGT contracts by lcNumber, then fetches each
   * child's own live snapshot — mirrors `loadSgsForArrival()`'s own "outstanding SG" filter
   * (`availableBalance !== '0'`), run once per Step-1 candidate. An LC with no SHGT children, or whose
   * every SHGT child is fully redeemed, is not eligible.
   */
  private loadSgBalanceEligibility(list: BalanceContract[], eligible: Set<string>, onDone: () => void): void {
    eligible.clear();
    if (!list.length) {
      onDone();
      return;
    }
    forkJoin(
      list.map((c) =>
        this.api.catalog('SHGT', 'ACTIVE', undefined, 1, 50, c.naturalKey.lcNumber).pipe(
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
