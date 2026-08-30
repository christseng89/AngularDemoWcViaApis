import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProtectedIdentityItem } from './protected-transaction-identity.policy';

@Component({
  selector: 'app-protected-transaction-identity',
  imports: [CommonModule],
  templateUrl: './protected-transaction-identity.component.html',
  styleUrl: './protected-transaction-identity.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProtectedTransactionIdentityComponent {
  @Input() visible = false;
  @Input() items: readonly ProtectedIdentityItem[] = [];
}
