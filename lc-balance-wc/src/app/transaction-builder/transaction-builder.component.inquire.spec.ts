import { of } from 'rxjs';
import { TransactionBuilderComponent } from './transaction-builder.component';
import { InquireEventsService } from './inquire-events.service';
import { MakerQueueService } from './maker-queue.service';
import { InquireDeletePendingService } from './inquire-delete-pending.service';
import type { BalanceComponentApiService, BalanceContract, BalanceMovement } from './balance-component-api.service';

/**
 * Component-level wiring only: activeMode/selectMode() and `inquireEvents` field construction.
 * InquireEventsService's orchestration logic is covered in inquire-events.service.spec.ts.
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
    listMyMovements: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 })),
    listDeletePendingAudit: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 })),
    catalogWithDeletePendingHistory: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 })),
    getContract: jest.fn(),
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

  // Fix Pending/Delete Pending Phase 2 (analysis/Balance-Component-FixPending-DeletePending-
  // Proposal-zh.md §2.1) — same top-level activeMode convention as INQUIRE above.
  describe('MAKER_QUEUE mode (Fix Pending/Delete Pending Phase 2)', () => {
    it('constructs a real MakerQueueService instance', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.makerQueue).toBeInstanceOf(MakerQueueService);
    });

    it('selectMode(MAKER_QUEUE) switches activeMode, closes any open Account Entries dialog, and loads the queue', () => {
      const listMyMovements = jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 }));
      const c = new TransactionBuilderComponent(mockApi({ listMyMovements }));
      c.accountEntryDialogMovement = movement();

      c.selectMode('MAKER_QUEUE');

      expect(c.activeMode).toBe('MAKER_QUEUE');
      expect(c.accountEntryDialogMovement).toBeNull();
      expect(listMyMovements).toHaveBeenCalledWith({ createdBy: 'maker1', statuses: ['PENDING', 'REJECTED'], q: undefined });
    });

    it('selectMode(PROCESSING)/(INQUIRE) do not touch the Maker Queue', () => {
      const listMyMovements = jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 }));
      const c = new TransactionBuilderComponent(mockApi({ listMyMovements }));

      c.selectMode('INQUIRE');
      c.selectMode('PROCESSING');

      expect(listMyMovements).not.toHaveBeenCalled();
    });
  });

  describe('DELETE_PENDING_AUDIT mode (Inquire Delete Pending, §11)', () => {
    it('constructs a real InquireDeletePendingService instance', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.inquireDeletePending).toBeInstanceOf(InquireDeletePendingService);
    });

    it('selectMode(DELETE_PENDING_AUDIT) switches activeMode, closes any open Account Entries dialog, and loads the LC Catalog', () => {
      const catalogWithDeletePendingHistory = jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 }));
      const c = new TransactionBuilderComponent(mockApi({ catalogWithDeletePendingHistory }));
      c.accountEntryDialogMovement = movement();

      c.selectMode('DELETE_PENDING_AUDIT');

      expect(c.activeMode).toBe('DELETE_PENDING_AUDIT');
      expect(c.accountEntryDialogMovement).toBeNull();
      expect(catalogWithDeletePendingHistory).toHaveBeenCalledWith('IPLC_LC', undefined, 1, 10);
    });

    it('selectMode(PROCESSING)/(INQUIRE)/(MAKER_QUEUE) do not touch Inquire Delete Pending', () => {
      const catalogWithDeletePendingHistory = jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 }));
      const c = new TransactionBuilderComponent(mockApi({ catalogWithDeletePendingHistory }));

      c.selectMode('INQUIRE');
      c.selectMode('MAKER_QUEUE');
      c.selectMode('PROCESSING');

      expect(catalogWithDeletePendingHistory).not.toHaveBeenCalled();
    });
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
