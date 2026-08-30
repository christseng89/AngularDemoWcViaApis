import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MakerQueueService, MakerQueueRow } from './maker-queue.service';
import { displayStatus as displayStatusShared, statusBadgeClass as statusBadgeClassShared, statusBadgeIcon as statusBadgeIconShared } from './balance-component.model';
import { TransactionSearchFieldComponent } from './transaction-search-field.component';
import { TransactionPaginationComponent } from './transaction-pagination.component';
import { TransactionStatusBadgeComponent } from './transaction-status-badge.component';
import { FeedbackMessageComponent } from '../shared/feedback/feedback-message.component';
import { UiMessage } from '../shared/feedback/ui-message.model';
import { presentApiError } from '../shared/feedback/api-error-presenter';
import { MonetaryAmountPipe } from './monetary-amount.pipe';

/**
 * Part of Fix Pending/Delete Pending Phase 2 (analysis/Balance-Component-FixPending-DeletePending-
 * Proposal-zh.md §2.1) — the view layer for `MakerQueueService`, same "service stays parent-constructed,
 * passed down as a plain `@Input()`" convention `InquireEventsComponent` already established.
 */
@Component({
  selector: 'app-maker-queue',
  standalone: true,
  imports: [CommonModule, TransactionSearchFieldComponent, TransactionPaginationComponent, TransactionStatusBadgeComponent, FeedbackMessageComponent, MonetaryAmountPipe],
  templateUrl: './maker-queue.component.html',
  styleUrl: './maker-queue.component.scss',
})
export class MakerQueueComponent {
  @Input() makerQueue!: MakerQueueService;
  /**
   * Fix Pending has no self-contained action here (unlike Delete Pending, a plain API call) — it needs
   * the full "return to the real original-event screen" UX only `MakerPanelComponent`/`buildFields()`
   * can provide, so this row is bubbled up to `TransactionBuilderComponent`, which switches to
   * Transaction Processing, selects this row's own resolved Function, and feeds the movement into
   * `MakerPanelComponent`'s own `externalFixPendingRequest` — the same mechanism the in-session button
   * already drives, never a second, separately-built edit UI inside this table.
   */
  @Output() fixPendingRequested = new EventEmitter<MakerQueueRow>();
  /**
   * Delete Pending (2026-08-28, "Maker Queue Delete Pending 也要顯示交易畫面 確認刪除與否") — same "no
   * self-contained action here" reasoning as `fixPendingRequested` above: clicking this button no longer
   * deletes immediately. It bubbles the row up to `TransactionBuilderComponent`, which switches to
   * Transaction Processing, selects the row's own resolved Function, and feeds the movement into
   * `MakerPanelComponent`'s own `externalDeletePendingReviewRequest` — a read-only reconstruction of the
   * real screen, with its own Confirm/Cancel buttons. The actual `MakerQueueService.deletePending()` call
   * (cascade-aware for a compound row) only ever fires once the Maker explicitly confirms there.
   */
  @Output() deletePendingRequested = new EventEmitter<MakerQueueRow>();

  /** Thin delegations to the same pure shared functions the rest of this sub-project uses for status display. */
  readonly displayStatus = displayStatusShared;
  readonly statusBadgeClass = statusBadgeClassShared;
  readonly statusBadgeIcon = statusBadgeIconShared;

  /** Phase 12 migration boundary: the service keeps its stable string state while the view uses standard feedback. */
  get errorFeedback(): UiMessage | null {
    if (!this.makerQueue.error) return null;
    return presentApiError(this.makerQueue.errorCause ?? { message: this.makerQueue.error }, 'SEARCH', this.makerQueue.lcNumberSearch || undefined);
  }

  /**
   * Business-confirmed 2026-08-27 ("改成 Delete Pending 統一名稱") — the visible button text is always
   * plain "Delete Pending" (see the template), regardless of which action it routes to underneath
   * (withdrawMakerSubmit() for an A4 row vs. a full cancel() otherwise, MakerQueueService.deletePending()'s
   * own doc comment) — this tooltip is the only place that still discloses which one, for anyone who
   * wants to know before clicking "Confirm Delete Pending" on the review screen this button now opens.
   */
  deletePendingLabel(row: MakerQueueRow): string {
    if (this.makerQueue.isCompoundShape(row)) {
      return 'Delete Pending (compound) — this row represents every leg of the same Business Event (A3S/B4/B5); deleting it cancels all of them together, not just this one.';
    }
    return this.makerQueue.isWithdrawMakerSubmitCase(row)
      ? 'Delete Pending (A4) — returns this record to A3/A3S\'s own Checker-acknowledged (EARMARKED) state, ready to Maker-Submit A4 again. Does not cancel the underlying Document Arrival.'
      : 'Delete Pending';
  }
}
