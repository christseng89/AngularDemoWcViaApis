import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TbIconComponent } from '../tb-icon.component';
import { MakerQueueService, MakerQueueRow } from './maker-queue.service';
import { displayStatus as displayStatusShared, statusBadgeClass as statusBadgeClassShared, statusBadgeIcon as statusBadgeIconShared } from './balance-component.model';

/**
 * Part of Fix Pending/Delete Pending Phase 2 (analysis/Balance-Component-FixPending-DeletePending-
 * Proposal-zh.md §2.1) — the view layer for `MakerQueueService`, same "service stays parent-constructed,
 * passed down as a plain `@Input()`" convention `InquireEventsComponent` already established.
 */
@Component({
  selector: 'app-maker-queue',
  standalone: true,
  imports: [CommonModule, FormsModule, TbIconComponent],
  templateUrl: './maker-queue.component.html',
  styleUrl: './maker-queue.component.scss',
})
export class MakerQueueComponent {
  @Input() makerQueue!: MakerQueueService;

  /** Thin delegations to the same pure shared functions the rest of this sub-project uses for status display. */
  readonly displayStatus = displayStatusShared;
  readonly statusBadgeClass = statusBadgeClassShared;
  readonly statusBadgeIcon = statusBadgeIconShared;

  /**
   * Business-confirmed 2026-08-27 ("改成 Delete Pending 統一名稱") — the visible button text is always
   * plain "Delete Pending" (see the template), regardless of which action it routes to underneath
   * (withdrawMakerSubmit() for an A4 row vs. a full cancel() otherwise, MakerQueueService.deletePending()'s
   * own doc comment) — this tooltip is the only place that still discloses which one, for anyone who
   * wants to know before clicking.
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
