import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TbIconComponent } from '../tb-icon.component';
import { contractStatusBadgeClass, contractStatusLabel, statusBadgeIcon } from './balance-component.model';

/** Contract/master-record status presentation. Deliberately separate from movement status. */
@Component({
  selector: 'app-contract-status-badge',
  standalone: true,
  imports: [CommonModule, TbIconComponent],
  templateUrl: './contract-status-badge.component.html',
  styleUrl: './transaction-status-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractStatusBadgeComponent {
  @Input({ required: true }) status = '';
  @Input() closingPending = false;

  get badgeClass(): string {
    return contractStatusBadgeClass(this.status, this.closingPending);
  }

  get icon(): ReturnType<typeof statusBadgeIcon> {
    return statusBadgeIcon(this.badgeClass);
  }

  get label(): string {
    return contractStatusLabel(this.status, this.closingPending);
  }
}
