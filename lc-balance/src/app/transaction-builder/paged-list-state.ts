/**
 * Single-responsibility state holder for one paginated picker's page/total/pageSize bookkeeping and
 * boundary math — replaces near-identical copies of this trio across the catalog LC Index, Parent LC
 * picker, and IB/SG Index with one tested implementation.
 *
 * Deliberately does not own the actual fetch — callers still decide WHEN and HOW to reload; this class
 * only answers "what page should Prev/Next go to" and "how many pages are there".
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
