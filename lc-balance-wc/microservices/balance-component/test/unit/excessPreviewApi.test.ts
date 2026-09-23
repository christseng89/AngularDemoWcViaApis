import request from 'supertest';
import { createApp } from '../../src/app';
import type { ExcessPolicyConfig } from '../../src/config/excessPolicyConfig';
import { createDb, type Db } from '../../src/db';
import type { CurrencyExchangeRequest } from '../../src/integration/currencyExchange';
import { BalanceService, type BalanceMakerExcessRuntime, type CreateMovementRequest } from '../../src/service/balanceService';

const decisionTime = '2026-09-23T00:00:00.000Z';

function policy(ownerType: ExcessPolicyConfig['ownerType']): Readonly<ExcessPolicyConfig> {
  return {
    policyVersion: `preview-${ownerType}`,
    ownerType,
    allowancePercentage: '30',
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
}

function runtime(
  fx: BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum'] = async ({ request }: { request: CurrencyExchangeRequest }) => ({
    ok: true,
    quote: {
      ...request,
      requestedAmount: request.amount,
      bookingRate: '0.92',
      convertedAmount: '920',
      rateOrigin: 'PROVIDER_SUPPLIED',
      rateSource: 'PROVIDER',
      providerRateId: 'preview-rate',
      providerRateVersion: 'v1',
      requestAttemptId: 'attempt-1',
      rateTimestamp: '2026-09-22T23:59:00.000Z',
      approvalStatus: 'APPROVED',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveTo: null,
    },
  }),
  resolvePolicy: (ownerType: ExcessPolicyConfig['ownerType']) => Readonly<ExcessPolicyConfig> = policy,
): BalanceMakerExcessRuntime {
  return { policy: { resolve: (ownerType) => resolvePolicy(ownerType) }, fx: { resolveConfiguredMaximum: fx } };
}

function seedRoot(db: Db, instrumentType: 'IPLC_LC' | 'EPLC_CONFIRMATION', lcNumber: string, currency = 'USD') {
  const service = new BalanceService(db, () => decisionTime);
  const issue = service.createMovement({
    instrumentType,
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '100',
    currency,
    tenorType: 'SIGHT',
    expiryDate: '2099-12-31',
    createdBy: 'root-maker',
  });
  if (!issue.created) throw new Error('expected root issue');
  service.release(issue.movement.movementId, 'root-checker');
  return service.resolveContract(instrumentType, { lcNumber })!;
}

