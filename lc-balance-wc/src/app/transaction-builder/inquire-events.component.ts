import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormlyModule } from '@ngx-formly/core';
import { BalanceSnapshotBoxComponent } from './balance-snapshot-box.component';
import { BalanceMovement } from './balance-component-api.service';
import { InquireEventsService, type InquiredEvent } from './inquire-events.service';
import {
  InstrumentType,
  displayStatus as displayStatusShared,
  statusBadgeClass as statusBadgeClassShared,
  contractStatusBadgeClass as contractStatusBadgeClassShared,
  contractStatusLabel as contractStatusLabelShared,
  displayMovementType as displayMovementTypeShared,
  displayMovementAmount as displayMovementAmountShared,
  statusBadgeIcon as statusBadgeIconShared,
} from './balance-component.model';
import { ibNumberLabel as ibNumberLabelShared } from './function-policy';
import { TransactionStatusBadgeComponent } from './transaction-status-badge.component';
import { TransactionSearchFieldComponent } from './transaction-search-field.component';
import { TransactionPaginationComponent } from './transaction-pagination.component';
import { ContractStatusBadgeComponent } from './contract-status-badge.component';
import { FeedbackMessageComponent } from '../shared/feedback/feedback-message.component';
import { UiMessage } from '../shared/feedback/ui-message.model';
import { presentApiError } from '../shared/feedback/api-error-presenter';
import { MonetaryAmountPipe } from './monetary-amount.pipe';
import { amendmentDirection, resultingTolerancePct } from './tolerance-change';

/** Emitted when the "Original Transaction Screen" panel's own Account Entries button is clicked — the dialog itself stays parent-owned (`TransactionBuilderComponent`), since it's also opened from the Maker Result panel and the Look Up panel's own Event Timeline, not just from here. */
export interface InquireOpenAccountEntriesEvent {
  movement: BalanceMovement;
  instrumentType: InstrumentType | null | undefined;
  phase?: 'primary' | 'create' | 'finalize';
  /** See `InquiredEvent.linkedMovement`'s own doc comment (inquire-events.service.ts) — A6's own cascade-linked second Account Entries set, carried through untouched. */
  linkedMovement?: BalanceMovement | null;
}

/**
 * Part B (2026-08-21, "next sprint" tech-debt proposal, actioned same day at user request — "Part B 也一起做吧,
 * 開始extract InquireEventsComponent") — the whole Inquire Events section (side tabs, LC Master Records
 * Index, Events timeline, Original Transaction Screen, Balance Tabs) extracted out of
 * `transaction-builder.component.html`/`.scss` into its own standalone child component, so it gets its own
 * `anyComponentStyle` production-build budget instead of sharing the parent's (which was already, separately,
 * sitting over that 12kb budget — see `transaction-builder.component.scss`'s own "Found, NOT fixed" doc
 * comment history). All actual state/orchestration logic stays exactly where it already was, in
 * `InquireEventsService` (unchanged) — this component only moved the VIEW layer that used to render it
 * directly inside `TransactionBuilderComponent`'s own template. `inquireEvents` stays parent-owned/
 * parent-constructed (unchanged constructor-default-value convention, unchanged
 * `transaction-builder.component.inquire.spec.ts` coverage of that wiring) and is passed down as a plain
 * `@Input()` rather than re-provided here, so `selectMode()`'s own `loadIndex()` call and every other
 * existing behavior around WHEN this section is shown/reset is untouched.
 */
@Component({
  selector: 'app-inquire-events',
  imports: [
    CommonModule,
    FormlyModule,
    BalanceSnapshotBoxComponent,
    TransactionStatusBadgeComponent,
    TransactionSearchFieldComponent,
    TransactionPaginationComponent,
    ContractStatusBadgeComponent,
    FeedbackMessageComponent,
    MonetaryAmountPipe,
  ],
  templateUrl: './inquire-events.component.html',
  styleUrl: './inquire-events.component.scss',
})
export class InquireEventsComponent {
  @Input() inquireEvents!: InquireEventsService;
  @Output() openAccountEntries = new EventEmitter<InquireOpenAccountEntriesEvent>();

  get indexErrorFeedback(): UiMessage | null {
    if (!this.inquireEvents.indexError) return null;
    return presentApiError(this.inquireEvents.indexErrorCause ?? { message: this.inquireEvents.indexError }, 'SEARCH', this.inquireEvents.indexSearch);
  }

