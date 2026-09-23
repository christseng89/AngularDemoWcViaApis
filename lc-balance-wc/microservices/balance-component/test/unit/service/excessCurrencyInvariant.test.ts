import { createDb, type Db } from '../../../src/db';
import { CurrencyMismatchError } from '../../../src/errors';
import { BalanceService } from '../../../src/service/balanceService';

const FACT_TABLES = [
  'balance_contracts',
  'balance_movements',
  'excess_accounts',
  'excess_ledger_events',
  'fx_rate_snapshots',
  'sg_capacity_events',
  'command_idempotency',
] as const;

function factCounts(db: Db): Record<(typeof FACT_TABLES)[number], number> {
  return Object.fromEntries(
    FACT_TABLES.map((table) => [table, (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count]),
  ) as Record<(typeof FACT_TABLES)[number], number>;
}

function issueImportLc(service: BalanceService, lcNumber: string) {
  const result = service.createMovement({
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '1000',
    currency: 'EUR',
    tenorType: 'SIGHT',
    expiryDate: '2099-12-31',
    createdBy: 'maker',
  });
  if (!result.created) throw new Error('expected Import LC creation');
  service.release(result.movement.movementId, 'checker');
  return service.resolveContract('IPLC_LC', { lcNumber })!;
}

function issueConfirmation(service: BalanceService, lcNumber: string) {
  const result = service.createMovement({
    instrumentType: 'EPLC_CONFIRMATION',
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '1000',
    currency: 'EUR',
    tenorType: 'SIGHT',
    expiryDate: '2099-12-31',
    createdBy: 'maker',
  });
  if (!result.created) throw new Error('expected Export Confirmation creation');
  service.release(result.movement.movementId, 'checker');
  return service.resolveContract('EPLC_CONFIRMATION', { lcNumber })!;
}

describe('V4 function currency invariant is zero-write at the service boundary', () => {
  test('A8 rejects currency different from its Import LC owner', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const owner = issueImportLc(service, 'V4-A8-CCY');
    const before = factCounts(db);

    expect(() =>
      service.createMovement({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'V4-A8-CCY', sgNumber: 'SG-1' },
        parentLogicalContractId: owner.logicalContractId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '100',
        currency: 'USD',
        createdBy: 'maker',
      }),
    ).toThrow(CurrencyMismatchError);
    expect(factCounts(db)).toEqual(before);
  });

  test.each([
    ['A3', null],
    ['A3S', 'a3s-business-event'],
  ] as const)('%s rejects currency different from its Import LC owner', (functionCode, businessEventId) => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const owner = issueImportLc(service, `V4-${functionCode}-CCY`);
    const before = factCounts(db);

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: owner.balanceContractId,
        movementType: 'UTILIZE',
        eventSeq: 2,
        amount: '100',
        currency: 'USD',
        sourceTransactionRef: `${functionCode}-REF-1`,
        businessEventId,
        createdBy: 'maker',
      }),
    ).toThrow(CurrencyMismatchError);
    expect(factCounts(db)).toEqual(before);
  });

  test('B3 rejects currency different from its Export Confirmation owner', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const owner = issueConfirmation(service, 'V4-B3-CCY');
    const before = factCounts(db);

    expect(() =>
      service.createMovement({
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'V4-B3-CCY', ibNumber: 'DOCS-1' },
        parentLogicalContractId: owner.logicalContractId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '100',
        currency: 'USD',
        exposureNature: 'MEMO',
        createdBy: 'maker',
      }),
    ).toThrow(CurrencyMismatchError);
    expect(factCounts(db)).toEqual(before);
  });
});
