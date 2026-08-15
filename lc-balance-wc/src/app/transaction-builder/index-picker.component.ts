import { Component, ContentChild, EventEmitter, Input, Output, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * Business instruction 2026-08-15 ("Index LC and 2ndary Number should be
 * the same style" / "professional UI patterns without change the
 * functionality") — one shared presentation shell for every "pick from a
 * list of LC/IB/SG/pending-movement records" spot in the Transaction
 * Builder (LC Index, Parent LC picker, IB/SG "2ndary Index", A3S's SG
 * picker, A4/A6's PENDING Document Arrival picker, the Look Up panel's
 * Acceptance/SG pickers). Deliberately a pure PRESENTATION wrapper — it
 * owns none of the search/pagination/selection STATE or business logic,
 * only how a list of items is search-boxed, laid out as clickable rows,
 * paginated, and how loading/empty states read. Every call site keeps its
 * own existing component state and handler methods untouched; only the
 * markup around them changes, which is what keeps this a pure UI/UX
 * restyle rather than a functional change.
 *
 * Row content is fully caller-controlled via content projection
 * (`<ng-template let-item>…</ng-template>`) — different pickers show very
 * different fields per row (an LC shows Number+Status+Pending hint; a
 * pending movement shows IB Number+Amount+earmark time; a Look Up SG shows
 * SG Number+Status only), and this component has no opinion about that.
 */
@Component({
  selector: 'app-index-picker',
  standalone: true,
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
   * Every item in this app is either a BalanceContract (id = balanceContractId only) or a
   * BalanceMovement (id = movementId — but a BalanceMovement ALSO carries its own parent
   * balanceContractId as an ordinary field, e.g. the Checker queue's / A4/A6's payableMovements
   * pickers). Bug (reviewer-reported 2026-08-15, "S001 Amendment A01... no Check Function to
   * Approve" — clicking a movement row silently selected nothing): checking balanceContractId
   * FIRST meant every movement row's id resolved to its PARENT CONTRACT's id instead of its own
   * movementId, so onSelectCheckerMovement()/onSelectPayMovement() never found a match in their
   * own movement-keyed lists. movementId must be checked first — only a BalanceContract lacks it.
   */
  itemId(item: unknown): string {
    const row = item as { balanceContractId?: string; movementId?: string };
    return row.movementId ?? row.balanceContractId ?? '';
  }
}
