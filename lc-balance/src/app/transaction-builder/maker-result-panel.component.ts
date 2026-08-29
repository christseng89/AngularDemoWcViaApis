import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BalanceMovement } from './balance-component-api.service';
import { InstrumentType, displayStatus } from './balance-component.model';
import type { CompoundLegState } from './maker-panel.component';
import { TransactionStatusPhase } from './transaction-status-badge.component';
import { FeedbackMessageComponent } from '../shared/feedback/feedback-message.component';
import { UiMessage } from '../shared/feedback/ui-message.model';
import { presentApiError } from '../shared/feedback/api-error-presenter';

export interface MakerAccountEntriesRequest {
  movement: BalanceMovement;
  instrumentType: InstrumentType | null;
  phase?: TransactionStatusPhase;
}

/** Pure presentation boundary for the Maker's post-submit result and its semantic actions. */
@Component({
  selector: 'app-maker-result-panel',
  standalone: true,
  imports: [CommonModule, FeedbackMessageComponent],
  templateUrl: './maker-result-panel.component.html',
  styleUrl: './maker-result-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MakerResultPanelComponent {
  @Input() result: BalanceMovement | null = null;
  @Input() error: string | null = null;
  @Input() instrumentType: InstrumentType | null = null;
  @Input() resultPhase: TransactionStatusPhase = null;
  @Input() compoundLegs: CompoundLegState | null = null;
  @Input() fixPendingSupported = false;
  @Input() fixPendingMode = false;
  @Input() deletePendingReviewMode = false;
  @Input() actionBusy = false;

  @Output() openAccountEntries = new EventEmitter<MakerAccountEntriesRequest>();
  @Output() fixPending = new EventEmitter<void>();

  get errorFeedback(): UiMessage | null {
    if (!this.error) return null;
    return { ...presentApiError({ message: this.error }, 'SUBMIT'), retryable: false };
  }

  get statusLabel(): string {
    if (!this.result?.status) return '';
    return displayStatus(
      this.result.status,
      this.instrumentType,
      this.result.movementType,
      this.resultPhase,
      this.result.acknowledgedAt,
    );
  }

  openEntries(movement: BalanceMovement, instrumentType: InstrumentType | null, phase?: TransactionStatusPhase): void {
    this.openAccountEntries.emit({ movement, instrumentType, phase });
  }
}
