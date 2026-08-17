import { catchError, forkJoin, of } from 'rxjs';
import { BalanceComponentApiService, BalanceContract, BalanceSnapshot } from './balance-component-api.service';
import { InstrumentType } from './balance-component.model';
import { PagedListState } from './paged-list-state';

/**
 * BAL-003 (8th same-day OOD/SOLID pass, narrower scope confirmed by the user after a full
 * selection-flow extraction was investigated and found too entangled with Maker orchestration —
 * see this class's own module note and the CLAUDE.md decision-log entry for the full reasoning):
 * one instance of this plain class replaces one paginated picker's (Catalog LC Index / Parent LC
 * picker / IB-SG Index) OWN load-and-page state — `contracts`/`search`/`snapshots`/paging — and the
 * `loadPagedCatalog()` fetch/populate body previously shared (via callback params) across all three.
 *
 * Deliberately does NOT own selection (`onSelectContract`/`onSelectParent`/`onSelectIbIndex`) or the
 * business-rule filtering (`filteredCatalogContracts`/`filteredParentCatalog`/`filteredIbIndexCatalog`)
 * — those read/mutate `model`/`selectedFunction`/`selectedContract`/`selectedParent` and cascade into
 * other loads (payable movements, SG-for-arrival, Checker sync), i.e. they're Maker-flow orchestration,
 * not picker bookkeeping, and stay on `TransactionBuilderComponent` itself. Each picker's own DIFFERENT
 * guard condition (e.g. Catalog also blocks on `isCreatingMovement`, IB Index requires a picked LC
 * Number) and its `tenorFamily`/`onLoaded` hook are still supplied by that picker's own thin wrapper
 * method on the component — only the fetch/populate/error shape that was byte-for-byte identical three
 * times over (plus each picker's own page/total/search/snapshots fields) moved here.
 */
export class CatalogPickerService {
  contracts: BalanceContract[] = [];
  search = '';
  readonly snapshots = new Map<string, BalanceSnapshot>();
  private readonly paging: PagedListState;

  constructor(
    pageSize: number,
    private readonly api: BalanceComponentApiService,
  ) {
    this.paging = new PagedListState(pageSize);
  }

  get page(): number {
    return this.paging.page;
  }
  set page(page: number) {
    this.paging.page = page;
  }
  get total(): number {
    return this.paging.total;
  }
  set total(total: number) {
    this.paging.total = total;
  }
  get totalPages(): number {
    return this.paging.totalPages;
  }

  resetPaging(): void {
    this.paging.reset();
  }

  prevTarget(): number | null {
    return this.paging.prevTarget();
  }

  nextTarget(): number | null {
    return this.paging.nextTarget();
  }

  load(args: { guardFails: boolean; instrumentType: InstrumentType; page: number; lcNumber?: string; tenorFamily?: 'SIGHT' | 'USANCE'; onLoaded?: (items: BalanceContract[]) => void }): void {
    this.page = args.page;
    if (args.guardFails) {
      this.contracts = [];
      this.total = 0;
      return;
    }
    this.api.catalog(args.instrumentType, 'ACTIVE', this.search || undefined, args.page, this.paging.pageSize, args.lcNumber, args.tenorFamily).subscribe({
      next: (result) => {
        this.contracts = result.items;
        this.total = result.total;
        this.loadSnapshotsInto(result.items);
        args.onLoaded?.(result.items);
      },
      error: () => {
        this.contracts = [];
        this.total = 0;
      },
    });
  }

  /** Business instruction 2026-08-14: fetch each candidate's live balance so the component's own filteredXxxCatalog getters can exclude 0-balance ones — never lets a picker offer a target an action would immediately fail against. */
  private loadSnapshotsInto(list: BalanceContract[]): void {
    this.snapshots.clear();
    if (!list.length) return;
    forkJoin(list.map((c) => this.api.getSnapshot(c.balanceContractId).pipe(catchError(() => of(null))))).subscribe((snaps) => {
      list.forEach((c, i) => {
        const snap = snaps[i];
        if (snap) this.snapshots.set(c.balanceContractId, snap);
      });
    });
  }
}
