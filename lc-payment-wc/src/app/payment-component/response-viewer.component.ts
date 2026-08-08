import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AccountEntry, ClassificationResult, SwiftMessage } from './payment-component.types';
import type { FxPairEntry } from './leg-allocator.component';

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
  /**
   * NOT sent to the microservice — a client-side-computed preview
   * (leg-allocator.component.ts's fxPairs getter, one instance's worth per
   * side), rendered here (not inside <app-leg-allocator> itself) so it reads
   * right after the Settlement Vouchers table it explains, rather than
   * mid-form before any result even exists. See
   * business-case-runner.component.html's [debitFxPairs]/[creditFxPairs]
   * bindings (template reference variables on the two <app-leg-allocator>
   * elements).
   */
  @Input() debitFxPairs: FxPairEntry[] = [];
  @Input() creditFxPairs: FxPairEntry[] = [];

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
