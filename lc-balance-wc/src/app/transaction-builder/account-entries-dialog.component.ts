import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BalanceMovement } from './balance-component-api.service';
import { TbIconComponent } from '../tb-icon.component';
import {
  InstrumentType,
  displayStatus as displayStatusRule,
  statusBadgeClass as statusBadgeClassRule,
  statusBadgeIcon as statusBadgeIconRule,
  displayMovementType as displayMovementTypeRule,
  accountingSetLabel,
  accountingSetStatusLabel,
  accountingSetStatusBadgeClass,
} from './balance-component.model';
import { TransactionStatusBadgeComponent } from './transaction-status-badge.component';
import { MonetaryAmountPipe } from './monetary-amount.pipe';

/**
 * The "View Voucher" pop-up (analysis/contingent-liability-ledger.html) — a genuine Angular child
 * component, not a service, since it's purely presentational: it only ever displays a `BalanceMovement`
 * already resolved by the caller and emits `closed`, never reading or mutating
 * `TransactionBuilderComponent`'s own Maker/Checker state.
 *
 * Modeled on `IndexPickerComponent` — classic `@Input()`/`@Output()` decorators, `standalone: true`,
 * and its own `.spec.ts` constructs it via a plain `new AccountEntriesDialogComponent()` (the same
 * "no TestBed" convention every spec file in this project uses — nothing under test here needs
 * Angular's own view-creation/change-detection pipeline; that's exercised instead by `ng build`'s
 * strict-template check plus a live in-browser pass).
 *
 * `displayStatus()`/`statusBadgeClass()` are shared, exported pure functions
 * (balance-component.model.ts, next to `isEarmarkFunction()` which both already call) rather than
 * duplicated here — this component and the parent's own remaining template call sites (Look Up Current
 * Balance's Event Timeline, Inquire Events' merged table) share one implementation of the
 * EARMARKING/EARMARKED-vs-PENDING/APPROVED rule.
 */
@Component({
  selector: 'app-account-entries-dialog',
  imports: [CommonModule, TbIconComponent, TransactionStatusBadgeComponent, MonetaryAmountPipe],
  templateUrl: './account-entries-dialog.component.html',
  styleUrl: './account-entries-dialog.component.scss',
})
export class AccountEntriesDialogComponent {
  /** The parent controls whether this component exists at all (`*ngIf="accountEntryDialogMovement"` on the `<app-account-entries-dialog>` tag) — never actually null at render time, but stays nullable to match this project's own defensive-typing convention for every other `@Input` of this shape. */
  @Input() movement: BalanceMovement | null = null;
  /** `BalanceMovement` carries no `instrumentType` of its own (only its parent `BalanceContract` does) — see `TransactionBuilderComponent`'s own `accountEntryDialogInstrumentType` field, which resolves and passes this in. */
  @Input() instrumentType: InstrumentType | null = null;
  /** Inquire Events' own 'primary'/'create'/'finalize' phase — needed to correctly exclude A4's own 'finalize' row from being mislabeled EARMARKED. `null`/omitted from every other call site, which is already correct there — see `isEarmarkFunction()`'s own doc comment. */
  @Input() phase: 'primary' | 'create' | 'finalize' | null = null;
  /**
   * A6/B4 Accounting Event Ownership Rule (business-confirmed 2026-08-27/28, see CLAUDE.md's own entry
   * of the same name) — set only when `movement` is the surviving row of a merged A6 or B4-Usance
   * business event (`InquireEventsService.mergeAccountingEventRows()`): the OTHER half's own Account
   * Entries set, shown alongside `movement`'s own so a reader never needs a second row/dialog to see both
   * halves of the one business event. `null` everywhere else — every other function still shows exactly
   * one set, unchanged.
   */
  @Input() linkedMovement: BalanceMovement | null = null;

  /** Backdrop click, the × button, or the Close button — the parent nulls out its own dialog state in response. */
  @Output() closed = new EventEmitter<void>();

