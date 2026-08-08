import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { CurrencyService } from './currency.service';
import type { SourceComponent } from './payment-component.types';

export interface SuspenseEntry {
  amount: string;
  currency: string;
  /**
   * Which upstream component this entry represents the offsetting leg for —
   * a UI-friendly "Charge"/"Liability" dropdown, stored using the same wire
   * values as SuspenseBridgeEntry.sourceComponent (payment-component.types.ts):
   * 'CHARGE' for Charge, 'BALANCE' for Liability (there is no 'LIABILITY'
   * wire value — a Balance Component is what books the Liability leg, see
   * that type's own doc comment). Defaults to 'CHARGE' for a new row.
   */
  sourceComponent: SourceComponent;
}

interface Row extends SuspenseEntry {
  id: number;
}

let rowIdCounter = 0;

/**
 * NOT FSD-sourced — a repeatable amount+currency+sourceComponent list for
 * Suspense Debit/Credit (business-case-runner.component.ts's Balance/Charge
 * Component <-> Payment Component accounting bridge — each entry becomes its
 * own raw SuspenseBridgeEntry on the wire, expanded server-side into its own
 * Cr "Suspense - Debit"/"Suspense - Credit" leg — see
 * microservices/payment-component/src/domain/suspenseBridge.ts). Deliberately
 * NOT a Formly `repeat` field: this app never registers a custom repeat type
 * (app.config.ts's FormlyModule.forRoot() takes no `types` config), and this
 * repeater's needs (amount + currency + sourceComponent per row, no %, no
 * account no/type) are far simpler than <app-leg-allocator>'s — a small
 * standalone component, mirroring leg-allocator's own hand-rolled row-array
 * pattern, is more consistent with the codebase than registering Formly's
 * repeat type just for this one case.
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
    this.rows = [...this.rows, { id: rowIdCounter, amount: '', currency: this.defaultCurrency, sourceComponent: 'CHARGE' }];
    this.emit();
  }

  removeRow(row: Row): void {
    this.rows = this.rows.filter((r) => r.id !== row.id);
    this.emit();
  }

  onFieldChange(): void {
    this.emit();
  }

  /**
   * `amount` is typed `string` (SuspenseEntry), but the template's `<input
   * type="number" [(ngModel)]="row.amount">` goes through Angular's built-in
   * NumberValueAccessor (auto-applied for `input[type=number]` + ngModel),
   * which writes an actual JS `number` into `row.amount` at runtime despite
   * the type annotation — TypeScript doesn't catch this because ngModel's
   * two-way binding isn't checked against the bound property's type here.
   * `String(amount)` normalizes back to the declared contract at the one
   * place this component's output crosses a boundary, so every consumer
   * (business-case-runner.component.ts's buildSuspenseBridge(), eventually
   * the wire) can trust SuspenseEntry.amount is genuinely a string — a
   * bare `number` sent as JSON fails the microservice's MonetaryAmount
   * zod pattern (`z.string().regex(...)`) with "Expected string, received
   * number".
   */
  private emit(): void {
    this.entriesChange.emit(
      this.rows.map(({ amount, currency, sourceComponent }) => ({ amount: String(amount), currency, sourceComponent })),
    );
  }
}
