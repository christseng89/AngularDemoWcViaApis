import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TbIconComponent } from '../tb-icon.component';
import { InstrumentType, displayStatus, statusBadgeClass, statusBadgeIcon } from './balance-component.model';

export type TransactionStatusPhase = 'primary' | 'create' | 'finalize' | null;

/** One presentation boundary for movement status label, color and accessible icon. */
@Component({
  selector: 'app-transaction-status-badge',
  imports: [CommonModule, TbIconComponent],
  templateUrl: './transaction-status-badge.component.html',
  styleUrl: './transaction-status-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionStatusBadgeComponent {
  @Input({ required: true }) status = '';
  @Input() instrumentType: InstrumentType | string | null = null;
  @Input() movementType: string | null = null;
  @Input() phase: TransactionStatusPhase = null;
  @Input() acknowledgedAt: string | null | undefined = null;
  @Input() extraClass = '';

  get badgeClass(): string {
    return statusBadgeClass(this.status, this.instrumentType, this.movementType, this.phase, this.acknowledgedAt);
  }

  get icon(): ReturnType<typeof statusBadgeIcon> {
    return statusBadgeIcon(this.badgeClass);
  }

  get label(): string {
    return displayStatus(this.status, this.instrumentType, this.movementType, this.phase, this.acknowledgedAt);
  }
}
