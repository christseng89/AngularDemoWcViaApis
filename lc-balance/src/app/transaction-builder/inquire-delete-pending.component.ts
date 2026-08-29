import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormlyModule } from '@ngx-formly/core';
import { TbIconComponent } from '../tb-icon.component';
import { InquireDeletePendingService } from './inquire-delete-pending.service';
import { DeletePendingAuditRow } from './balance-component-api.service';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS } from './balance-component.model';
import { TransactionSearchFieldComponent } from './transaction-search-field.component';
import { TransactionPaginationComponent } from './transaction-pagination.component';

/**
 * Inquire Delete Pending (analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md §11, BA &
 * business-directed 2026-08-27) — the view layer for `InquireDeletePendingService`, same "service stays
 * parent-constructed, passed down as a plain `@Input()`" convention `InquireEventsComponent`/
 * `MakerQueueComponent` already established.
 */
@Component({
  selector: 'app-inquire-delete-pending',
  standalone: true,
  imports: [CommonModule, FormsModule, FormlyModule, TbIconComponent, TransactionSearchFieldComponent, TransactionPaginationComponent],
  templateUrl: './inquire-delete-pending.component.html',
  styleUrl: './inquire-delete-pending.component.scss',
})
export class InquireDeletePendingComponent {
  @Input() service!: InquireDeletePendingService;

  /** The full Function picklist (both sides) for the query form's Function filter dropdown — same registries A1–A11/B1–B7 chips are built from. */
  readonly functionOptions = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS];

  functionLabel(row: DeletePendingAuditRow): string {
    const fn = this.service.functionFor(row);
    return fn ? `${fn.code} · ${fn.label}` : '—';
  }
}
