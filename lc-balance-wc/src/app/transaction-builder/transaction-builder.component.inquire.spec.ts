import { of } from 'rxjs';
import { TransactionBuilderComponent } from './transaction-builder.component';
import { InquireEventsService } from './inquire-events.service';
import type { BalanceComponentApiService, BalanceContract, BalanceMovement } from './balance-component-api.service';

/**
 * Inquire Events (2026-08-17) — component-level wiring only: activeMode/selectMode() and the
 * `inquireEvents` field construction. InquireEventsService's own orchestration logic (search/merge/
 * selectEvent) is covered directly in inquire-events.service.spec.ts, same "service owns its own
 * behavior, component spec only proves the wiring" split this file's own sibling specs
 * (checker-actions.service.spec.ts / maker-submit.service.spec.ts vs. .actions.spec.ts) already use.
 */

function contract(overrides: Partial<BalanceContract> = {}): BalanceContract {
  return {
    balanceContractId: 'bc-1',
    logicalContractId: 'lc-1',
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber: 'S001' },
    status: 'ACTIVE',
    currency: 'USD',
    ...overrides,
  };
}

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
    contingentAccountEntry: { drAccount: 'Dr X', crAccount: 'Cr Y', currency: 'USD', amount: '50000' },
    ...overrides,
  };
}

function mockApi(overrides: Partial<Record<keyof BalanceComponentApiService, jest.Mock>> = {}) {
  return {
    createMovement: jest.fn(),
    release: jest.fn(),
    reject: jest.fn(),
    cancel: jest.fn(),
    acknowledge: jest.fn(),
    resolveContract: jest.fn(() => of(contract())),
    catalog: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 })),
    getSnapshot: jest.fn(),
    listMovements: jest.fn(() => of([])),
    getBalanceAsOfMovement: jest.fn(() => of({ balanceContractId: 'bc-1', logicalContractId: 'lc-1', currency: 'USD', confirmedBalance: '50000', availableBalance: '50000', pendingEarmarkTotal: '0' })),
    ...overrides,
  } as unknown as BalanceComponentApiService;
}

describe('TransactionBuilderComponent — Inquire Events wiring', () => {
  it('defaults to activeMode PROCESSING and constructs a real InquireEventsService instance', () => {
    const c = new TransactionBuilderComponent(mockApi());
    expect(c.activeMode).toBe('PROCESSING');
    expect(c.inquireEvents).toBeInstanceOf(InquireEventsService);
  });

  it('selectMode switches activeMode and closes any open Account Entries dialog', () => {
    const c = new TransactionBuilderComponent(mockApi());
    c.accountEntryDialogMovement = movement();
    c.accountEntryDialogInstrumentType = 'IPLC_LC';

    c.selectMode('INQUIRE');

    expect(c.activeMode).toBe('INQUIRE');
    expect(c.accountEntryDialogMovement).toBeNull();
    expect(c.accountEntryDialogInstrumentType).toBeNull();

    c.selectMode('PROCESSING');
    expect(c.activeMode).toBe('PROCESSING');
  });

  it('the same openAccountEntryDialog()/closeAccountEntryDialog() the Maker/Look-Up screens use also works for a movement surfaced by Inquire Events — no separate dialog mechanism', () => {
    const c = new TransactionBuilderComponent(mockApi());
    const inquiredMovement = movement({ movementId: 'mv-inquired' });

    c.openAccountEntryDialog(inquiredMovement, 'IPLC_LC');

    expect(c.accountEntryDialogMovement).toBe(inquiredMovement);

    c.closeAccountEntryDialog();
    expect(c.accountEntryDialogMovement).toBeNull();
  });

  it('inquireEvents.selectEvent() reconstructs a real read-only field set through the shared component-level service instance', () => {
    const c = new TransactionBuilderComponent(mockApi());
    const m = movement();
    c.inquireEvents.selectEvent({ movement: m, contract: contract(), eventTime: m.createdAt, eventStatus: m.status, phase: 'primary' });
    expect(c.inquireEvents.selectedEventFields.length).toBeGreaterThan(0);
    expect(c.inquireEvents.selectedEventFields.every((f) => f.props?.disabled === true)).toBe(true);
  });
});
