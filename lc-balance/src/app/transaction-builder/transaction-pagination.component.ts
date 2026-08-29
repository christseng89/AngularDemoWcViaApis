import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

/** Reusable presentation-only pagination control; the parent remains responsible for page changes. */
@Component({
  selector: 'app-transaction-pagination',
  standalone: true,
  templateUrl: './transaction-pagination.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionPaginationComponent {
  @Input() page = 1;
  @Input() totalPages = 1;
  @Input() total = 0;
  @Input() loading = false;

  @Output() previousRequested = new EventEmitter<void>();
  @Output() nextRequested = new EventEmitter<void>();
}
