import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { BalanceComponentApiService, BalanceContract, CatalogPage } from './balance-component-api.service';
import { defaultLcInstrumentTypeForSide } from './balance-component.model';
import { describeApiError, notFoundMessage } from './api-error';
import { PagedListState } from './paged-list-state';

/**
 * Single-responsibility "Import/Export side → LC Catalog (ordered by LC Number) → Search/Page" browsing
 * behavior — extracted (SOLID/DRY) so this shape isn't hand-duplicated between every screen that starts
 * with the same LC-picker step. Two seams make it reusable across genuinely different catalog SOURCES and
 * ROW shapes without subclassing:
 *
 * - `fetchPage` — how to fetch one page of contracts for the current side/search/page. Defaults to the
 *   general `BalanceComponentApiService.catalog()` browse (every contract of the instrumentType).
 *   `InquireDeletePendingService` passes a DIFFERENT source instead — `catalogWithDeletePendingHistory()`
 *   (business-directed 2026-08-27, "只有被 DELETE PENDING 過的才顯示": only LC Numbers with at least one
 *   `delete_pending_audit` record) — same page shape (`CatalogPage`), genuinely different WHERE clause.
 * - `decorate` — how to turn a page of raw `BalanceContract`s into this caller's own row shape. Defaults
 *   to identity (`InquireDeletePendingService`'s own LC Catalog row IS `LcIndexRow` via
 *   `computeLcIndexRow()`, passed in explicitly — see that service's own doc comment).
 *
 * `InquireEventsService.loadIndex()` is a structurally similar case (same `computeLcIndexRow()` per-row
 * decoration) but isn't migrated onto this class in this pass — its own `indexRows`/`indexSearch`/etc.
 * field names are directly bound in `inquire-events.component.html` and covered by ~80 existing tests, so
 * renaming/re-routing that already-shipped surface is a separate, dedicated refactor with its own
 * regression risk, not a side effect of building this new screen. Flagged here as the intended next step,
 * same "narrower scope, don't force-unify a genuinely different design" reasoning this codebase already
 * used once before (see CLAUDE.md's own F-09 entry).
 */
export class LcCatalogIndexService<TRow = BalanceContract> {
  constructor(
    api: BalanceComponentApiService,
    private readonly decorate: (contracts: BalanceContract[], side: 'IMPORT' | 'EXPORT') => Observable<TRow[]> = (contracts) => of(contracts as unknown as TRow[]),
    /** Passed through to the default `fetchPage`'s own `excludeCancelled` — see `catalog()`'s doc comment. Ignored entirely when `fetchPage` is overridden. Default false: most catalog browsers (this class's original use case) want every status. */
    excludeCancelled = false,
    private readonly fetchPage: (side: 'IMPORT' | 'EXPORT', search: string | undefined, page: number, pageSize: number) => Observable<CatalogPage> = (side, search, page, pageSize) =>
      api.catalog(defaultLcInstrumentTypeForSide(side), undefined, search, page, pageSize, undefined, undefined, undefined, excludeCancelled),
  ) {}

  side: 'IMPORT' | 'EXPORT' = 'IMPORT';
  search = '';
  rows: TRow[] = [];
  loading = false;
  error: string | null = null;
  /** Raw transport error retained for semantic UI classification; `error` remains the compatible display string. */
  errorCause: unknown | null = null;
  readonly paging = new PagedListState(10);

  get entityLabel(): string {
    return this.side === 'IMPORT' ? 'Import LC' : 'Export Confirmed LC';
  }

  /**
   * "Search — No Match Message" rule (business-directed, applies to every Search button) — once the
   * user has actually typed a filter and searched, an empty result reads as "{query} not found"; the
   * caller's own generic `noneFoundSuffix` phrase (e.g. "with Delete Pending history") stays reserved
   * for the genuinely no-query-typed browse case.
   */
  emptyMessage(noneFoundSuffix: string): string {
    const query = this.search.trim();
    return query ? notFoundMessage(query) : `No ${this.entityLabel} ${noneFoundSuffix} found.`;
  }

  /**
   * Stylesheet unification rule (business-directed, "顯示STYLESHEET 應該統一 參考CHECKER") — see
   * `MakerQueueService.emptyStateIsError`'s own doc comment for the full rationale; same shape here.
   */
  get emptyMessageIsError(): boolean {
    return !!this.search.trim();
  }

  selectSide(side: 'IMPORT' | 'EXPORT'): void {
    this.side = side;
    this.search = '';
    this.paging.reset();
    this.load(1);
  }

  load(page: number = this.paging.page): void {
    this.loading = true;
    this.error = null;
    this.errorCause = null;
    this.fetchPage(this.side, this.search.trim() || undefined, page, this.paging.pageSize)
      .pipe(
        switchMap((result) => {
          if (!result.items.length) return of({ result, rows: [] as TRow[] });
          return this.decorate(result.items, this.side).pipe(map((rows) => ({ result, rows })));
        }),
      )
      .subscribe({
        next: ({ result, rows }) => {
          this.paging.total = result.total;
          this.paging.page = result.page;
          this.rows = rows;
          this.loading = false;
        },
        error: (err) => {
          this.loading = false;
          this.errorCause = err;
          this.error = describeApiError(err);
          this.rows = [];
          this.paging.total = 0;
        },
      });
  }

  searchNow(): void {
    this.load(1);
  }

  prevPage(): void {
    const target = this.paging.prevTarget();
    if (target) this.load(target);
  }

  nextPage(): void {
    const target = this.paging.nextTarget();
    if (target) this.load(target);
  }
}
