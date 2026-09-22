import { createDb, type Db } from '../../../src/db';
import { ExcessAccountStore } from '../../../src/store/excessAccountStore';
import { ExcessLedgerStore } from '../../../src/store/excessLedgerStore';
import type { ExcessLedgerEvent } from '../../../src/types';

function event(overrides: Partial<ExcessLedgerEvent>): ExcessLedgerEvent {
  return {
    excessEventId: 'event-1',
    excessAccountId: 'account-1',
    movementId: null,
    eventType: 'PENDING_RESERVATION',
    transactionCurrency: 'EUR',
    transactionAmount: '25',
    coveredAmount: '0',
    excessAmount: '25',
    amountUsd: '25',
    policyVersion: 'policy-1',
    sourceExcessEventId: null,
    createdBy: 'maker-1',
    createdAt: '2026-09-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('Excess stores', () => {
  let db: Db;
  let accounts: ExcessAccountStore;
  let ledger: ExcessLedgerStore;

  beforeEach(() => {
    db = createDb(':memory:');
    accounts = new ExcessAccountStore(db);
    ledger = new ExcessLedgerStore(db);
    accounts.insert({
      excessAccountId: 'account-1',
      ownerType: 'IMPORT_LC',
      ownerId: 'lc-1',
      policyVersion: 'policy-1',
      version: 1,
      createdAt: '2026-09-22T00:00:00.000Z',
      updatedAt: '2026-09-22T00:00:00.000Z',
    });
  });

  afterEach(() => db.close());

  test('loads the unique owner account and enforces optimistic version advancement', () => {
    expect(accounts.getByOwner('IMPORT_LC', 'lc-1')).toMatchObject({ excessAccountId: 'account-1', version: 1 });
    expect(accounts.advanceVersion('account-1', 1, 'policy-2', '2026-09-22T00:01:00.000Z')).toBe(true);
    expect(accounts.advanceVersion('account-1', 1, 'policy-3', '2026-09-22T00:02:00.000Z')).toBe(false);
    expect(accounts.getById('account-1')).toMatchObject({ version: 2, policyVersion: 'policy-2' });
    expect(accounts.getById('missing')).toBeNull();
    expect(accounts.getByOwner('EXPORT_CONFIRMATION', 'missing')).toBeNull();
  });

  test('derives pending and approved allowance from immutable events and explicit adjustments', () => {
    ledger.insert(event({ excessEventId: 'reservation-1' }));
    expect(ledger.aggregateForAccount('account-1')).toEqual({ pendingReservedUsd: '25', approvedUtilizedUsd: '0' });

    ledger.insert(
      event({
        excessEventId: 'release-1',
        eventType: 'RESERVATION_RELEASE',
        sourceExcessEventId: 'reservation-1',
        createdBy: 'checker-1',
      }),
    );
    ledger.insert(event({ excessEventId: 'approved-1', eventType: 'APPROVED_UTILIZATION', createdBy: 'checker-1' }));
    ledger.insert(
      event({
        excessEventId: 'regularize-1',
        eventType: 'FORMAL_INCREASE_REGULARIZATION',
        amountUsd: '5',
        excessAmount: '5',
      }),
    );
    ledger.insertAllocation({
      excessAllocationId: 'allocation-1',
      adjustmentEventId: 'regularize-1',
      approvedExcessEventId: 'approved-1',
      transactionAmount: '5',
      amountUsd: '5',
      createdAt: '2026-09-22T00:02:00.000Z',
    });
    ledger.insert(event({ excessEventId: 'return-1', eventType: 'RETURN_REVERSAL', amountUsd: '3', excessAmount: '3' }));

    expect(ledger.aggregateForAccount('account-1')).toEqual({ pendingReservedUsd: '0', approvedUtilizedUsd: '17' });
    expect(ledger.listAllocationsForApprovedEvent('approved-1')).toHaveLength(1);
    expect(ledger.listByAccount('account-1').map(({ excessEventId }) => excessEventId)).toEqual([
      'reservation-1',
      'release-1',
      'approved-1',
      'regularize-1',
      'return-1',
    ]);
  });
});