  /**
   * Aliased at the import site (BAL-136-style readability fix) so this method body unambiguously calls
   * the shared free function, not itself recursively.
   *
   * Business-confirmed 2026-08-27 ("Transaction Status 與 Account Entries Status 必須保持一致") — was
   * missing `acknowledgedAt`, so a PENDING, already Checker-acknowledged A3/A3S movement showed
   * "EARMARKING" here even while every other screen (Maker Queue, Look Up Current Balance, the Checker
   * panel itself) correctly showed "EARMARKED" for the SAME record — this dialog is the one remaining
   * `displayStatus()`/`statusBadgeClass()` call site that hadn't been wired up. Read straight off
   * `this.movement` rather than adding a template parameter — this component only ever displays its own
   * `@Input() movement`, never a second one.
   */
  displayStatus(status: string): string {
    return displayStatusRule(status, this.instrumentType, this.movement?.movementType, this.phase, this.movement?.acknowledgedAt);
  }

  /** Same aliasing reasoning as `displayStatus()` immediately above. */
  statusBadgeClass(status: string): string {
    return statusBadgeClassRule(status, this.instrumentType, this.movement?.movementType, this.phase, this.movement?.acknowledgedAt);
  }

  /** P2 UI/UX pass — status conveyed by icon, not color alone. */
  statusBadgeIcon(status: string) {
    return statusBadgeIconRule(this.statusBadgeClass(status));
  }

  /** Same B2 AMEND_INCREASE/AMEND_DECREASE relabeling as `displayMovementType()` in `balance-component.model.ts`. */
  displayMovementType(): string {
    return displayMovementTypeRule(this.instrumentType, this.movement?.movementType, this.movement?.amount);
  }

  /** A6/B4/A3S Accounting Event Ownership Rule — "Set" labels for the two-set case, each derived independently from its OWN movementType (see `accountingSetLabel()`'s own doc comment for the orientation bug this fixes). */
  get primarySetLabel(): string {
    return accountingSetLabel(this.movement?.movementType);
  }

  get linkedSetLabel(): string {
    return accountingSetLabel(this.linkedMovement?.movementType);
  }

  /**
   * Business-confirmed 2026-08-28 ("A3S 一套帳是 EARMARKING/EARMARKED... 一套帳是 PENDING/APPROVED... 這是
   * 業務需求") — the two sets can be on genuinely different lifecycles, so each gets its OWN status badge
   * rather than sharing the one at the dialog's own top level (which only ever reflects `movement`, via
   * this component's own real `@Input() instrumentType`). The linked movement carries no contract of its
   * own here — `accountingSetStatusLabel()`/`accountingSetStatusBadgeClass()` derive it from movementType
   * alone, sufficient within this feature's own narrow scope (see their own doc comment).
   */
  get linkedSetStatus(): string {
    return accountingSetStatusLabel(this.linkedMovement, this.linkedSetPhase);
  }

  get linkedSetStatusBadgeClass(): string {
    return accountingSetStatusBadgeClass(this.linkedMovement, this.linkedSetPhase);
  }

  get linkedSetStatusIcon() {
    return statusBadgeIconRule(this.linkedSetStatusBadgeClass);
  }

  /**
   * A3 UTILIZE is only an internal earmark and never reaches the accounting system. When the same
   * linked record is rendered inside the A6 voucher, the rows represent A6's real LC-balance accounting
   * set (not a reversal of A3 accounting) and must follow the compound A6 PENDING -> APPROVED lifecycle.
   * Outside an A6 voucher, A3/A3S keeps its EARMARKING -> EARMARKED vocabulary unchanged.
   */
  private get linkedSetPhase(): 'finalize' | null {
    return this.instrumentType === 'IPLC_ACCEPTANCE' && this.movement?.movementType === 'CREATE' && this.linkedMovement?.movementType === 'UTILIZE'
      ? 'finalize'
      : null;
  }
}
