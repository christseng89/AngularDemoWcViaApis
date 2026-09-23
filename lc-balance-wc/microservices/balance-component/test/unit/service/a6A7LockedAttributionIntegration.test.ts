import type { ExcessPolicyConfig } from '../../../src/config/excessPolicyConfig';
import { createDb, type Db } from '../../../src/db';
import { CurrencyMismatchError, RequestValidationError } from '../../../src/errors';
import { BalanceService, type BalanceMakerExcessRuntime, type CreateMovementRequest } from '../../../src/service/balanceService';

const decisionTime = '2026-09-23T00:00:00.000Z';

const policy: Readonly<ExcessPolicyConfig> = {
  policyVersion: 'a6-a7-locked-v1',
  ownerType: 'IMPORT_LC',
  allowancePercentage: '5',
  configuredMaximumUsd: '1000',
  fxMaxStalenessSeconds: 300,
  currencyPrecisions: { USD: 2, EUR: 2 },
  rateScale: 6,
  roundingMode: 'ROUND_HALF_UP',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: null,
  fallbackPolicy: 'FAIL_CLOSED',
  pbdFallbackPolicy: { authorized: false, fallbackPolicyId: null, fallbackPolicyVersion: null, effectiveFrom: null, effectiveTo: null },
};

function runtime(): BalanceMakerExcessRuntime {
  return {
    policy: { resolve: () => policy },
    fx: {
      resolveConfiguredMaximum: async () => {
        throw new Error('USD owner must use USD_PAR without a provider call.');
      },
    },
  };
}

function count(db: Db, table: string, where = ''): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get() as { count: number }).count;
}

async function seedAcknowledgedLockedArrival(
  db: Db,
  lcNumber: string,
): Promise<{
  service: BalanceService;
  parentLogicalContractId: string;
  sourceMovementId: string;
}> {
  const base = new BalanceService(db, () => decisionTime);
  const issue = base.createMovement({
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '10000',
    currency: 'USD',
    tenorType: 'SELLERS_USANCE',
    tenorDays: 60,
    expiryDate: '2099-12-31',
    createdBy: 'issue-maker',
  });
  if (!issue.created) throw new Error('expected a new Import LC');
  base.release(issue.movement.movementId, 'issue-checker');

  const parent = base.resolveContract('IPLC_LC', { lcNumber });
  if (!parent) throw new Error('expected the released Import LC');
  const service = new BalanceService(db, () => decisionTime, undefined, runtime());
  const maker = await service.submitA3ExcessByMaker(
    {
      instrumentType: 'IPLC_LC',
      balanceContractId: parent.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: 2,
      amount: '10200',
      currency: 'USD',
      sourceTransactionRef: `${lcNumber}-ARRIVAL`,
      createdBy: 'arrival-maker',
    },
    {
      actorContext: 'arrival-maker',
      idempotencyKey: `${lcNumber}-maker`,
      decisionTime,
    },
  );
  if (!('body' in maker)) throw new Error('expected persisted 10,200/10,000/200 Arrival');
  expect(maker.body).toMatchObject({ coveredAmountOwner: '10000', excessAmountOwner: '200' });

  const acknowledged = await service.acknowledgeA3ExcessByChecker(maker.body.movementId, {
    checkerContext: 'arrival-checker',
    idempotencyKey: `${lcNumber}-ack`,
    decisionTime,
  });
  if (!('movement' in acknowledged)) throw new Error('expected acknowledged Arrival');

  return { service, parentLogicalContractId: parent.logicalContractId, sourceMovementId: maker.body.movementId };
}

function a6Request(lcNumber: string, parentLogicalContractId: string, sourceMovementId: string, amount: string, currency = 'USD'): CreateMovementRequest {
  return {
    instrumentType: 'IPLC_ACCEPTANCE',
    naturalKey: { lcNumber, ibNumber: 'IB-LOCKED-01' },
    movementType: 'CREATE',
    eventSeq: 1,
    amount,
    currency,
    tenorType: 'SELLERS_USANCE',
    parentLogicalContractId,
    referencedTransactionId: sourceMovementId,
    createdBy: 'acceptance-maker',
  };
}

