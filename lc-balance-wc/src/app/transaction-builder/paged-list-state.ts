/**
 * BAL-003 (OOD/SOLID follow-up, 2026-08-16): single-responsibility state
 * holder for one paginated picker's page/total/pageSize bookkeeping and
 * boundary math. Before this extraction, `TransactionBuilderComponent`
 * carried three near-identical copies of this same trio of fields (catalog
 * LC Index, Parent LC picker, IB/SG Index), the same
 * `Math.max(1, Math.ceil(total / pageSize))` totalPages formula, and the
 * same "am I already at the first/last page" boundary check — one instance
 * of this class per picker replaces all three copies with one tested
 * implementation (Single Responsibility), and adding a fourth paginated
 * picker in the future needs no new copy-pasted math (Open/Closed).
 *
 * Deliberately does not own the actual fetch — `loadPagedCatalog()` (and
 * its three call sites' own `setPage`/`setTotal` callbacks) still decide
 * WHEN and HOW to reload; this class only answers "what page should Prev/
 * Next go to" and "how many pages are there".
 */
export class PagedListState {
  page = 1;
  total = 0;

  constructor(readonly pageSize: number) {}

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  reset(): void {
    this.page = 1;
    this.total = 0;
  }

  /** Target page for a "Prev" click, or null if already on page 1. */
  prevTarget(): number | null {
    return this.page > 1 ? this.page - 1 : null;
  }

  /** Target page for a "Next" click, or null if already on the last page. */
  nextTarget(): number | null {
    return this.page < this.totalPages ? this.page + 1 : null;
  }
}
