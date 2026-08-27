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

  deletePendingLabel(row: MakerQueueRow): string {
    return this.makerQueue.isCompoundShape(row)
      ? 'Delete Pending not yet supported here for compound submissions (A3S/B4/B5) — use the original Submit session\'s own Delete Pending button.'
      : 'Delete Pending';
  }
}