describe('A6/A7 locked Acceptance attribution service integration', () => {
  test.each(['10000', '10300'])('rejects A6 amount %s against locked Legal 10200 with zero writes', async (amount) => {
    const db = createDb(':memory:');
    try {
      const lcNumber = `A6-AMOUNT-${amount}`;
      const { service, parentLogicalContractId, sourceMovementId } = await seedAcknowledgedLockedArrival(db, lcNumber);
      const movementsBefore = count(db, 'balance_movements');
      const contractsBefore = count(db, 'balance_contracts');
      const ledgerBefore = db.prepare('SELECT * FROM excess_ledger_events ORDER BY rowid').all();
      const sourceBefore = db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(sourceMovementId);

      expect(() => service.createMovement(a6Request(lcNumber, parentLogicalContractId, sourceMovementId, amount))).toThrow(RequestValidationError);

      expect(count(db, 'balance_movements')).toBe(movementsBefore);
      expect(count(db, 'balance_contracts')).toBe(contractsBefore);
      expect(db.prepare('SELECT * FROM excess_ledger_events ORDER BY rowid').all()).toEqual(ledgerBefore);
      expect(db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(sourceMovementId)).toEqual(sourceBefore);
      expect(count(db, 'balance_contracts', "WHERE instrument_type = 'IPLC_ACCEPTANCE'")).toBe(0);
    } finally {
      db.close();
    }
  });

  test('rejects A6 currency mismatch against the locked owner currency with zero writes', async () => {
    const db = createDb(':memory:');
    try {
      const lcNumber = 'A6-CURRENCY-MISMATCH';
      const { service, parentLogicalContractId, sourceMovementId } = await seedAcknowledgedLockedArrival(db, lcNumber);
      const movementsBefore = count(db, 'balance_movements');
      const contractsBefore = count(db, 'balance_contracts');
      const ledgerBefore = db.prepare('SELECT * FROM excess_ledger_events ORDER BY rowid').all();

      expect(() => service.createMovement(a6Request(lcNumber, parentLogicalContractId, sourceMovementId, '10200', 'EUR'))).toThrow(CurrencyMismatchError);

      expect(count(db, 'balance_movements')).toBe(movementsBefore);
      expect(count(db, 'balance_contracts')).toBe(contractsBefore);
      expect(db.prepare('SELECT * FROM excess_ledger_events ORDER BY rowid').all()).toEqual(ledgerBefore);
      expect(count(db, 'balance_contracts', "WHERE instrument_type = 'IPLC_ACCEPTANCE'")).toBe(0);
    } finally {
      db.close();
    }
  });

  test('A6 stores full Legal 10200 and preserves locked Covered 10000 / Excess 200', async () => {
    const db = createDb(':memory:');
    try {
      const lcNumber = 'A6-LOCKED-SUCCESS';
      const { service, parentLogicalContractId, sourceMovementId } = await seedAcknowledgedLockedArrival(db, lcNumber);
      const acceptance = service.createMovement(a6Request(lcNumber, parentLogicalContractId, sourceMovementId, '10200'));
      if (!acceptance.created) throw new Error('expected A6 Acceptance');

      const released = await service.releaseExcessByChecker(acceptance.movement.movementId, {
        checkerContext: 'acceptance-checker',
        idempotencyKey: 'a6-locked-release',
        decisionTime,
      });
      if (!released.ok) throw new Error(`expected A6 Release, received ${released.code}`);

      expect(released.movement).toMatchObject({ amount: '10200', ceilingAmount: '10200', currency: 'USD', status: 'RELEASED' });
      expect(service.getBalanceSnapshot(acceptance.movement.balanceContractId).confirmedBalance).toBe('10200');
      expect(db.prepare('SELECT amount, ceiling_amount, status FROM balance_movements WHERE movement_id = ?').get(sourceMovementId)).toEqual({
        amount: '10200',
        ceiling_amount: '10000',
        status: 'RELEASED',
      });
      expect(
        db
          .prepare(
            `SELECT transaction_amount_owner, covered_amount_owner, excess_amount_owner, allowance_amount_owner
             FROM excess_ledger_events
             WHERE movement_id = ? AND event_type = 'APPROVED_UTILIZATION'`,
          )
          .get(sourceMovementId),
      ).toEqual({
        transaction_amount_owner: '10200',
        covered_amount_owner: '10000',
        excess_amount_owner: '200',
        allowance_amount_owner: '200',
      });
      expect(count(db, 'excess_ledger_events', `WHERE movement_id = '${acceptance.movement.movementId}'`)).toBe(0);
    } finally {
      db.close();
    }
  });

  test('A7 partial then full settlement reduces only Legal Outstanding and leaves Approved Excess 200 unchanged', async () => {
    const db = createDb(':memory:');
    try {
      const lcNumber = 'A7-LEGAL-ONLY';
      const { service, parentLogicalContractId, sourceMovementId } = await seedAcknowledgedLockedArrival(db, lcNumber);
      const acceptance = service.createMovement(a6Request(lcNumber, parentLogicalContractId, sourceMovementId, '10200'));
      if (!acceptance.created) throw new Error('expected A6 Acceptance');
      const a6Release = await service.releaseExcessByChecker(acceptance.movement.movementId, {
        checkerContext: 'acceptance-checker',
        idempotencyKey: 'a7-a6-release',
        decisionTime,
      });
      if (!a6Release.ok) throw new Error(`expected A6 Release, received ${a6Release.code}`);

      const approvedBefore = db.prepare('SELECT * FROM excess_ledger_events ORDER BY rowid').all();
      const partial = service.createMovement({
        instrumentType: 'IPLC_ACCEPTANCE',
        balanceContractId: acceptance.movement.balanceContractId,
        movementType: 'PARTIAL_SETTLE',
        eventSeq: 2,
        amount: '3000',
        currency: 'USD',
        createdBy: 'settlement-maker-1',
      });
      if (!partial.created) throw new Error('expected partial A7 settlement');
      service.release(partial.movement.movementId, 'settlement-checker-1');
      expect(service.getBalanceSnapshot(acceptance.movement.balanceContractId).confirmedBalance).toBe('7200');
      expect(db.prepare('SELECT * FROM excess_ledger_events ORDER BY rowid').all()).toEqual(approvedBefore);

      const full = service.createMovement({
        instrumentType: 'IPLC_ACCEPTANCE',
        balanceContractId: acceptance.movement.balanceContractId,
        movementType: 'FULL_SETTLE',
        eventSeq: 3,
        amount: '7200',
        currency: 'USD',
        createdBy: 'settlement-maker-2',
      });
      if (!full.created) throw new Error('expected full A7 settlement');
      service.release(full.movement.movementId, 'settlement-checker-2');
      expect(service.getBalanceSnapshot(acceptance.movement.balanceContractId).confirmedBalance).toBe('0');
      expect(db.prepare('SELECT * FROM excess_ledger_events ORDER BY rowid').all()).toEqual(approvedBefore);
      expect(
        db
          .prepare("SELECT allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ? AND event_type = 'APPROVED_UTILIZATION'")
          .get(sourceMovementId),
      ).toEqual({ allowance_amount_owner: '200' });
    } finally {
      db.close();
    }
  });
});
