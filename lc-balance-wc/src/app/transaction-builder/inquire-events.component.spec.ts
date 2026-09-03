import { InquireEventsComponent } from './inquire-events.component';
import type { BalanceMovement } from './balance-component-api.service';
import type { InquiredEvent } from './inquire-events.service';

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
  it('maps index error and both empty states to shared feedback', () => {
    const c = new InquireEventsComponent();
    c.inquireEvents = { indexError: null, indexErrorCause: null, indexSearch: 'S0', indexEmptyIsError: false, indexEmptyMessage: 'No records.' } as any;
    expect(c.indexErrorFeedback).toBeNull();
    expect(c.indexEmptyFeedback).toMatchObject({ severity: 'INFO', title: 'No transactions available' });
    c.inquireEvents.indexError = 'network down';
    expect(c.indexErrorFeedback).toMatchObject({ severity: 'ERROR', retryable: true });
    c.inquireEvents.indexErrorCause = { status: 0, message: 'Http failure response: 0 Unknown Error' };
    expect(c.indexErrorFeedback).toMatchObject({ title: 'Balance service unavailable' });
    expect(c.indexErrorFeedback?.supportCode).toBeUndefined();
    c.inquireEvents = { ...c.inquireEvents, indexError: null, indexEmptyIsError: true } as any;
    expect(c.indexEmptyFeedback).toMatchObject({ severity: 'WARNING', title: 'No matching transaction' });
  });

  it('maps an LC with no event rows to the shared informational feedback style', () => {
    const c = new InquireEventsComponent();

    expect(c.eventsEmptyFeedback).toEqual({
      severity: 'INFO',
      title: 'No events available',
      message: 'No events found under this LC.',
      retryable: false,
    });
  });
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

  it('matches the selected table row by movementId and phase, not object reference', () => {
    const c = new InquireEventsComponent();
    const selected = {
      movement: movement({ movementId: 'mv-selected' }),
      contract: {},
      eventTime: '2026-09-02T00:00:00.000Z',
      eventStatus: 'RELEASED',
      phase: 'create',
    } as InquiredEvent;
    c.inquireEvents = { selectedEvent: selected } as never;

    expect(c.isSelectedEvent({ ...selected })).toBe(true);
    expect(c.isSelectedEvent({ ...selected, phase: 'finalize' })).toBe(false);
    expect(c.isSelectedEvent({ ...selected, movement: movement({ movementId: 'mv-other' }) })).toBe(false);
    c.inquireEvents = { selectedEvent: null } as never;
    expect(c.isSelectedEvent(selected)).toBe(false);
  });

  it('uses side-correct IB/EB terminology', () => {
    const c = new InquireEventsComponent();
    c.inquireEvents = { side: 'IMPORT' } as any;
    expect(c.ibNumberLabel).toBe('IB Number');
    c.inquireEvents = { side: 'EXPORT' } as any;
    expect(c.ibNumberLabel).toBe('EB Number');
  });

  it('exposes the selected A2/B2 tolerance-adjusted balance effect with the correct direction', () => {
    const c = new InquireEventsComponent();

    expect(c.pendingAmendmentBalanceEffect(movement({ movementType: 'AMEND_INCREASE', ceilingAmount: '32000' }))).toBe('32000');
    expect(c.pendingAmendmentBalanceEffect(movement({ movementType: 'AMEND_DECREASE', ceilingAmount: '22000' }))).toBe('-22000');
    expect(c.pendingAmendmentBalanceEffect(movement({ movementType: 'AMEND_DECREASE', ceilingAmount: '-5000' }))).toBe('5000');
    expect(c.pendingAmendmentBalanceEffect(movement({ movementType: 'AMEND_DECREASE', ceilingAmount: '0' }))).toBe('0');
    expect(c.pendingAmendmentBalanceEffect(movement({ movementType: 'AMEND', ceilingAmount: '-15000' }))).toBe('-15000');
    expect(c.amendmentTolerancePct({ movement: movement({ movementType: 'AMEND_INCREASE', ceilingAmount: '32000', tolerancePct: '20' }), eventStatus: 'RELEASED', phase: 'primary' } as InquiredEvent)).toBe('20');
    expect(c.pendingAmendmentBalanceEffect(movement({ movementType: 'UTILIZE' }))).toBeNull();
    expect(c.amendmentTolerancePct({ movement: movement({ movementType: 'UTILIZE', tolerancePct: '20' }), eventStatus: 'RELEASED', phase: 'primary' } as InquiredEvent)).toBeNull();
  });

  it('derives a released Decrease tolerance transition from prior released history, not the current contract value', () => {
    const c = new InquireEventsComponent();
    const issue = { movement: movement({ movementId: 'issue', eventSeq: 1, movementType: 'ISSUE', tolerancePct: '0' }), eventStatus: 'RELEASED', phase: 'primary' } as InquiredEvent;
    const increase = { movement: movement({ movementId: 'inc', eventSeq: 2, movementType: 'AMEND_INCREASE', tolerancePct: '20' }), eventStatus: 'RELEASED', phase: 'primary' } as InquiredEvent;
    const decrease = { movement: movement({ movementId: 'dec', eventSeq: 3, movementType: 'AMEND_DECREASE', tolerancePct: '15' }), eventStatus: 'RELEASED', phase: 'primary' } as InquiredEvent;
    c.inquireEvents = { events: [issue, increase, decrease] } as never;

    expect(c.amendmentToleranceBeforePct(decrease)).toBe('20');
    expect(c.amendmentTolerancePct(decrease)).toBe('15');
  });

  it('keeps Pending movement tolerance at the old approved value and derives the displayed result from its change', () => {
    const c = new InquireEventsComponent();
    const pending = {
      movement: movement({
        movementType: 'AMEND_INCREASE',
        tolerancePct: '10',
        toleranceChangePct: '5',
        toleranceChangeDirection: 'INCREASE',
      }),
      eventStatus: 'PENDING',
      phase: 'primary',
    } as InquiredEvent;
    expect(c.amendmentTolerancePct(pending)).toBe('15');
    expect(pending.movement.tolerancePct).toBe('10');
  });

  it('falls back to the old approved value for a Pending amendment that carries no tolerance change', () => {
    const c = new InquireEventsComponent();
    const pending = {
      movement: movement({ movementType: 'AMEND_INCREASE', tolerancePct: '10', toleranceChangePct: null }),
      eventStatus: 'PENDING',
      phase: 'primary',
    } as InquiredEvent;

    expect(c.amendmentTolerancePct(pending)).toBe('10');
  });

  it('returns null when the derived resulting tolerance would be invalid (e.g. a decrease below zero)', () => {
    const c = new InquireEventsComponent();
    const pending = {
      movement: movement({
        movementType: 'AMEND_DECREASE',
        tolerancePct: '10',
        toleranceChangePct: '11',
        toleranceChangeDirection: 'DECREASE',
      }),
      eventStatus: 'PENDING',
      phase: 'primary',
    } as InquiredEvent;

    expect(c.amendmentTolerancePct(pending)).toBeNull();
  });

  it('ignores unrelated, pending, and non-amendment history while deriving the prior operative tolerance', () => {
    const c = new InquireEventsComponent();
    const unrelated = { movement: movement({ movementId: 'other', balanceContractId: 'bc-other', movementType: 'AMEND_INCREASE', tolerancePct: '99' }), eventStatus: 'RELEASED', phase: 'primary' } as InquiredEvent;
    const pending = { movement: movement({ movementId: 'pending', movementType: 'AMEND_INCREASE', tolerancePct: '88' }), eventStatus: 'PENDING', phase: 'primary' } as InquiredEvent;
    const utilize = { movement: movement({ movementId: 'utilize', movementType: 'UTILIZE', tolerancePct: '77' }), eventStatus: 'RELEASED', phase: 'primary' } as InquiredEvent;
    const selected = { movement: movement({ movementId: 'selected', movementType: 'AMEND_DECREASE', tolerancePct: '15' }), eventStatus: 'RELEASED', phase: 'primary' } as InquiredEvent;
    c.inquireEvents = { events: [unrelated, pending, utilize, selected] } as never;

    expect(c.amendmentToleranceBeforePct(selected)).toBe('0');
    expect(c.amendmentToleranceBeforePct(utilize)).toBeNull();
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
      expect(c.contractStatusBadgeClass('ACTIVE', true)).toBe('tb-status-badge--negative');
    });

    it('contractStatusLabel() — CLOSING while ACTIVE + closingPending, plain status text otherwise', () => {
      const c = new InquireEventsComponent();
      expect(c.contractStatusLabel('ACTIVE', true)).toBe('CLOSING');
      expect(c.contractStatusLabel('ACTIVE')).toBe('ACTIVE');
      expect(c.contractStatusLabel('CLOSED')).toBe('CLOSED');
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
