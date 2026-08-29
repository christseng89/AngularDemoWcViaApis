import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/** Reusable presentation-only search control. Query ownership and search behavior stay with its caller. */
@Component({
  selector: 'app-transaction-search-field',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './transaction-search-field.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionSearchFieldComponent {
  @Input({ required: true }) label = '';
  @Input() value = '';
  @Input() placeholder = '';
  @Input() loading = false;
  @Input() required = false;
  @Input() idleText = 'Search';
  @Input() busyText = 'Searching…';

  @Output() valueChange = new EventEmitter<string>();
  @Output() searchRequested = new EventEmitter<void>();

  requestSearch(): void {
    if (!this.loading) this.searchRequested.emit();
  }
}
