import { Component, ContentChild, EventEmitter, Input, Output, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { notFoundMessage } from './api-error';

/**
 * One shared presentation shell for every "pick from a list of LC/IB/SG/pending-movement records" spot
 * in the Transaction Builder (LC Index, Parent LC picker, IB/SG "2ndary Index", A3S's SG picker, A4/A6's
 * PENDING Document Arrival picker, the Look Up panel's Acceptance/SG pickers). A pure PRESENTATION
 * wrapper — owns none of the search/pagination/selection state or business logic, only how a list is
 * search-boxed, laid out as clickable rows, paginated, and how loading/empty states read.
 *
 * Row content is fully caller-controlled via content projection (`<ng-template let-item>…</ng-template>`)
 * — different pickers show very different fields per row, and this component has no opinion about that.
 */
@Component({
  selector: 'app-index-picker',
  imports: [CommonModule, FormsModule],
  templateUrl: './index-picker.component.html',
  styleUrl: './index-picker.component.scss',
})
export class IndexPickerComponent {
  @Input() label = '';
  @Input() items: readonly unknown[] = [];
  @Input() loading = false;
  @Input() selectedId: string | null = null;
  @Input() emptyText = 'Nothing to pick.';
  @Input() autoPickedHint: string | null = null;
  /** Optional compact table headings for transaction/contract selection lists. */
  @Input() columnHeaders: readonly string[] = [];

  /**
   * Reference values are materially longer than Catalog/Status labels. Keep one shared responsive
   * column policy for every A/B-series picker instead of repeating per-screen CSS grid definitions.
   */
  get columnTemplate(): string {
    if (this.columnHeaders.length === 4) {
      return 'minmax(68px, 0.65fr) minmax(0, 1.7fr) minmax(112px, 1fr) minmax(68px, 0.65fr)';
    }
    if (this.columnHeaders.length === 5) {
      return 'minmax(68px, 0.65fr) minmax(0, 1.55fr) minmax(82px, 0.9fr) minmax(108px, 1fr) minmax(68px, 0.65fr)';
    }
    return `repeat(${this.columnHeaders.length}, minmax(0, 1fr))`;
  }

  @Input() searchable = false;
  @Input() searchValue = '';
  @Output() searchValueChange = new EventEmitter<string>();
  @Output() search = new EventEmitter<void>();
  @Input() searchPlaceholder = 'Search…';

  /** Omit (leave at the default 0) to hide pagination entirely — used by the smaller, unpaginated pickers (A3S's SG Index, Look Up's Acceptance/SG pickers). */
  @Input() page = 1;
  @Input() totalPages = 1;
  @Input() total = 0;
  @Output() prevPage = new EventEmitter<void>();
  @Output() nextPage = new EventEmitter<void>();

  @Output() pick = new EventEmitter<string>();

  @ContentChild(TemplateRef) rowTemplate?: TemplateRef<{ $implicit: unknown }>;

  /**
   * "Search — No Match Message" rule (business-directed, shared across every A2–A11/B2–B7 picker that
   * routes through this one presentation component): once the user has actually typed a query and
   * searched, an empty result reads as "{query} not found" — never the caller's generic `emptyText`
   * (that stays reserved for the genuinely-nothing-to-search-yet case, i.e. no query typed at all).
   * Deliberately keyed on `searchValue` alone, not a separate "did the user press Search" flag — the
   * moment a query is present and the result set is still empty, "not found" is already the correct
   * reading regardless of whether that came from pressing the button or the Enter-key shortcut.
   */
  get displayedEmptyText(): string {
    const query = this.searchValue.trim();
    return this.searchable && query ? notFoundMessage(query) : this.emptyText;
  }

  /**
   * Stylesheet unification rule (business-directed, "顯示STYLESHEET 應該統一 參考CHECKER") — a genuine
   * "{query} not found" gets the SAME `.tb-error`-style red-tinted treatment `checkerSearchError`
   * already uses elsewhere in this app; the neutral "nothing to pick at all" case (no query typed)
   * keeps this component's own plain `.index-picker__empty` styling. Copied into this component's own
   * stylesheet rather than referencing `.tb-error` directly — Angular view encapsulation means a class
   * declared in a DIFFERENT component's stylesheet never matches markup rendered by this one (same
   * "disclosed, deliberate copy" convention this codebase already uses elsewhere).
   */
  get isNotFound(): boolean {
    return this.searchable && !!this.searchValue.trim();
  }

  /**
   * Every item in this app is either a BalanceContract (id = balanceContractId only) or a
   * BalanceMovement (id = movementId — but also carries its own parent balanceContractId as an
   * ordinary field). movementId must be checked first: checking balanceContractId first meant every
   * movement row's id resolved to its parent contract's id instead of its own, so the selection
   * handlers never found a match in their own movement-keyed lists.
   */
  itemId(item: unknown): string {
    const row = item as { balanceContractId?: string; movementId?: string };
    return row.movementId ?? row.balanceContractId ?? '';
  }
}
