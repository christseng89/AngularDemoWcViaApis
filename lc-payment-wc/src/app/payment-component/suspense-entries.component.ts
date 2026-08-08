import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { CurrencyService } from './currency.service';

export interface SuspenseEntry {
  amount: string;
  currency: string;
}

interface Row extends SuspenseEntry {
  id: number;
}

let rowIdCounter = 0;

/**
 * NOT FSD-sourced — a repeatable amount+currency list for Suspense
 * Debit/Credit (business-case-runner.component.ts's Charge Component /
 * Payment Component accounting bridge — each entry becomes its own
 * Cr "Suspense - Debit"/"Suspense - Credit" leg, see that component's
 * suspenseBridgeLegs() doc comment). Deliberately NOT a Formly `repeat`
 * field: this app never registers a custom repeat type
 * (app.config.ts's FormlyModule.forRoot() takes no `types` config), and this
 * repeater's needs (amount + currency per row, no %, no account no/type) are
 * far simpler than <app-leg-allocator>'s — a small standalone component,
 * mirroring leg-allocator's own hand-rolled row-array pattern, is more
 * consistent with the codebase than registering Formly's repeat type just
 * for this one case.
 */
@Component({
  selector: 'app-suspense-entries',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './suspense-entries.component.html',
  styleUrls: ['./suspense-entries.component.scss'],
})
export class SuspenseEntriesComponent {
  @Input({ required: true }) label!: string;
  /** Seeds a newly-added row's currency (business-case-runner.component.html passes its transactionCurrency) — a starting value the user can still freely change per row, not a constraint. Existing rows are never retroactively changed if this input updates later. */
  @Input() defaultCurrency = '';
  @Output() entriesChange = new EventEmitter<SuspenseEntry[]>();

  rows: Row[] = [];
  readonly currencies$: Observable<string[]>;

  constructor(currency: CurrencyService) {
    this.currencies$ = currency.codes();
  }

  trackById(_index: number, row: Row): number {
    return row.id;
  }

  addRow(): void {
    rowIdCounter += 1;
    this.rows = [...this.rows, { id: rowIdCounter, amount: '', currency: this.defaultCurrency }];
    this.emit();
  }

  removeRow(row: Row): void {
    this.rows = this.rows.filter((r) => r.id !== row.id);
    this.emit();
  }

  onFieldChange(): void {
    this.emit();
  }

  private emit(): void {
    this.entriesChange.emit(this.rows.map(({ amount, currency }) => ({ amount, currency })));
  }
}
