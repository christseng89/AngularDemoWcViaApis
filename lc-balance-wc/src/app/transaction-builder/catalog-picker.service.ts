import { catchError, forkJoin, of } from 'rxjs';
import { BalanceComponentApiService, BalanceContract, BalanceSnapshot } from './balance-component-api.service';
import { InstrumentType } from './balance-component.model';
import { PagedListState } from './paged-list-state';

/**
 * Display page size for every picker this service backs — applies uniformly to both the Primary Key
 * Index and 2ndary Key Index pickers. Independent from `fetchSize` (the constructor's own first param,
 * how many raw candidates are fetched from the server in one shot) — see this class's own module note
 * below for why the two numbers serve different purposes and must not be conflated.
 */
const DISPLAY_PAGE_SIZE = 5;

/**
 * One instance of this plain class replaces one paginated picker's (Catalog LC Index / Parent LC
 * picker / IB-SG Index) OWN load-and-page state — `contracts`/`search`/`snapshots`/paging — and the
 * fetch/populate body previously duplicated three times over.
 *
 * Deliberately does NOT own selection (`onSelectContract`/`onSelectParent`/`onSelectIbIndex`) or the
 * business-rule filtering (`filteredCatalogContracts`/`filteredParentCatalog`/`filteredIbIndexCatalog`)
 * — those read/mutate `model`/`selectedFunction`/`selectedContract`/`selectedParent` and cascade into
 * other loads, i.e. they're Maker-flow orchestration, not picker bookkeeping, and stay on
 * `TransactionBuilderComponent` itself. Each picker's own guard condition and `tenorFamily`/`onLoaded`
 * hook are still supplied by that picker's own thin wrapper method on the component.
 *
 * Fetches a single, generous batch (`fetchSize`) and paginates CLIENT-side over the caller's own
 * filtered result, rather than paginating the raw server response — a filtered "N total, Page X of Y"
 * figure needs every candidate's own filter outcome known up front, which a per-server-page fetch can't
 * give. `page`/`total`/`totalPages` genuinely describe the qualified set; Prev/Next never trigger a new
 * HTTP call. `total` is set via the `qualifies` callback at two points — immediately once `contracts`
 * arrives, and again once `loadSnapshotsInto()` finishes — since a caller's own filter (the 0-balance
 * exclusion) can depend on `snapshots`, which fills in asynchronously.
 *
 * `status`/`requireIssueReleased` are overridable (desiger-comments.md F-09) — both default to the
 * original hardcoded values (`'ACTIVE'`/`true`), correct for the three existing Maker-ACTION pickers
 * this class backs but wrong for a read-only INQUIRY browse.
 *
 * Deliberately does NOT make `InquireEventsService.loadIndex()` switch to this class — `loadIndex()`
 * uses genuine SERVER-side pagination (no client-side qualifying filter to reconcile against, the
 * opposite of why this class paginates client-side) and enriches each row with a full merged Event
 * Timeline fetch this class has no equivalent for. Forcing the two together would mean this class owning
 * two incompatible pagination models for its one real caller — worse than the current, disclosed
 * duplication.
 */
export class CatalogPickerService {
  contracts: BalanceContract[] = [];
  search = '';
  readonly snapshots = new Map<string, BalanceSnapshot>();
  private readonly paging: PagedListState;

  constructor(
    private readonly fetchSize: number,
    private readonly api: BalanceComponentApiService,
  ) {
    this.paging = new PagedListState(DISPLAY_PAGE_SIZE);
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
  get pageSize(): number {
    return this.paging.pageSize;
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

  load(args: {
    guardFails: boolean;
    instrumentType: InstrumentType;
    lcNumber?: string;
    tenorFamily?: 'SIGHT' | 'USANCE';
    onLoaded?: (items: BalanceContract[]) => void;
    /** Computes the TRUE qualified/total count (the caller's own filteredXxxCatalog getter's own length), called once right after `contracts` is set and again once `snapshots` finishes loading. Omit for a picker with no separate qualifying filter. */
    qualifies?: () => number;
    /** Override for a non-Maker-action caller. Omitted defaults to `'ACTIVE'`; pass `null` explicitly to request NO status filter (every status a legitimate candidate — e.g. a read-only inquiry browse). */
    status?: string | null;
    /** Override for a non-Maker-action caller; defaults to `true`. */
    requireIssueReleased?: boolean;
  }): void {
    this.resetPaging();
    if (args.guardFails) {
      this.contracts = [];
      return;
    }
    // requireIssueReleased: true (default) — every A1-A9/B1-B5 Maker-side ACTION picker (flat Catalog,
    // Parent LC, IB/SG Index — this ONE service backs all three) should only ever offer a contract whose
    // own creating movement has already cleared Checker approval. See
    // BalanceComponentApiService.catalog()'s own doc comment for why this is opt-in.
    const status = args.status === undefined ? 'ACTIVE' : (args.status ?? undefined);
    const requireIssueReleased = args.requireIssueReleased ?? true;
    this.api
      .catalog(args.instrumentType, status, this.search || undefined, 1, this.fetchSize, args.lcNumber, args.tenorFamily, requireIssueReleased)
      .subscribe({
        next: (result) => {
          this.contracts = result.items;
          this.total = args.qualifies ? args.qualifies() : result.items.length;
          this.loadSnapshotsInto(result.items, () => {
            this.total = args.qualifies ? args.qualifies() : this.contracts.length;
          });
          args.onLoaded?.(result.items);
        },
        error: () => {
          this.contracts = [];
        },
      });
  }

  /** Fetches each candidate's live balance so the component's own filteredXxxCatalog getters can exclude 0-balance ones. `onDone` lets the caller recompute its own qualified total once snapshots are actually in place. */
  private loadSnapshotsInto(list: BalanceContract[], onDone?: () => void): void {
    this.snapshots.clear();
    if (!list.length) {
      onDone?.();
      return;
    }
    forkJoin(list.map((c) => this.api.getSnapshot(c.balanceContractId).pipe(catchError(() => of(null))))).subscribe((snaps) => {
      list.forEach((c, i) => {
        const snap = snaps[i];
        if (snap) this.snapshots.set(c.balanceContractId, snap);
      });
      onDone?.();
    });
  }
}