function counts(db: Db): Record<string, number> {
  return Object.fromEntries(
    [
      'balance_contracts',
      'balance_movements',
      'excess_accounts',
      'excess_ledger_events',
      'fx_rate_snapshots',
      'excess_decision_snapshots',
      'command_idempotency',
      'excess_command_attempt_audits',
    ].map((table) => [table, (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count]),
  );
}

function a3Request(balanceContractId: string, amount: string, eventSeq: number, currency = 'USD'): CreateMovementRequest {
  return {
    instrumentType: 'IPLC_LC',
    balanceContractId,
    movementType: 'UTILIZE',
    eventSeq,
    amount,
    currency,
    sourceTransactionRef: `DOC-${eventSeq}`,
    createdBy: 'maker-1',
  };
}

describe('POST /balance-movements/excess-preview', () => {
  test('A3 reports previous, this, total and maximum without writing, and excludeMovementId supports Fix Pending', async () => {
    const db = createDb(':memory:');
    try {
      const lc = seedRoot(db, 'IPLC_LC', 'PREVIEW-A3');
      const fx: BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum'] = jest.fn(async () => ({
        ok: false as const,
        code: 'FX_RATE_UNAVAILABLE' as const,
      }));
      const service = new BalanceService(db, () => decisionTime, undefined, runtime(fx));
      const app = createApp(db, service);
      const submitted = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', 'preview-existing')
        .send(a3Request(lc.balanceContractId, '120', 2))
        .expect(201);
      const before = counts(db);

      const response = await request(app)
        .post('/balance-movements/excess-preview')
        .send({ functionCode: 'A3', request: a3Request(lc.balanceContractId, '110', 3) })
        .expect(200);

      expect(response.body).toEqual({
        previousExcessAmountTransaction: '20',
        thisExcessAmountTransaction: '110',
        totalExcessAmountTransaction: '130',
        maxExcessAmountTransaction: '30',
        eligible: false,
        businessResultCode: 'EXCESS_LIMIT_EXCEEDED',
      });
      expect(counts(db)).toEqual(before);

      const fix = await request(app)
        .post('/balance-movements/excess-preview')
        .send({ functionCode: 'A3', request: a3Request(lc.balanceContractId, '130', 2), excludeMovementId: submitted.body.movementId })
        .expect(200);
      expect(fix.body).toMatchObject({ previousExcessAmountTransaction: '0', thisExcessAmountTransaction: '30', totalExcessAmountTransaction: '30' });
      expect(counts(db)).toEqual(before);
      expect(fx).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });

  test.each(['FX_RATE_UNAVAILABLE', 'FX_RATE_STALE'] as const)('non-USD provider failure %s returns a typed result and writes nothing', async (code) => {
    const db = createDb(':memory:');
    try {
      const lc = seedRoot(db, 'IPLC_LC', 'PREVIEW-EUR', 'EUR');
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime(async () => ({ ok: false, code })),
      );
      const before = counts(db);
      await request(createApp(db, service))
        .post('/balance-movements/excess-preview')
        .send({ functionCode: 'A3', request: a3Request(lc.balanceContractId, '120', 2, 'EUR') })
        .expect(409, { code });
      expect(counts(db)).toEqual(before);
    } finally {
      db.close();
    }
  });

  test('effective maximum is the exact MIN of face-percentage and converted configured cap', async () => {
    const db = createDb(':memory:');
    try {
      const lc = seedRoot(db, 'IPLC_LC', 'PREVIEW-MIN');
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime(undefined, (ownerType) => ({ ...policy(ownerType), configuredMaximumUsd: '15' })),
      );
      const before = counts(db);

      const response = await request(createApp(db, service))
        .post('/balance-movements/excess-preview')
        .send({ functionCode: 'A3', request: a3Request(lc.balanceContractId, '120', 2) })
        .expect(200);

      expect(response.body).toMatchObject({
        thisExcessAmountTransaction: '20',
        totalExcessAmountTransaction: '20',
        maxExcessAmountTransaction: '15',
        eligible: false,
        businessResultCode: 'EXCESS_LIMIT_EXCEEDED',
      });
      expect(counts(db)).toEqual(before);
    } finally {
      db.close();
    }
  });

  test('BD-03 zero configuration reports zero maximum, rejects positive Excess and does not call FX', async () => {
    const db = createDb(':memory:');
    try {
      const lc = seedRoot(db, 'IPLC_LC', 'PREVIEW-ZERO');
      const fx: BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum'] = jest.fn(async () => ({
        ok: false as const,
        code: 'FX_RATE_UNAVAILABLE' as const,
      }));
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime(fx, (ownerType) => ({ ...policy(ownerType), allowancePercentage: '0' })),
      );
      const before = counts(db);

      const response = await request(createApp(db, service))
        .post('/balance-movements/excess-preview')
        .send({ functionCode: 'A3', request: a3Request(lc.balanceContractId, '120', 2) })
        .expect(200);

      expect(response.body).toMatchObject({
        thisExcessAmountTransaction: '20',
        maxExcessAmountTransaction: '0',
        eligible: false,
        businessResultCode: 'INSUFFICIENT_AVAILABLE_BALANCE',
      });
      expect(fx).not.toHaveBeenCalled();
      expect(counts(db)).toEqual(before);
    } finally {
      db.close();
    }
  });

  test('A3S uses the selected SG redemption once and B3 uses Confirmation capacity', async () => {
    const db = createDb(':memory:');
    try {
      const lc = seedRoot(db, 'IPLC_LC', 'PREVIEW-A3S');
      const base = new BalanceService(db, () => decisionTime);
      const sgIssue = base.createMovement({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'PREVIEW-A3S', sgNumber: 'SG1' },
        parentLogicalContractId: lc.logicalContractId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '50',
        currency: 'USD',
        createdBy: 'sg-maker',
      });
      if (!sgIssue.created) throw new Error('expected SG issue');
      base.release(sgIssue.movement.movementId, 'sg-checker');
      const confirmation = seedRoot(db, 'EPLC_CONFIRMATION', 'PREVIEW-B3');
      const service = new BalanceService(db, () => decisionTime, undefined, runtime());
      const app = createApp(db, service);
      const before = counts(db);
      const businessEventId = 'PREVIEW-A3S-EVENT';
      const a3s = await request(app)
        .post('/balance-movements/excess-preview')
        .send({
          functionCode: 'A3S',
          requests: [
            {
              instrumentType: 'SHGT',
              balanceContractId: sgIssue.movement.balanceContractId,
              movementType: 'FULL_REDEEM',
              eventSeq: 2,
              amount: '50',
              currency: 'USD',
              businessEventId,
              sourceTransactionRef: 'DOC-A3S',
              createdBy: 'maker-1',
            },
            { ...a3Request(lc.balanceContractId, '120', 2), businessEventId, sourceTransactionRef: 'DOC-A3S' },
          ],
        })
        .expect(200);
      expect(a3s.body).toMatchObject({ thisExcessAmountTransaction: '20', totalExcessAmountTransaction: '20', eligible: true });

      const b3 = await request(app)
        .post('/balance-movements/excess-preview')
        .send({
          functionCode: 'B3',
          request: {
            instrumentType: 'EPLC_EXAMINATION',
            naturalKey: { lcNumber: 'PREVIEW-B3', ibNumber: 'E01' },
            parentLogicalContractId: confirmation.logicalContractId,
            movementType: 'CREATE',
            eventSeq: 1,
            amount: '120',
            currency: 'USD',
            createdBy: 'maker-1',
          },
        })
        .expect(200);
      expect(b3.body).toMatchObject({ thisExcessAmountTransaction: '20', maxExcessAmountTransaction: '30', eligible: true });
      expect(counts(db)).toEqual(before);
    } finally {
      db.close();
    }
  });

  test('rejects functions outside A3/A3S/B3 before any write', async () => {
    const db = createDb(':memory:');
    try {
      const before = counts(db);
      await request(createApp(db, new BalanceService(db, () => decisionTime, undefined, runtime())))
        .post('/balance-movements/excess-preview')
        .send({ functionCode: 'A8', request: {} })
        .expect(400);
      expect(counts(db)).toEqual(before);
    } finally {
      db.close();
    }
  });
});
