import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BalanceSnapshot } from './balance-component-api.service';
import { MonetaryAmountPipe } from './monetary-amount.pipe';

/**
 * `{before, after}` strings from a movement's own `balanceBefore`/`balanceAfter` — both null while the
 * movement is still PENDING (Confirmed Balance doesn't move until Release). See this component's own
 * template for how `snapshot.redirectedImpact` takes priority over this when present.
 */
export interface BalanceSnapshotImpact {
  before: string | null | undefined;
  after: string | null | undefined;
}

export interface PendingAmendmentDisplay {
  reference: string | null;
  balanceEffect: string;
  toleranceBeforePct: string;
  toleranceAfterPct: string | null;
  isPending: boolean;
}

/**
 * Part B (2026-08-21, "next sprint" tech-debt proposal, actioned same day at user request — "Part B 也一起做吧") —
 * extracted from the former `#balanceSnapshotBox` `ng-template` in `transaction-builder.component.html`
 * (2026-08-17), which `*ngTemplateOutlet` invoked from both the Look Up panel (Transaction Processing) and
 * Inquire Events. A `ng-template` reference variable is local to the template that declares it, so once
 * Inquire Events itself became its own child component (`InquireEventsComponent`, same pass), the outlet
 * could no longer reach across that component boundary — converting to a real, standalone component is
 * both the fix for that and the natural next step of the "one canonical box" intent the original 2026-08-17
 * extraction already stated. Byte-for-byte identical rendering to the old template in both call sites.
 */
@Component({
  selector: 'app-balance-snapshot-box',
  imports: [CommonModule, MonetaryAmountPipe],
  templateUrl: './balance-snapshot-box.component.html',
  styleUrl: './balance-snapshot-box.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalanceSnapshotBoxComponent {
  @Input() title: string | null = null;
  @Input() status: string | null | undefined = null;
  @Input() snapshot: BalanceSnapshot | null = null;
  /** Omitted (stays null) by the Look Up panel's own call site — that box shows plain, unannotated Confirmed Balance, unchanged. Only Inquire Events passes a real value. */
  @Input() impact: BalanceSnapshotImpact | null = null;
  /** A2/B2 only: the selected PENDING amendment's own tolerance-adjusted balance delta, before netting other pending movements. */
  @Input() pendingAmendmentBalanceEffect: string | null = null;
  /** A2/B2 only: the tolerance captured on the selected amendment proposal. */
  @Input() amendmentTolerancePct: string | null = null;
  /** A2/B2 only: the contract tolerance still in force before the selected PENDING proposal is Released. */
  @Input() amendmentToleranceBeforePct: string | null = null;
  @Input() amendmentIsPending = true;
  /** Current Balance may contain more than one independently addressable PENDING amendment. */
  @Input() pendingAmendments: readonly PendingAmendmentDisplay[] = [];
  @Input() variant: 'full' | 'compact' = 'full';
  @Input() appearance: 'current' | 'default' = 'current';
}
