import { createDb, type Db } from '../../../src/db';
import { ExcessAccountStore } from '../../../src/store/excessAccountStore';
import { ExcessLedgerStore } from '../../../src/store/excessLedgerStore';
import { ExcessCommandAttemptAuditStore } from '../../../src/store/excessCommandAttemptAuditStore';
import type { ExcessLedgerEvent } from '../../../src/types';

function event(overrides: Partial<ExcessLedgerEvent>): ExcessLedgerEvent {
  return {
    excessEventId: 'event-1',
    excessAccountId: 'account-1',
    movementId: null,
    eventType: 'PENDING_RESERVATION',
    ownerCurrency: 'EUR',
    transactionAmountOwner: '25',
    coveredAmountOwner: '0',
    excessAmountOwner: '25',
    amountOwner: '25',
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
      ownerCurrency: 'EUR',
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

  test('derives pending and approved allowance from active reservation and utilization events only', () => {
    ledger.insert(event({ excessEventId: 'reservation-1' }));
    expect(ledger.aggregateForAccount('account-1', 2)).toEqual({ pendingReservedOwner: '25', approvedUtilizedOwner: '0' });

    ledger.insert(
      event({
        excessEventId: 'release-1',
        eventType: 'RESERVATION_RELEASE',
        sourceExcessEventId: 'reservation-1',
        createdBy: 'checker-1',
      }),
    );
    ledger.insert(event({ excessEventId: 'approved-1', eventType: 'APPROVED_UTILIZATION', createdBy: 'checker-1' }));

    expect(ledger.aggregateForAccount('account-1', 2)).toEqual({ pendingReservedOwner: '0', approvedUtilizedOwner: '25' });
    expect(ledger.listLegacyAllocationsForApprovedEvent('approved-1')).toEqual([]);
    expect(ledger.listLegacyFormalIncreaseEventsByAccount('account-1')).toEqual([]);
    expect(ledger.listLegacyReversalEventsByAccount('account-1')).toEqual([]);
    expect('insertAllocation' in ledger).toBe(false);
    expect(ledger.listByAccount('account-1').map(({ excessEventId }) => excessEventId)).toEqual(['reservation-1', 'release-1', 'approved-1']);
  });

  test.each([
    [0, '25', '25'],
    [2, '25.1', '25.1'],
    [3, '25.125', '25.125'],
  ])('aggregates owner amounts using currency precision %s without a fixed USD scale', (precision, amountOwner, expected) => {
    ledger.insert(event({ excessEventId: `reservation-${precision}`, amountOwner }));
    expect(ledger.aggregateForAccount('account-1', precision)).toEqual({ pendingReservedOwner: expected, approvedUtilizedOwner: '0' });
  });

  test('derives Checker allowance from other movements while excluding the candidate reservation exactly once', () => {
    db.prepare(
      `INSERT INTO balance_contracts (
        balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
        status, currency, opening_balance, effective_from, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('contract-1', 'logical-1', 1, 'IPLC_LC', 'LC-1', 'ACTIVE', 'EUR', '100', '2026-01-01', 'maker', '2026-01-01');
    const insertMovement = db.prepare(
      `INSERT INTO balance_movements (
        movement_id, balance_contract_id, event_seq, movement_type, exposure_nature, amount,
        ceiling_amount, currency, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertMovement.run('candidate', 'contract-1', 1, 'UTILIZE', 'CONTINGENT', '20', '20', 'EUR', 'PENDING', 'maker', '2026-01-01');
    insertMovement.run('other', 'contract-1', 2, 'UTILIZE', 'CONTINGENT', '7', '7', 'EUR', 'PENDING', 'maker', '2026-01-01');
    insertMovement.run('approved-movement', 'contract-1', 3, 'UTILIZE', 'CONTINGENT', '11', '11', 'EUR', 'RELEASED', 'maker', '2026-01-01');
    ledger.insert(event({ excessEventId: 'candidate-reservation', movementId: 'candidate', amountOwner: '20' }));
    ledger.insert(event({ excessEventId: 'other-reservation', movementId: 'other', amountOwner: '7' }));
    ledger.insert(event({ excessEventId: 'approved', movementId: 'approved-movement', eventType: 'APPROVED_UTILIZATION', amountOwner: '11' }));

    expect(ledger.aggregateForAccountExcludingMovement('account-1', 'candidate', 2)).toEqual({
      pendingReservedOwner: '7',
      approvedUtilizedOwner: '11',
    });
  });

  test.each(['RETURN_REVERSAL', 'CANCELLATION_REVERSAL'] as const)('rejects removed active reversal event type %s', (eventType) => {
    expect(() => ledger.insert(event({ excessEventId: `forbidden-${eventType}`, eventType: eventType as never }))).toThrow(
      /disabled by BD-07|CHECK constraint failed/,
    );
  });

  test('rejects a pre-V4 Formal Increase cure event at the active store boundary', () => {
    expect(() =>
      ledger.insert(
        event({
          excessEventId: 'forbidden-cure-1',
          eventType: 'FORMAL_INCREASE_REGULARIZATION' as never,
        }),
      ),
    ).toThrow(/FORMAL_INCREASE_REGULARIZATION|CHECK constraint failed/);
  });

  test('fails loudly if an inserted Checker command-attempt audit cannot be re-read', () => {
    const run = jest.fn();
    const missing = jest.fn(() => undefined);
    const fakeDb = {
      prepare: jest.fn((sql: string) => (sql.startsWith('INSERT') ? { run } : { get: missing })),
    } as unknown as Db;
    const attempts = new ExcessCommandAttemptAuditStore(fakeDb);

    expect(() =>
      attempts.recordCheckerFxFailure({
        movementId: 'movement-1',
        ownerType: 'IMPORT_LC',
        ownerId: 'owner-1',
        ownerCurrency: 'EUR',
        actorContext: 'checker-1',
        commandIdempotencyKey: 'key-1',
        requestHash: 'hash-1',
        resultCode: 'FX_RATE_UNAVAILABLE',
        policyVersion: 'policy-1',
        requestedAmountUsd: '1000',
        decisionTime: '2026-09-22T00:01:00.000Z',
        createdAt: '2026-09-22T00:01:00.000Z',
      }),
    ).toThrow('was not persisted');
    expect(run).toHaveBeenCalledTimes(1);
    expect(missing).toHaveBeenCalledTimes(1);
  });
});
