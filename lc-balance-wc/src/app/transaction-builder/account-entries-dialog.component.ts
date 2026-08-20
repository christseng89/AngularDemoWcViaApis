import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BalanceMovement } from './balance-component-api.service';
import {
  InstrumentType,
  displayStatus as displayStatusRule,
  statusBadgeClass as statusBadgeClassRule,
  displayMovementType as displayMovementTypeRule,
} from './balance-component.model';

/**
 * BAL-003 (God Component, desiger-comments.md F-03) — the "View Voucher" pop-up
 * (analysis/contingent-liability-ledger.html; retitled 2026-08-18 per "Event Timeline — View Voucher"
 * UX enhancement), extracted 2026-08-19 as this session's own pilot for whether a GENUINE Angular child
 * component (real `@Input`/`@Output`, not another service) is viable anywhere in
 * `TransactionBuilderComponent`, after researching official Angular docs + community discussion first.
 *
 * Picked specifically because it is the one remaining piece of BAL-003's own "does too many things"
 * scope that is genuinely PRESENTATIONAL — it only ever displays a `BalanceMovement` already resolved
 * by the caller and emits `closed`; unlike the three paginated pickers (whose own selection handlers
 * mutate `model`/cascade into further loads — core Maker-flow orchestration, confirmed entangled in
 * every prior BAL-003 investigation this session), this dialog never reads or mutates
 * `TransactionBuilderComponent`'s own Maker/Checker state at all.
 *
 * Modeled directly on `IndexPickerComponent` — this project's own one pre-existing example of a real
 * child component — same conventions: classic `@Input()`/`@Output()` decorators (not the newer
 * signal-based `input()`/`output()` functions, for consistency with the sibling component, not because
 * research found any reason to prefer one over the other here), `standalone: true`, and — critically —
 * its own dedicated `.spec.ts` file constructs it via a plain `new AccountEntriesDialogComponent()`,
 * the SAME "no TestBed" convention every other spec file in this project already uses (confirmed safe
 * by `IndexPickerComponent`'s own precedent: a genuine `@Component` can still be unit-tested this way
 * for its own class-level logic — @Input defaults, @Output EventEmitter shape — precisely because
 * nothing under test here needs Angular's own view-creation/change-detection pipeline to run; that
 * pipeline is exercised instead by `ng build`'s strict-template check plus a live in-browser
 * verification pass, same as every other template in this project).
 *
 * `displayStatus()`/`statusBadgeClass()` are NOT duplicated here — both were extracted (same pass) from
 * `TransactionBuilderComponent`'s own like-named methods into shared, exported pure functions
 * (balance-component.model.ts, next to `isEarmarkFunction()` which both already called), so this
 * component and the parent's own remaining 2 template call sites (Look Up Current Balance's Event
 * Timeline, Inquire Events' merged table) share one implementation rather than the child re-deriving
 * the same EARMARKING/EARMARKED-vs-PENDING/APPROVED rule independently.
 */
@Component({
  selector: 'app-account-entries-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './account-entries-dialog.component.html',
  styleUrl: './account-entries-dialog.component.scss',
})
export class AccountEntriesDialogComponent {
  /**
   * The parent controls WHETHER this component exists at all (`*ngIf="accountEntryDialogMovement"` on
   * the `<app-account-entries-dialog>` tag itself, mirroring the pre-extraction template's own
   * `*ngIf="accountEntryDialogMovement"` on the dialog overlay `<div>`) — so this is never actually null
   * at render time in practice, but stays nullable (rather than `!`-asserted) to match this project's
   * own established defensive-typing convention for every other `@Input` of this shape.
   */
  @Input() movement: BalanceMovement | null = null;
  /**
   * `BalanceMovement` itself carries no `instrumentType` of its own (only its parent `BalanceContract`
   * does) — see the ORIGINAL `accountEntryDialogInstrumentType` field's own doc comment (still on
   * `TransactionBuilderComponent`, which resolves and passes this in) for the full "EARMARK/APPROVED
   * status split" history this field exists for.
   */
  @Input() instrumentType: InstrumentType | null = null;
  /**
   * Inquire Events' own 'primary'/'create'/'finalize' phase (see `InquiredEvent`'s own doc comment,
   * inquire-events.service.ts) — needed to correctly exclude A4's own 'finalize' row from being
   * mislabeled EARMARKED. `null`/omitted from every OTHER call site (the Maker Result panel's own
   * buttons), which is already correct there — see `isEarmarkFunction()`'s own doc comment.
   */
  @Input() phase: 'primary' | 'create' | 'finalize' | null = null;

  /** Backdrop click, the × button, or the Close button — the parent nulls out its own `accountEntryDialogMovement`/etc. state in response, exactly as it already did pre-extraction. */
  @Output() closed = new EventEmitter<void>();

  /**
   * Named identically to the imported `displayStatusRule` alias's own un-aliased export
   * (`displayStatus`) — deliberately aliased at the import site (BAL-136-style readability fix,
   * transaction-builder.component.ts's own established precedent for this exact class of trap) so this
   * method body unambiguously calls the shared free function, not itself recursively.
   */
  displayStatus(status: string): string {
    return displayStatusRule(status, this.instrumentType, this.movement?.movementType, this.phase);
  }

  /** Same aliasing reasoning as `displayStatus()` immediately above. */
  statusBadgeClass(status: string): string {
    return statusBadgeClassRule(status, this.instrumentType, this.movement?.movementType, this.phase);
  }

  /**
   * 2026-08-20 — same "B2's own AMEND reads as AMEND_INCREASE/AMEND_DECREASE everywhere a movement's
   * Type is shown" unification as `displayMovementType()`'s own doc comment (`balance-component.model.ts`)
   * describes; this dialog's own meta line was found as a 4th call site while implementing the two the
   * user explicitly named (Look Up Current Balance, Inquire Events) plus the Checker queue the user
   * confirmed adding — included here too for the same consistency reason, not independently requested.
   */
  displayMovementType(): string {
    return displayMovementTypeRule(this.instrumentType, this.movement?.movementType, this.movement?.amount);
  }
}