  get indexEmptyFeedback(): UiMessage {
    return {
      severity: this.inquireEvents.indexEmptyIsError ? 'WARNING' : 'INFO',
      title: this.inquireEvents.indexEmptyIsError ? 'No matching transaction' : 'No transactions available',
      message: this.inquireEvents.indexEmptyMessage,
      nextAction: this.inquireEvents.indexEmptyIsError ? 'Check the LC number and search again.' : undefined,
      retryable: false,
    };
  }

  /** A selected LC with no event rows is a valid empty result, rendered consistently with the two indexes. */
  get eventsEmptyFeedback(): UiMessage {
    return {
      severity: 'INFO',
      title: 'No events available',
      message: 'No events found under this LC.',
      retryable: false,
    };
  }

  /** Thin delegations to the same pure shared functions `TransactionBuilderComponent` itself calls for its own remaining sections (Look Up panel) — assigned directly rather than re-declared as wrapper methods, since these never touch `this`. */
  readonly displayStatus = displayStatusShared;
  readonly statusBadgeClass = statusBadgeClassShared;
  readonly contractStatusBadgeClass = contractStatusBadgeClassShared;
  readonly contractStatusLabel = contractStatusLabelShared;
  readonly statusBadgeIcon = statusBadgeIconShared;
  readonly displayMovementType = displayMovementTypeShared;
  readonly displayMovementAmount = displayMovementAmountShared;

  /**
   * A2/B2 display aid: ceilingAmount is the amendment's tolerance-adjusted balance effect before it is
   * netted with unrelated PENDING movements in Pending Earmark Total. Import decrease stores a positive
   * ceiling behind a movement type whose domain direction is -1; Export AMEND is already signed.
   */
  pendingAmendmentBalanceEffect(movement: BalanceMovement): string | null {
    switch (movement.movementType) {
      case 'AMEND_INCREASE':
      case 'AMEND':
        return movement.ceilingAmount;
      case 'AMEND_DECREASE':
        if (Number(movement.ceilingAmount) === 0) return movement.ceilingAmount;
        return movement.ceilingAmount.startsWith('-') ? movement.ceilingAmount.slice(1) : `-${movement.ceilingAmount}`;
      default:
        return null;
    }
  }

  amendmentTolerancePct(event: InquiredEvent): string | null {
    const movement = event.movement;
    if (this.pendingAmendmentBalanceEffect(movement) === null) return null;
    if (event.eventStatus !== 'PENDING' || movement.toleranceChangePct == null) return movement.tolerancePct ?? null;
    const result = resultingTolerancePct(
      movement.tolerancePct ?? '0',
      movement.toleranceChangePct,
      amendmentDirection(movement.movementType, movement.toleranceChangeDirection ?? null),
    );
    return result.ok ? result.value : null;
  }

  /** Operative tolerance immediately before this event; RELEASED history only, never today's contract value. */
  amendmentToleranceBeforePct(event: InquiredEvent): string | null {
    if (this.pendingAmendmentBalanceEffect(event.movement) === null) return null;
    let operative = '0';
    for (const candidate of this.inquireEvents.events) {
      if (candidate.movement.movementId === event.movement.movementId && candidate.phase === event.phase) break;
      if (candidate.movement.balanceContractId !== event.movement.balanceContractId || candidate.eventStatus !== 'RELEASED') continue;
      if (candidate.movement.movementType === 'ISSUE' || this.pendingAmendmentBalanceEffect(candidate.movement) !== null) {
        operative = candidate.movement.tolerancePct ?? operative;
      }
    }
    return operative;
  }

  /**
   * Event rows are identified by movement plus display phase. A4 can project the same movement as
   * separate create/finalize rows, so movementId alone would highlight two rows for one Detail panel.
   */
  isSelectedEvent(event: InquiredEvent): boolean {
    const selected = this.inquireEvents.selectedEvent;
    return selected?.movement.movementId === event.movement.movementId && selected.phase === event.phase;
  }

  openAccountEntryDialog(
    movement: BalanceMovement,
    instrumentType: InstrumentType | null | undefined,
    phase?: 'primary' | 'create' | 'finalize',
    linkedMovement?: BalanceMovement | null,
  ): void {
    this.openAccountEntries.emit({ movement, instrumentType, phase, linkedMovement });
  }

  /** User-reported 2026-08-26 — the "IB Number" row label was hardcoded regardless of side; B3/B4's own live Maker Submit screen already calls this same value "EB Number" on the Export side (ibNumberLabel(), function-policy.ts). */
  get ibNumberLabel(): string {
    return ibNumberLabelShared(this.inquireEvents.side);
  }
}
