import { catchError, forkJoin, of } from 'rxjs';
import { BalanceComponentApiService, BalanceContract, BalanceSnapshot } from './balance-component-api.service';
import { InstrumentType } from './balance-component.model';
import { PagedListState } from './paged-list-state';

/**
 * Display page size for every picker this service backs (business requirement 2026-08-19, "Page size
 * to 5 records" — applies uniformly to both Primary Key Index [LC Index/Parent LC picker] and 2ndary Key
 * Index pickers). Deliberately independent from `fetchSize` (the constructor's own first param, how many
 * raw candidates are fetched from the server in one shot) — see this class's own module note below for
 * why the two numbers serve different purposes and must not be conflated.
 */
const DISPLAY_PAGE_SIZE = 5;

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
 *
 * Redesigned 2026-08-19 (reviewer-reported live — A3's own flat Catalog picker showed "Page 1 / 2 (12
 * total)" when only 4 candidates were actually qualified, i.e. passed the caller's own business-rule
 * filter): the old design paginated the RAW server response (10 raw contracts per server page) and
 * applied the qualifying filter (0-balance exclusion, tenor match, etc.) AFTERWARD, client-side, on just
 * that one page — so `total`/`totalPages` always reflected the unfiltered server count, never the true
 * qualified count, and a page could legitimately show fewer than `pageSize` rows (or none at all) with
 * no way to know how many qualified rows existed in total without walking every server page by hand.
 * There is no way to show an accurate "N total, Page X of Y" figure for a FILTERED set without knowing
 * every candidate's own filter outcome — which fundamentally requires fetching (and snapshot-checking)
 * every candidate up front, not just the current page. So this class now fetches a single, generous
 * batch (`fetchSize`, e.g. 100 — the same "capped single-shot fetch, not true server pagination"
 * convention `loadSgsForArrival()`/`loadSettleableBalances()`/`loadPayableMovementsAcrossChildContracts()`
 * already use for their own smaller pickers) and paginates CLIENT-SIDE over the caller's own filtered
 * result — `page`/`total`/`totalPages` now genuinely describe the qualified set, and Prev/Next never
 * trigger a new HTTP call (matching `InquireEventsService.eventsPaging`'s own "no per-page API call
 * makes sense once everything is already in memory" reasoning). `total` is set via the new `qualifies`
 * callback at TWO points — immediately once `contracts` arrives (before snapshots resolve) and again
 * once `loadSnapshotsInto()` finishes — since several callers' own filters (the 0-balance exclusion)
 * depend on `snapshots`, which fills in asynchronously; a caller whose filter doesn't touch `snapshots`
 * at all just gets the same correct number both times.
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
    /** Business requirement 2026-08-19 — computes the TRUE qualified/total count (the caller's own filteredXxxCatalog getter's own length), called once right after `contracts` is set and again once `snapshots` finishes loading. Omit for a picker with no separate qualifying filter (total then just tracks the raw fetched count). */
    qualifies?: () => number;
  }): void {
    this.resetPaging();
    if (args.guardFails) {
      this.contracts = [];
      return;
    }
    // requireIssueReleased: true — business-reported gap 2026-08-18 ("S10 still shown in A4 function
    // which is wrong"; "There are function dependency, if pending in previous event, then next event
    // cannot be accessed") — every A1-A9/B1-B5 Maker-side ACTION picker (flat Catalog, Parent LC, IB/SG
    // Index — this ONE service backs all three) should only ever offer a contract whose own creating
    // movement has already cleared Checker approval. See BalanceComponentApiService.catalog()'s own
    // doc comment for why this is opt-in rather than the catalog endpoint's default behavior.
    this.api.catalog(args.instrumentType, 'ACTIVE', this.search || undefined, 1, this.fetchSize, args.lcNumber, args.tenorFamily, true).subscribe({
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

  /** Business instruction 2026-08-14: fetch each candidate's live balance so the component's own filteredXxxCatalog getters can exclude 0-balance ones — never lets a picker offer a target an action would immediately fail against. `onDone` (2026-08-19) lets the caller recompute its own qualified total once snapshots are actually in place — see `load()`'s own doc comment. */
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
