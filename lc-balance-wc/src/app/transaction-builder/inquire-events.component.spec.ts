import { InquireEventsComponent } from './inquire-events.component';
import type { BalanceMovement } from './balance-component-api.service';

/**
 * Direct-instantiation, no-TestBed unit tests (same convention as account-entries-dialog.component.spec.ts's
 * own precedent). `inquireEvents` (InquireEventsService) is parent-owned/parent-constructed and passed in
 * as a plain @Input() (see this component's own class doc comment) — its own orchestration logic is
 * already covered by inquire-events.service.spec.ts, so these tests cover only what's new here: the
 * openAccountEntries @Output wiring and the thin pure-function delegations. The template itself is
 * verified via `ng build`'s strict-template check plus a live in-browser pass.
 */
function movement(overrides: Partial<BalanceMovement> = {}): BalanceMovement {
  return {
    movementId: 'mv-1',
    balanceContractId: 'bc-1',
    eventSeq: 1,
    movementType: 'ISSUE',
    exposureNature: 'CONTINGENT',
    amount: '50000',
    ceilingAmount: '50000',
    currency: 'USD',
    status: 'RELEASED',
    createdBy: 'maker1',
    createdAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  };
}

describe('InquireEventsComponent', () => {
  it('exposes openAccountEntries as an EventEmitter', () => {
    const c = new InquireEventsComponent();
    expect(c.openAccountEntries.emit).toBeInstanceOf(Function);
  });

  describe('openAccountEntryDialog()', () => {
    it('emits openAccountEntries with the movement/instrumentType/phase it was called with, rather than opening a dialog itself', () => {
      const c = new InquireEventsComponent();
      const spy = jest.fn();
      c.openAccountEntries.subscribe(spy);
      const m = movement({ movementId: 'mv-inquired' });

      c.openAccountEntryDialog(m, 'IPLC_LC', 'finalize');

      expect(spy).toHaveBeenCalledWith({ movement: m, instrumentType: 'IPLC_LC', phase: 'finalize' });
    });

    it('phase is optional — omitted when the caller does not pass one (a root/primary event)', () => {
      const c = new InquireEventsComponent();
      const spy = jest.fn();
      c.openAccountEntries.subscribe(spy);
      const m = movement();

      c.openAccountEntryDialog(m, 'EPLC_CONFIRMATION');

      expect(spy).toHaveBeenCalledWith({ movement: m, instrumentType: 'EPLC_CONFIRMATION', phase: undefined });
    });
  });

  describe('thin pure-function delegations (same shared balance-component.model.ts rules TransactionBuilderComponent itself uses for its own remaining sections)', () => {
    it('displayStatus()', () => {
      const c = new InquireEventsComponent();
      expect(c.displayStatus('PENDING')).toBe('PENDING');
    });

    it('statusBadgeClass()', () => {
      const c = new InquireEventsComponent();
      expect(c.statusBadgeClass('PENDING')).toBe('tb-status-badge--pending');
    });

    it('contractStatusBadgeClass()', () => {
      const c = new InquireEventsComponent();
      expect(c.contractStatusBadgeClass('ACTIVE')).toBe('tb-status-badge--approved');
      expect(c.contractStatusBadgeClass('CLOSED')).toBe('tb-status-badge--negative');
    });

    it('statusBadgeIcon()', () => {
      const c = new InquireEventsComponent();
      expect(c.statusBadgeIcon('tb-status-badge--pending')).toBe('pending');
    });

    it('displayMovementType()', () => {
      const c = new InquireEventsComponent();
      expect(c.displayMovementType('EPLC_CONFIRMATION', 'AMEND', '-7000')).toBe('AMEND_DECREASE');
    });

    it('displayMovementAmount()', () => {
      const c = new InquireEventsComponent();
      expect(c.displayMovementAmount('EPLC_CONFIRMATION', 'AMEND', '-7000')).toBe('7000');
    });
  });
});
