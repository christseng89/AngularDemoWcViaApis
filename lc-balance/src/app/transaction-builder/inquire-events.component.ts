import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormlyModule } from '@ngx-formly/core';
import { TbIconComponent } from '../tb-icon.component';
import { BalanceSnapshotBoxComponent } from './balance-snapshot-box.component';
import { BalanceMovement } from './balance-component-api.service';
import { InquireEventsService } from './inquire-events.service';
import {
  InstrumentType,
  displayStatus as displayStatusShared,
  statusBadgeClass as statusBadgeClassShared,
  contractStatusBadgeClass as contractStatusBadgeClassShared,
  displayMovementType as displayMovementTypeShared,
  displayMovementAmount as displayMovementAmountShared,
  statusBadgeIcon as statusBadgeIconShared,
} from './balance-component.model';

/** Emitted when the "Original Transaction Screen" panel's own Account Entries button is clicked — the dialog itself stays parent-owned (`TransactionBuilderComponent`), since it's also opened from the Maker Result panel and the Look Up panel's own Event Timeline, not just from here. */
export interface InquireOpenAccountEntriesEvent {
  movement: BalanceMovement;
  instrumentType: InstrumentType | null | undefined;
  phase?: 'primary' | 'create' | 'finalize';
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
  standalone: true,
  imports: [CommonModule, FormsModule, FormlyModule, TbIconComponent, BalanceSnapshotBoxComponent],
  templateUrl: './inquire-events.component.html',
  styleUrl: './inquire-events.component.scss',
})
export class InquireEventsComponent {
  @Input() inquireEvents!: InquireEventsService;
  @Output() openAccountEntries = new EventEmitter<InquireOpenAccountEntriesEvent>();

  /** Thin delegations to the same pure shared functions `TransactionBuilderComponent` itself calls for its own remaining sections (Look Up panel) — assigned directly rather than re-declared as wrapper methods, since these never touch `this`. */
  readonly displayStatus = displayStatusShared;
  readonly statusBadgeClass = statusBadgeClassShared;
  readonly contractStatusBadgeClass = contractStatusBadgeClassShared;
  readonly statusBadgeIcon = statusBadgeIconShared;
  readonly displayMovementType = displayMovementTypeShared;
  readonly displayMovementAmount = displayMovementAmountShared;

  openAccountEntryDialog(movement: BalanceMovement, instrumentType: InstrumentType | null | undefined, phase?: 'primary' | 'create' | 'finalize'): void {
    this.openAccountEntries.emit({ movement, instrumentType, phase });
  }
}
