import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AccountEntry, ClassificationResult, SwiftMessage } from './payment-component.types';

interface BalancePreview {
  debitTotal: string;
  creditTotal: string;
  difference: string;
  balanced: boolean;
}

@Component({
  selector: 'app-response-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './response-viewer.component.html',
  styleUrls: ['./response-viewer.component.scss'],
})
export class ResponseViewerComponent {
  @Input() classification: ClassificationResult | null = null;
  @Input() balance: BalancePreview | null = null;
  @Input() accountEntries: AccountEntry[] | null = null;
  @Input() swiftMessages: SwiftMessage[] | null = null;
  @Input() instructionId: string | null = null;

  get settlementEntries(): AccountEntry[] {
    return (this.accountEntries ?? []).filter((e) => e.voucherType === 'SETTLEMENT');
  }
  get chargeEntries(): AccountEntry[] {
    return (this.accountEntries ?? []).filter((e) => e.voucherType === 'CHARGE');
  }
  get liabilityEntries(): AccountEntry[] {
    return (this.accountEntries ?? []).filter((e) => e.voucherType === 'LIABILITY');
  }
}
