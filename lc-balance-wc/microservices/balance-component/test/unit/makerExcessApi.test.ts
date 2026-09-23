import request from 'supertest';
import { createApp } from '../../src/app';
import type { ExcessPolicyConfig } from '../../src/config/excessPolicyConfig';
import { createDb, type Db } from '../../src/db';
import type { CurrencyExchangeQuote, CurrencyExchangeRequest } from '../../src/integration/currencyExchange';
import { BalanceService, type BalanceMakerExcessRuntime } from '../../src/service/balanceService';

const decisionTime = '2026-09-23T00:00:00.000Z';

const policy: Readonly<ExcessPolicyConfig> = {
  policyVersion: 'demo-v1',
  ownerType: 'IMPORT_LC',
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

function quote(request: CurrencyExchangeRequest): CurrencyExchangeQuote {
  return {
    fromCurrency: 'USD',
    toCurrency: 'EUR',
    requestedAmount: '1000',
    ratePurpose: 'BOOKING',
    bookingRate: '0.92',
    convertedAmount: '920',
    rateOrigin: 'PROVIDER_SUPPLIED',
    rateSource: 'PROVIDER',
    providerRateId: 'demo-rate',
    providerRateVersion: 'demo-v1',
    requestAttemptId: 'demo-attempt',
    rateTimestamp: '2026-09-22T23:59:00.000Z',
    approvalStatus: 'APPROVED',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveTo: null,
    correlationId: request.correlationId,
    policyVersion: request.policyVersion,
  };
}

function seedReleasedLc(db: Db): string {
  const service = new BalanceService(db, () => decisionTime);
  const issue = service.createMovement({
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber: 'API-OVERDRAWN-1' },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '100',
    currency: 'EUR',
    tenorType: 'SIGHT',
    expiryDate: '2099-12-31',
    createdBy: 'issue-maker',
  });
  if (!issue.created) throw new Error('expected issue movement');
  service.release(issue.movement.movementId, 'issue-checker');
  return issue.movement.balanceContractId;
}

function runtime(
  result: Awaited<ReturnType<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>>,
  allowancePercentage = '30',
  configuredMaximumUsd = '1000',
  ownerType: ExcessPolicyConfig['ownerType'] = 'IMPORT_LC',
): BalanceMakerExcessRuntime {
  return {
    policy: { resolve: () => ({ ...policy, ownerType, allowancePercentage, configuredMaximumUsd }) },
    fx: { resolveConfiguredMaximum: async ({ request }) => (result.ok ? { ok: true, quote: quote(request) } : result) },
  };
}

function seedReleasedRoot(db: Db, instrumentType: 'IPLC_LC' | 'EPLC_CONFIRMATION', lcNumber: string, amount = '100') {
  const service = new BalanceService(db, () => decisionTime);
  const issue = service.createMovement({
    instrumentType,
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount,
    currency: 'USD',
    tenorType: 'SIGHT',
    expiryDate: '2099-12-31',
    createdBy: 'root-maker',
  });
  if (!issue.created) throw new Error('expected root issue');
  service.release(issue.movement.movementId, 'root-checker');
  return service.resolveContract(instrumentType, { lcNumber })!;
}

function seedReleasedUsanceLc(db: Db, lcNumber: string, currency = 'USD', amount = '100') {
  const service = new BalanceService(db, () => decisionTime);
  const issue = service.createMovement({
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount,
    currency,
    tenorType: 'SELLERS_USANCE',
    tenorDays: 90,
    expiryDate: '2099-12-31',
    createdBy: 'root-maker',
  });
  if (!issue.created) throw new Error('expected Usance LC issue');
  service.release(issue.movement.movementId, 'root-checker');
  return service.resolveContract('IPLC_LC', { lcNumber })!;
}

function body(balanceContractId: string, amount: string) {
  return {
    instrumentType: 'IPLC_LC',
    balanceContractId,
    movementType: 'UTILIZE',
    eventSeq: 2,
    amount,
    currency: 'EUR',
    sourceTransactionRef: 'DOC-API-1',
    createdBy: 'maker-1',
  };
}

function tableCount(db: Db, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

function seedAcknowledgedA3S(service: BalanceService, lcNumber: string) {
  const issue = service.createMovement({
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '100000',
    currency: 'USD',
    tenorType: 'SIGHT',
    expiryDate: '2099-12-31',
    createdBy: 'issue-maker',
  });
  if (!issue.created) throw new Error('expected LC issue');
  service.release(issue.movement.movementId, 'issue-checker');
  const lc = service.resolveContract('IPLC_LC', { lcNumber })!;
  const sgIssue = service.createMovement({
    instrumentType: 'SHGT',
    naturalKey: { lcNumber, sgNumber: `${lcNumber}-SG` },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '20000',
    currency: 'USD',
    parentLogicalContractId: lc.logicalContractId,
    createdBy: 'sg-maker',
  });
  if (!sgIssue.created) throw new Error('expected SG issue');
  service.release(sgIssue.movement.movementId, 'sg-checker');
  const businessEventId = `${lcNumber}-A3S`;
  const sgRedeem = service.createMovement({
    instrumentType: 'SHGT',
    balanceContractId: sgIssue.movement.balanceContractId,
    movementType: 'FULL_REDEEM',
    eventSeq: 2,
    amount: '20000',
    currency: 'USD',
    businessEventId,
    sourceTransactionRef: 'A3S-DOC',
    createdBy: 'maker-1',
  });
  if (!sgRedeem.created) throw new Error('expected SG redemption');
  const utilize = service.createMovement({
    instrumentType: 'IPLC_LC',
    balanceContractId: issue.movement.balanceContractId,
    movementType: 'UTILIZE',
    eventSeq: 2,
    amount: '20000',
    currency: 'USD',
    businessEventId,
    sourceTransactionRef: 'A3S-DOC',
    createdBy: 'maker-1',
  });
  if (!utilize.created) throw new Error('expected A3S arrival');
  service.release(sgRedeem.movement.movementId, 'checker-1');
  service.acknowledgeArrival(utilize.movement.movementId, 'checker-1');
  return {
    utilizeId: utilize.movement.movementId,
    lcBalanceContractId: issue.movement.balanceContractId,
    sgBalanceContractId: sgIssue.movement.balanceContractId,
  };
}

describe('HTTP Maker Excess submit — A3 vertical slice', () => {
  test.each([
    ['positive policy covered-only', runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) })],
    ['BD-03 zero policy covered-only', runtime({ ok: false, code: 'FX_RATE_UNAVAILABLE' }, '30', '0')],
  ])('%s preserves the existing HTTP movement response', async (_label, configuredRuntime) => {
    const db = createDb(':memory:');
    try {
      const balanceContractId = seedReleasedLc(db);
      const service = new BalanceService(db, () => decisionTime, undefined, configuredRuntime);

      const response = await request(createApp(db, service))
        .post('/balance-movements')
        .set('Idempotency-Key', `api-legacy-${_label}`)
        .send(body(balanceContractId, '80'))
        .expect(201);

      expect(response.body).toMatchObject({ balanceContractId, movementType: 'UTILIZE', amount: '80', status: 'PENDING' });
      expect(response.body.movementId).toEqual(expect.any(String));
      expect(response.body.kind).toBeUndefined();
      expect(tableCount(db, 'balance_movements')).toBe(2);
      expect(tableCount(db, 'excess_ledger_events')).toBe(0);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('requires Idempotency-Key when the Excess runtime owns the A3 command', async () => {
    const db = createDb(':memory:');
    try {
      const balanceContractId = seedReleasedLc(db);
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }, '30', '1000', 'EXPORT_CONFIRMATION'),
      );
      const beforeMovements = tableCount(db, 'balance_movements');

      const response = await request(createApp(db, service)).post('/balance-movements').send(body(balanceContractId, '120')).expect(400);

      expect(response.body).toEqual({ code: 'REQUEST_VALIDATION_FAILED', message: 'Idempotency-Key is required for Maker Excess Submit.' });
      expect(tableCount(db, 'balance_movements')).toBe(beforeMovements);
      expect(tableCount(db, 'command_idempotency')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('BD-03 routes an over-capacity A3 through legacy sufficiency with zero FX and zero Excess persistence', async () => {
    const db = createDb(':memory:');
    try {
      const balanceContractId = seedReleasedLc(db);
      const fxResolve = jest.fn(async () => ({ ok: false as const, code: 'FX_RATE_UNAVAILABLE' as const }));
      const service = new BalanceService(db, () => decisionTime, undefined, {
        policy: { resolve: () => ({ ...policy, allowancePercentage: '0' }) },
        fx: { resolveConfiguredMaximum: fxResolve },
      });
      const beforeMovements = tableCount(db, 'balance_movements');

      const response = await request(createApp(db, service))
        .post('/balance-movements')
        .set('Idempotency-Key', 'api-A3-bd03-insufficient')
        .send(body(balanceContractId, '120'))
        .expect(409);

      expect(response.body).toEqual({
        code: 'INSUFFICIENT_AVAILABLE_BALANCE',
        message: 'Requested amount 120 exceeds Available Balance 100.',
      });
      expect(fxResolve).not.toHaveBeenCalled();
      expect(tableCount(db, 'balance_movements')).toBe(beforeMovements);
      expect(tableCount(db, 'excess_ledger_events')).toBe(0);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('an ordinary A3 cannot bypass the Excess boundary by supplying an unrelated businessEventId', async () => {
    const db = createDb(':memory:');
    try {
      const balanceContractId = seedReleasedLc(db);
      const service = new BalanceService(db, () => decisionTime, undefined, runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }));
      const beforeMovements = tableCount(db, 'balance_movements');

      const response = await request(createApp(db, service))
        .post('/balance-movements')
        .send({ ...body(balanceContractId, '120'), businessEventId: 'correlation-only' })
        .expect(400);

      expect(response.body.code).toBe('REQUEST_VALIDATION_FAILED');
      expect(response.body.message).toBe('Idempotency-Key is required for Maker Excess Submit.');
      expect(tableCount(db, 'balance_movements')).toBe(beforeMovements);
    } finally {
      db.close();
    }
  });

  test('returns typed 201 and persists one movement/reservation/snapshot set', async () => {
    const db = createDb(':memory:');
    try {
      const balanceContractId = seedReleasedLc(db);
      const service = new BalanceService(db, () => decisionTime, undefined, runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }));

      const response = await request(createApp(db, service))
        .post('/balance-movements')
        .set('Idempotency-Key', 'api-key-1')
        .send(body(balanceContractId, '120'))
        .expect(201);

      expect(response.body).toMatchObject({
        status: 'PENDING',
        movementType: 'UTILIZE',
        amount: '120',
        workflowStatus: 'PENDING',
        coveredAmountOwner: '100',
        excessAmountOwner: '20',
        contingentAccountEntry: expect.any(Object),
      });
      expect(tableCount(db, 'balance_movements')).toBe(2);
      expect(tableCount(db, 'excess_ledger_events')).toBe(1);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(1);
      expect(tableCount(db, 'excess_decision_snapshots')).toBe(1);
    } finally {
      db.close();
    }
  });

  test('returns EXCESS_LIMIT_EXCEEDED and performs strict zero-write', async () => {
    const db = createDb(':memory:');
    try {
      const balanceContractId = seedReleasedLc(db);
      const service = new BalanceService(db, () => decisionTime, undefined, runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }, '10'));
      const beforeMovements = tableCount(db, 'balance_movements');

      const response = await request(createApp(db, service))
        .post('/balance-movements')
        .set('Idempotency-Key', 'api-over-limit')
        .send(body(balanceContractId, '120'))
        .expect(409);

      expect(response.body).toMatchObject({
        code: 'EXCESS_LIMIT_EXCEEDED',
        guidance: {
          outcome: 'FINITE',
          minimumRequiredIncreaseOwner: '9.09',
          snapshotTime: expect.any(String),
          evidence: expect.objectContaining({ approvedContractualMaximumOwner: '100', proposedExcessOwner: '20' }),
        },
      });
      expect(tableCount(db, 'balance_movements')).toBe(beforeMovements);
      for (const table of ['excess_accounts', 'excess_ledger_events', 'fx_rate_snapshots', 'excess_decision_snapshots', 'command_idempotency']) {
        expect(tableCount(db, table)).toBe(0);
      }
    } finally {
      db.close();
    }
  });

  test('returns immutable provider FX contribution evidence when the converted configured maximum is binding', async () => {
    const db = createDb(':memory:');
    try {
      const balanceContractId = seedReleasedLc(db);
      const fxQuote = {
        ...quote({ correlationId: 'ignored', policyVersion: policy.policyVersion } as CurrencyExchangeRequest),
        bookingRate: '0.015',
        convertedAmount: '15',
        providerRateId: 'binding-rate',
        providerRateVersion: 'binding-v1',
      };
      const service = new BalanceService(db, () => decisionTime, undefined, {
        policy: { resolve: () => ({ ...policy, allowancePercentage: '30' }) },
        fx: { resolveConfiguredMaximum: async () => ({ ok: true, quote: fxQuote }) },
      });
      const beforeMovements = tableCount(db, 'balance_movements');

      const response = await request(createApp(db, service))
        .post('/balance-movements')
        .set('Idempotency-Key', 'api-fx-contribution')
        .send(body(balanceContractId, '120'))
        .expect(409);

      expect(response.body).toMatchObject({
        code: 'EXCESS_LIMIT_EXCEEDED',
        guidance: {
          outcome: 'FINITE',
          minimumRequiredIncreaseOwner: '5',
          fxContribution: true,
          fxEvidence: {
            rateOrigin: 'PROVIDER_SUPPLIED',
            bookingRate: '0.015',
            providerRateId: 'binding-rate',
            providerRateVersion: 'binding-v1',
            rateTimestamp: '2026-09-22T23:59:00.000Z',
          },
        },
      });
      expect(tableCount(db, 'balance_movements')).toBe(beforeMovements);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(0);
      expect(tableCount(db, 'excess_decision_snapshots')).toBe(0);
    } finally {
      db.close();
    }
  });

  test.each(['FX_RATE_UNAVAILABLE', 'FX_RATE_STALE'] as const)('returns typed %s and performs strict zero-write', async (code) => {
    const db = createDb(':memory:');
    try {
      const balanceContractId = seedReleasedLc(db);
      const service = new BalanceService(db, () => decisionTime, undefined, runtime({ ok: false, code }));
      const beforeMovements = tableCount(db, 'balance_movements');

      const response = await request(createApp(db, service))
        .post('/balance-movements')
        .set('Idempotency-Key', `api-${code}`)
        .send(body(balanceContractId, '120'))
        .expect(409);

      expect(response.body).toEqual({ code });
      expect(tableCount(db, 'balance_movements')).toBe(beforeMovements);
      for (const table of ['excess_accounts', 'excess_ledger_events', 'fx_rate_snapshots', 'excess_decision_snapshots', 'command_idempotency']) {
        expect(tableCount(db, table)).toBe(0);
      }
    } finally {
      db.close();
    }
  });

  test('same key with a changed payload returns IDEMPOTENCY_CONFLICT', async () => {
    const db = createDb(':memory:');
    try {
      const balanceContractId = seedReleasedLc(db);
      const service = new BalanceService(db, () => decisionTime, undefined, runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }));
      const app = createApp(db, service);

      await request(app).post('/balance-movements').set('Idempotency-Key', 'api-idem').send(body(balanceContractId, '120')).expect(201);
      const response = await request(app).post('/balance-movements').set('Idempotency-Key', 'api-idem').send(body(balanceContractId, '121')).expect(409);

      expect(response.body).toEqual({ code: 'IDEMPOTENCY_CONFLICT' });
      expect(tableCount(db, 'balance_movements')).toBe(2);
      expect(tableCount(db, 'excess_ledger_events')).toBe(1);
    } finally {
      db.close();
    }
  });
});

describe('HTTP Reject and whole Delete Pending — Excess reservation lifecycle', () => {
  test('A8 Delete Pending rejects a partial-cancellation amount and preserves the complete pending transaction', async () => {
    const db = createDb(':memory:');
    try {
      const balanceContractId = seedReleasedLc(db);
      const service = new BalanceService(db, () => decisionTime, undefined, runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }));
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', 'no-partial-cancel-maker')
        .send(body(balanceContractId, '120'))
        .expect(201);
      const beforeLedger = tableCount(db, 'excess_ledger_events');

      const rejected = await request(app)
        .post(`/balance-movements/${maker.body.movementId}/cancel`)
        .set('Idempotency-Key', 'no-partial-cancel')
        .send({ cancelledBy: 'maker-1', reasonCode: 'DELETE_PENDING', amount: '10' })
        .expect(400);

      expect(rejected.body.message).toMatch(/does not accept amount/i);
      expect(db.prepare('SELECT status, amount FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual({
        status: 'PENDING',
        amount: '120',
      });
      expect(service.hasExcessReservation(maker.body.movementId)).toBe(true);
      expect(tableCount(db, 'excess_ledger_events')).toBe(beforeLedger);
      expect(tableCount(db, 'delete_pending_audit')).toBe(0);
    } finally {
      db.close();
    }
  });

  test.each(['return-documents', 'partial-cancel'])('does not expose the obsolete Excess %s command', async (command) => {
    const db = createDb(':memory:');
    try {
      const balanceContractId = seedReleasedLc(db);
      const service = new BalanceService(db, () => decisionTime, undefined, runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }));
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', `no-${command}-maker`)
        .send(body(balanceContractId, '120'))
        .expect(201);
      const beforeLedger = tableCount(db, 'excess_ledger_events');

      await request(app).post(`/balance-movements/${maker.body.movementId}/${command}`).send({ amount: '10', actor: 'maker-1' }).expect(404);

      expect(db.prepare('SELECT status, amount FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual({
        status: 'PENDING',
        amount: '120',
      });
      expect(service.hasExcessReservation(maker.body.movementId)).toBe(true);
      expect(tableCount(db, 'excess_ledger_events')).toBe(beforeLedger);
    } finally {
      db.close();
    }
  });

  test.each(['PENDING', 'REJECTED'] as const)(
    'whole Delete Pending from %s atomically releases the complete reservation and preserves audit facts',
    async (sourceStatus) => {
      const db = createDb(':memory:');
      try {
        const balanceContractId = seedReleasedLc(db);
        const service = new BalanceService(db, () => decisionTime, undefined, runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }));
        const app = createApp(db, service);
        const maker = await request(app)
          .post('/balance-movements')
          .set('Idempotency-Key', `delete-${sourceStatus}-maker`)
          .send(body(balanceContractId, '120'))
          .expect(201);

        if (sourceStatus === 'REJECTED') {
          await request(app)
            .post(`/balance-movements/${maker.body.movementId}/reject`)
            .send({ releasedBy: 'checker-delete', reasonCode: 'DOCS_REJECTED', remarks: 'checker rejection evidence' })
            .expect(200);

          expect(service.hasExcessReservation(maker.body.movementId)).toBe(true);
          expect(db.prepare('SELECT event_type FROM excess_ledger_events WHERE movement_id = ?').all(maker.body.movementId)).toEqual([
            { event_type: 'PENDING_RESERVATION' },
          ]);
        }

        const deleted = await request(app)
          .post(`/balance-movements/${maker.body.movementId}/cancel`)
          .set('Idempotency-Key', `delete-${sourceStatus}`)
          .send({ cancelledBy: 'maker-1', reasonCode: 'DELETE_PENDING', remarks: 'whole withdrawal' })
          .expect(200);

        const replay = await request(app)
          .post(`/balance-movements/${maker.body.movementId}/cancel`)
          .set('Idempotency-Key', `delete-${sourceStatus}`)
          .send({ cancelledBy: 'maker-1', reasonCode: 'DELETE_PENDING', remarks: 'whole withdrawal' })
          .expect(200);
        expect(replay.body).toEqual(deleted.body);
        const conflict = await request(app)
          .post(`/balance-movements/${maker.body.movementId}/cancel`)
          .set('Idempotency-Key', `delete-${sourceStatus}`)
          .send({ cancelledBy: 'maker-1', reasonCode: 'CHANGED_DELETE_REASON', remarks: 'whole withdrawal' })
          .expect(409);
        expect(conflict.body).toEqual({ code: 'IDEMPOTENCY_CONFLICT' });

        expect(deleted.body).toMatchObject({ movementId: maker.body.movementId, status: 'CANCELLED', cancelledBy: 'maker-1' });
        expect(service.hasExcessReservation(maker.body.movementId)).toBe(false);
        expect(
          db
            .prepare('SELECT event_type, allowance_amount_owner, source_excess_event_id FROM excess_ledger_events WHERE movement_id = ? ORDER BY rowid')
            .all(maker.body.movementId),
        ).toEqual([
          { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '20', source_excess_event_id: null },
          expect.objectContaining({ event_type: 'RESERVATION_RELEASE', allowance_amount_owner: '20', source_excess_event_id: expect.any(String) }),
        ]);
        expect(db.prepare('SELECT status_before, reason_code, remarks FROM delete_pending_audit WHERE movement_id = ?').get(maker.body.movementId)).toEqual({
          status_before: sourceStatus,
          reason_code: 'DELETE_PENDING',
          remarks: 'whole withdrawal',
        });
        expect(tableCount(db, 'excess_decision_snapshots')).toBe(1);
        expect(tableCount(db, 'fx_rate_snapshots')).toBe(1);
        expect(
          db
            .prepare("SELECT COUNT(*) AS count FROM excess_ledger_events WHERE movement_id = ? AND event_type = 'APPROVED_UTILIZATION'")
            .get(maker.body.movementId),
        ).toEqual({ count: 0 });

        if (sourceStatus === 'REJECTED') {
          expect(db.prepare('SELECT released_by, reason_code, remarks FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual({
            released_by: 'checker-delete',
            reason_code: 'DOCS_REJECTED',
            remarks: 'checker rejection evidence',
          });
        }
      } finally {
        db.close();
      }
    },
  );

  test('a late deletion-audit failure rolls back movement deletion and reservation release', async () => {
    const db = createDb(':memory:');
    try {
      const balanceContractId = seedReleasedLc(db);
      const service = new BalanceService(db, () => decisionTime, undefined, runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }));
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', 'delete-rollback-maker')
        .send(body(balanceContractId, '120'))
        .expect(201);
      const internal = service as unknown as { deletePendingAudit: { insert: () => void } };
      internal.deletePendingAudit.insert = () => {
        throw new Error('simulated delete audit failure');
      };

      await request(app)
        .post(`/balance-movements/${maker.body.movementId}/cancel`)
        .set('Idempotency-Key', 'delete-rollback')
        .send({ cancelledBy: 'maker-1', reasonCode: 'DELETE_PENDING' })
        .expect(500);

      expect(db.prepare('SELECT status FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual({ status: 'PENDING' });
      expect(service.hasExcessReservation(maker.body.movementId)).toBe(true);
      expect(db.prepare('SELECT event_type FROM excess_ledger_events WHERE movement_id = ?').all(maker.body.movementId)).toEqual([
        { event_type: 'PENDING_RESERVATION' },
      ]);
      expect(tableCount(db, 'delete_pending_audit')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('released Approved Excess cannot be Delete Pending and is never reduced', async () => {
    const db = createDb(':memory:');
    try {
      const parent = seedReleasedRoot(db, 'EPLC_CONFIRMATION', 'DELETE-APPROVED-B3');
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }, '30', '1000', 'EXPORT_CONFIRMATION'),
      );
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', 'delete-approved-maker')
        .send({
          instrumentType: 'EPLC_EXAMINATION',
          naturalKey: { lcNumber: 'DELETE-APPROVED-B3', ibNumber: 'IB-DELETE-APPROVED' },
          parentLogicalContractId: parent.logicalContractId,
          movementType: 'CREATE',
          eventSeq: 1,
          amount: '120',
          currency: 'USD',
          createdBy: 'maker-1',
        })
        .expect(201);
      await request(app)
        .post(`/balance-movements/${maker.body.movementId}/release`)
        .set('Idempotency-Key', 'delete-approved-checker')
        .send({ releasedBy: 'checker-1' })
        .expect(200);

      const beforeLedger = db
        .prepare('SELECT event_type, allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ? ORDER BY rowid')
        .all(maker.body.movementId);
      await request(app)
        .post(`/balance-movements/${maker.body.movementId}/cancel`)
        .set('Idempotency-Key', 'delete-approved')
        .send({ cancelledBy: 'maker-1', reasonCode: 'DELETE_PENDING' })
        .expect(409);

      expect(db.prepare('SELECT status FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual({ status: 'RELEASED' });
      expect(
        db.prepare('SELECT event_type, allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ? ORDER BY rowid').all(maker.body.movementId),
      ).toEqual(beforeLedger);
      expect(tableCount(db, 'delete_pending_audit')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('Excess Delete Pending requires Idempotency-Key before any write', async () => {
    const db = createDb(':memory:');
    try {
      const balanceContractId = seedReleasedLc(db);
      const service = new BalanceService(db, () => decisionTime, undefined, runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }));
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', 'delete-key-required-maker')
        .send(body(balanceContractId, '120'))
        .expect(201);

      const response = await request(app)
        .post(`/balance-movements/${maker.body.movementId}/cancel`)
        .send({ cancelledBy: 'maker-1', reasonCode: 'DELETE_PENDING' })
        .expect(400);

      expect(response.body.code).toBe('REQUEST_VALIDATION_FAILED');
      expect(db.prepare('SELECT status FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual({ status: 'PENDING' });
      expect(service.hasExcessReservation(maker.body.movementId)).toBe(true);
      expect(tableCount(db, 'delete_pending_audit')).toBe(0);
    } finally {
      db.close();
    }
  });
});

describe('HTTP Checker Excess Acknowledge — A3 vertical slice', () => {
  test('revalues with a fresh quote, records Checker snapshots and retains Pending Excess', async () => {
    const db = createDb(':memory:');
    try {
      const balanceContractId = seedReleasedLc(db);
      let fxCall = 0;
      const service = new BalanceService(db, () => decisionTime, undefined, {
        policy: { resolve: () => policy },
        fx: {
          resolveConfiguredMaximum: async ({ request }) => {
            fxCall += 1;
            return { ok: true, quote: { ...quote(request), providerRateVersion: `v${fxCall}`, requestAttemptId: `attempt-${fxCall}` } };
          },
        },
      });
      const app = createApp(db, service);
      const maker = await request(app).post('/balance-movements').set('Idempotency-Key', 'maker-http-ack').send(body(balanceContractId, '120')).expect(201);

      const response = await request(app)
        .post(`/balance-movements/${maker.body.movementId}/acknowledge`)
        .set('Idempotency-Key', 'checker-http-ack')
        .send({ acknowledgedBy: 'checker-http' })
        .expect(200);

      expect(response.body).toMatchObject({
        movement: { movementId: maker.body.movementId, status: 'PENDING', acknowledgedBy: 'checker-http' },
        excessDecision: 'WITHIN_ALLOWANCE',
        releaseEligibility: 'ELIGIBLE',
      });
      expect(fxCall).toBe(2);
      expect(tableCount(db, 'excess_ledger_events')).toBe(1);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(2);
      expect(tableCount(db, 'excess_decision_snapshots')).toBe(2);
    } finally {
      db.close();
    }
  });

  test('returns typed FX failure and leaves the movement and reservation Pending', async () => {
    const db = createDb(':memory:');
    try {
      const balanceContractId = seedReleasedLc(db);
      let fxCall = 0;
      const service = new BalanceService(db, () => decisionTime, undefined, {
        policy: { resolve: () => policy },
        fx: {
          resolveConfiguredMaximum: async ({ request }) => {
            fxCall += 1;
            return fxCall === 1 ? { ok: true, quote: quote(request) } : { ok: false, code: 'FX_RATE_STALE' };
          },
        },
      });
      const app = createApp(db, service);
      const maker = await request(app).post('/balance-movements').set('Idempotency-Key', 'maker-http-stale').send(body(balanceContractId, '120')).expect(201);

      const response = await request(app)
        .post(`/balance-movements/${maker.body.movementId}/acknowledge`)
        .set('Idempotency-Key', 'checker-http-stale')
        .send({ acknowledgedBy: 'checker-http' })
        .expect(409);

      expect(response.body).toEqual({ code: 'FX_RATE_STALE' });
      expect(db.prepare('SELECT status, acknowledged_at FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual({
        status: 'PENDING',
        acknowledged_at: null,
      });
      expect(tableCount(db, 'excess_ledger_events')).toBe(1);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(1);
      expect(tableCount(db, 'excess_decision_snapshots')).toBe(1);
      expect(tableCount(db, 'excess_command_attempt_audits')).toBe(1);
    } finally {
      db.close();
    }
  });
});

describe('HTTP A4/A6 final Checker Release — pending Excess conversion', () => {
  test('A4 Excess context is event-specific: covered B01 hides waiver while Excess B02 requires it', async () => {
    const db = createDb(':memory:');
    try {
      const parent = seedReleasedRoot(db, 'IPLC_LC', 'HTTP-A4-EVENT-EXCESS', '1000');
      const service = new BalanceService(db, () => decisionTime, undefined, runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }));
      const app = createApp(db, service);

      const b01 = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', 'a4-event-b01')
        .send({ ...body(parent.balanceContractId, '500'), currency: 'USD', sourceTransactionRef: 'B01' })
        .expect(201);
      await request(app)
        .post(`/balance-movements/${b01.body.movementId}/acknowledge`)
        .set('Idempotency-Key', 'a4-event-b01-ack')
        .send({ acknowledgedBy: 'a3-checker' })
        .expect(200);

      const b02 = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', 'a4-event-b02')
        .send({ ...body(parent.balanceContractId, '600'), eventSeq: 3, currency: 'USD', sourceTransactionRef: 'B02' })
        .expect(201);
      await request(app)
        .post(`/balance-movements/${b02.body.movementId}/acknowledge`)
        .set('Idempotency-Key', 'a4-event-b02-ack')
        .send({ acknowledgedBy: 'a3-checker' })
        .expect(200);

      await request(app)
        .get(`/balance-movements/${b01.body.movementId}/excess-release-context`)
        .expect(200)
        .expect({
          sourceMovementId: null,
          thisExcessAmountOwner: '0',
          ownerCurrency: 'USD',
          requiresApplicantWaiver: false,
          requiresExportAuthorization: false,
        });
      await request(app)
        .get(`/balance-movements/${b02.body.movementId}/excess-release-context`)
        .expect(200)
        .expect({
          sourceMovementId: b02.body.movementId,
          thisExcessAmountOwner: '100',
          ownerCurrency: 'USD',
          requiresApplicantWaiver: false,
          requiresExportAuthorization: false,
        });

      const usanceParent = seedReleasedUsanceLc(db, 'HTTP-A6-EVENT-EXCESS', 'USD', '1000');
      const usanceB01 = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', 'a6-event-b01')
        .send({ ...body(usanceParent.balanceContractId, '500'), currency: 'USD', sourceTransactionRef: 'B01' })
        .expect(201);
      await request(app)
        .post(`/balance-movements/${usanceB01.body.movementId}/acknowledge`)
        .set('Idempotency-Key', 'a6-event-b01-ack')
        .send({ acknowledgedBy: 'a3-checker' })
        .expect(200);
      const usanceB02 = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', 'a6-event-b02')
        .send({ ...body(usanceParent.balanceContractId, '600'), eventSeq: 3, currency: 'USD', sourceTransactionRef: 'B02' })
        .expect(201);
      await request(app)
        .post(`/balance-movements/${usanceB02.body.movementId}/acknowledge`)
        .set('Idempotency-Key', 'a6-event-b02-ack')
        .send({ acknowledgedBy: 'a3-checker' })
        .expect(200);

      const acceptanceB01 = service.createMovement({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'HTTP-A6-EVENT-EXCESS', ibNumber: 'B01' },
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '500',
        currency: 'USD',
        tenorType: 'SELLERS_USANCE',
        parentLogicalContractId: usanceParent.logicalContractId,
        referencedTransactionId: usanceB01.body.movementId,
        createdBy: 'a6-maker',
      });
      const acceptanceB02 = service.createMovement({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'HTTP-A6-EVENT-EXCESS', ibNumber: 'B02' },
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '600',
        currency: 'USD',
        tenorType: 'SELLERS_USANCE',
        parentLogicalContractId: usanceParent.logicalContractId,
        referencedTransactionId: usanceB02.body.movementId,
        createdBy: 'a6-maker',
      });
      if (!acceptanceB01.created || !acceptanceB02.created) throw new Error('expected A6 Acceptance movements');
      await request(app)
        .get(`/balance-movements/${acceptanceB01.movement.movementId}/excess-release-context`)
        .expect(200)
        .expect({
          sourceMovementId: null,
          thisExcessAmountOwner: '0',
          ownerCurrency: 'USD',
          requiresApplicantWaiver: false,
          requiresExportAuthorization: false,
        });
      await request(app)
        .get(`/balance-movements/${acceptanceB02.movement.movementId}/excess-release-context`)
        .expect(200)
        .expect({
          sourceMovementId: usanceB02.body.movementId,
          thisExcessAmountOwner: '100',
          ownerCurrency: 'USD',
          requiresApplicantWaiver: false,
          requiresExportAuthorization: false,
        });
    } finally {
      db.close();
    }
  });

  test('A4 revalues again and atomically converts the A3 pending reservation', async () => {
    const db = createDb(':memory:');
    try {
      const parent = seedReleasedRoot(db, 'IPLC_LC', 'HTTP-A4-EXCESS');
      const service = new BalanceService(db, () => decisionTime, undefined, runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }));
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', 'a4-maker')
        .send({ ...body(parent.balanceContractId, '120'), currency: 'USD' })
        .expect(201);
      await request(app)
        .post(`/balance-movements/${maker.body.movementId}/acknowledge`)
        .set('Idempotency-Key', 'a4-ack')
        .send({ acknowledgedBy: 'a3-checker' })
        .expect(200);
      await request(app).post(`/balance-movements/${maker.body.movementId}/maker-submit`).send({ makerSubmittedBy: 'a4-maker' }).expect(200);

      const response = await request(app)
        .post(`/balance-movements/${maker.body.movementId}/release`)
        .set('Idempotency-Key', 'a4-release')
        .send({ releasedBy: 'a4-checker' })
        .expect(200);

      expect(response.body).toMatchObject({ movement: { movementId: maker.body.movementId, status: 'RELEASED' }, releaseEligibility: 'ELIGIBLE' });
      expect(
        db.prepare('SELECT event_type, allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ? ORDER BY rowid').all(maker.body.movementId),
      ).toEqual([
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '20' },
        { event_type: 'RESERVATION_RELEASE', allowance_amount_owner: '20' },
        { event_type: 'APPROVED_UTILIZATION', allowance_amount_owner: '20' },
      ]);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(3);
      expect(tableCount(db, 'excess_decision_snapshots')).toBe(3);
    } finally {
      db.close();
    }
  });

  test('A6 Release revalues and converts the referenced A3 reservation in the same transaction', async () => {
    const db = createDb(':memory:');
    try {
      const parent = seedReleasedUsanceLc(db, 'HTTP-A6-EXCESS');
      const service = new BalanceService(db, () => decisionTime, undefined, runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }));
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', 'a6-maker')
        .send({ ...body(parent.balanceContractId, '120'), currency: 'USD' })
        .expect(201);
      await request(app)
        .post(`/balance-movements/${maker.body.movementId}/acknowledge`)
        .set('Idempotency-Key', 'a6-ack')
        .send({ acknowledgedBy: 'a3-checker' })
        .expect(200);
      const acceptance = service.createMovement({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'HTTP-A6-EXCESS', ibNumber: 'IB-001' },
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '120',
        currency: 'USD',
        tenorType: 'SELLERS_USANCE',
        parentLogicalContractId: parent.logicalContractId,
        referencedTransactionId: maker.body.movementId,
        createdBy: 'a6-maker',
      });
      if (!acceptance.created) throw new Error('expected A6 Acceptance');

      const response = await request(app)
        .post(`/balance-movements/${acceptance.movement.movementId}/release`)
        .set('Idempotency-Key', 'a6-release')
        .send({ releasedBy: 'a6-checker' })
        .expect(200);

      expect(response.body).toMatchObject({ movement: { movementId: acceptance.movement.movementId, status: 'RELEASED' }, releaseEligibility: 'ELIGIBLE' });
      expect(db.prepare('SELECT status FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual({ status: 'RELEASED' });
      expect(
        db.prepare('SELECT event_type, allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ? ORDER BY rowid').all(maker.body.movementId),
      ).toEqual([
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '20' },
        { event_type: 'RESERVATION_RELEASE', allowance_amount_owner: '20' },
        { event_type: 'APPROVED_UTILIZATION', allowance_amount_owner: '20' },
      ]);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(3);
      expect(tableCount(db, 'excess_decision_snapshots')).toBe(3);
      expect(tableCount(db, 'applicant_waiver_snapshots')).toBe(0);

      const replay = await request(app)
        .post(`/balance-movements/${acceptance.movement.movementId}/release`)
        .set('Idempotency-Key', 'a6-release')
        .send({ releasedBy: 'a6-checker' })
        .expect(200);
      expect(replay.body).toEqual(response.body);
      expect(tableCount(db, 'excess_ledger_events')).toBe(3);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(3);
      expect(tableCount(db, 'excess_decision_snapshots')).toBe(3);
    } finally {
      db.close();
    }
  });

  test('A6 final FX failure denies Release and retains both the Acceptance and referenced A3 pending facts', async () => {
    const db = createDb(':memory:');
    try {
      const parent = seedReleasedUsanceLc(db, 'HTTP-A6-FX-FAIL', 'EUR');
      let fxCall = 0;
      const service = new BalanceService(db, () => decisionTime, undefined, {
        policy: { resolve: () => policy },
        fx: {
          resolveConfiguredMaximum: async ({ request }) => {
            fxCall += 1;
            return fxCall < 3 ? { ok: true, quote: quote(request) } : { ok: false, code: 'FX_RATE_STALE' };
          },
        },
      });
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', 'a6-fx-maker')
        .send({ ...body(parent.balanceContractId, '120'), currency: 'EUR' })
        .expect(201);
      await request(app)
        .post(`/balance-movements/${maker.body.movementId}/acknowledge`)
        .set('Idempotency-Key', 'a6-fx-ack')
        .send({ acknowledgedBy: 'a3-checker' })
        .expect(200);
      const acceptance = service.createMovement({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'HTTP-A6-FX-FAIL', ibNumber: 'IB-001' },
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '120',
        currency: 'EUR',
        tenorType: 'SELLERS_USANCE',
        parentLogicalContractId: parent.logicalContractId,
        referencedTransactionId: maker.body.movementId,
        createdBy: 'a6-maker',
      });
      if (!acceptance.created) throw new Error('expected A6 Acceptance');

      const response = await request(app)
        .post(`/balance-movements/${acceptance.movement.movementId}/release`)
        .set('Idempotency-Key', 'a6-fx-release')
        .send({ releasedBy: 'a6-checker' })
        .expect(409);

      expect(response.body).toEqual({ code: 'FX_RATE_STALE' });
      expect(
        db
          .prepare('SELECT status FROM balance_movements WHERE movement_id IN (?, ?) ORDER BY movement_id')
          .all(acceptance.movement.movementId, maker.body.movementId),
      ).toEqual(expect.arrayContaining([{ status: 'PENDING' }, { status: 'PENDING' }]));
      expect(db.prepare('SELECT event_type, allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ?').all(maker.body.movementId)).toEqual([
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '20' },
      ]);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(2);
      expect(tableCount(db, 'excess_decision_snapshots')).toBe(2);
    } finally {
      db.close();
    }
  });
});

describe('HTTP A3 Excess Fix Pending — atomic amount replacement', () => {
  test.each([
    ['10300', '300'],
    ['10100', '100'],
  ])('replaces 10200/200 with %s/%s without double-counting the old reservation', async (newAmount, newExcess) => {
    const db = createDb(':memory:');
    try {
      const parent = seedReleasedRoot(db, 'IPLC_LC', `HTTP-A3-FIX-${newAmount}`, '10000');
      const service = new BalanceService(db, () => decisionTime, undefined, runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }, '5', '1000'));
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', `a3-fix-maker-${newAmount}`)
        .send({ ...body(parent.balanceContractId, '10200'), currency: 'USD' })
        .expect(201);

      const response = await request(app)
        .post(`/balance-movements/${maker.body.movementId}/edit`)
        .set('Idempotency-Key', `a3-fix-${newAmount}`)
        .send({ amount: newAmount, editedBy: 'maker-2' })
        .expect(200);

      expect(response.body).toMatchObject({ movementId: maker.body.movementId, amount: newAmount, status: 'PENDING' });
      expect(
        db.prepare('SELECT event_type, allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ? ORDER BY rowid').all(maker.body.movementId),
      ).toEqual([
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '200' },
        { event_type: 'RESERVATION_RELEASE', allowance_amount_owner: '200' },
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: newExcess },
      ]);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(2);
      expect(tableCount(db, 'excess_decision_snapshots')).toBe(2);
      expect(tableCount(db, 'fix_pending_audit')).toBe(1);

      const replay = await request(app)
        .post(`/balance-movements/${maker.body.movementId}/edit`)
        .set('Idempotency-Key', `a3-fix-${newAmount}`)
        .send({ amount: newAmount, editedBy: 'maker-2' })
        .expect(200);
      expect(replay.body).toEqual(response.body);
      expect(tableCount(db, 'excess_ledger_events')).toBe(3);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(2);
      expect(tableCount(db, 'excess_decision_snapshots')).toBe(2);
      expect(tableCount(db, 'fix_pending_audit')).toBe(1);
    } finally {
      db.close();
    }
  });

  test('over-limit replacement is zero-write and preserves the original 10200/200 pending facts', async () => {
    const db = createDb(':memory:');
    try {
      const parent = seedReleasedRoot(db, 'IPLC_LC', 'HTTP-A3-FIX-LIMIT', '10000');
      const service = new BalanceService(db, () => decisionTime, undefined, runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }, '5', '1000'));
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', 'a3-fix-limit-maker')
        .send({ ...body(parent.balanceContractId, '10200'), currency: 'USD' })
        .expect(201);
      const beforeMovement = db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId);

      const response = await request(app)
        .post(`/balance-movements/${maker.body.movementId}/edit`)
        .set('Idempotency-Key', 'a3-fix-limit')
        .send({ amount: '10600', editedBy: 'maker-2' })
        .expect(409);

      expect(response.body).toMatchObject({
        code: 'EXCESS_LIMIT_EXCEEDED',
        guidance: {
          outcome: 'FINITE',
          minimumRequiredIncreaseOwner: '95.24',
          snapshotTime: expect.any(String),
          evidence: expect.objectContaining({ approvedContractualMaximumOwner: '10000', proposedExcessOwner: '600' }),
        },
      });
      expect(db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual(beforeMovement);
      expect(db.prepare('SELECT event_type, allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ?').all(maker.body.movementId)).toEqual([
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '200' },
      ]);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(1);
      expect(tableCount(db, 'excess_decision_snapshots')).toBe(1);
      expect(tableCount(db, 'fix_pending_audit')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('non-USD stale Booking Rate leaves the original movement and reservation unchanged', async () => {
    const db = createDb(':memory:');
    try {
      const serviceForRoot = new BalanceService(db, () => decisionTime);
      const issue = serviceForRoot.createMovement({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'HTTP-A3-FIX-FX' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '10000',
        currency: 'EUR',
        tenorType: 'SIGHT',
        expiryDate: '2099-12-31',
        createdBy: 'root-maker',
      });
      if (!issue.created) throw new Error('expected EUR LC');
      serviceForRoot.release(issue.movement.movementId, 'root-checker');
      let fxCall = 0;
      const service = new BalanceService(db, () => decisionTime, undefined, {
        policy: { resolve: () => ({ ...policy, allowancePercentage: '5', configuredMaximumUsd: '1000' }) },
        fx: {
          resolveConfiguredMaximum: async ({ request }) => {
            fxCall += 1;
            return fxCall === 1 ? { ok: true, quote: quote(request) } : { ok: false, code: 'FX_RATE_STALE' };
          },
        },
      });
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', 'a3-fix-fx-maker')
        .send({ ...body(issue.movement.balanceContractId, '10200'), currency: 'EUR' })
        .expect(201);
      const beforeMovement = db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId);

      const response = await request(app)
        .post(`/balance-movements/${maker.body.movementId}/edit`)
        .set('Idempotency-Key', 'a3-fix-fx')
        .send({ amount: '10300', editedBy: 'maker-2' })
        .expect(409);

      expect(response.body).toEqual({ code: 'FX_RATE_STALE' });
      expect(db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual(beforeMovement);
      expect(tableCount(db, 'excess_ledger_events')).toBe(1);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(1);
      expect(tableCount(db, 'excess_decision_snapshots')).toBe(1);
      expect(tableCount(db, 'fix_pending_audit')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('late Fix snapshot failure rolls back the edited movement, audit and reservation replacement', async () => {
    const db = createDb(':memory:');
    try {
      const parent = seedReleasedRoot(db, 'IPLC_LC', 'HTTP-A3-FIX-ROLLBACK', '10000');
      const service = new BalanceService(db, () => decisionTime, undefined, runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }, '5', '1000'));
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', 'a3-fix-rollback-maker')
        .send({ ...body(parent.balanceContractId, '10200'), currency: 'USD' })
        .expect(201);
      const beforeMovement = db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId);
      db.exec(`
        CREATE TRIGGER fail_fix_fx_snapshot BEFORE INSERT ON fx_rate_snapshots
        WHEN NEW.decision_point = 'FIX_PENDING'
        BEGIN SELECT RAISE(ABORT, 'injected Fix snapshot failure'); END;
      `);

      await request(app)
        .post(`/balance-movements/${maker.body.movementId}/edit`)
        .set('Idempotency-Key', 'a3-fix-rollback')
        .send({ amount: '10300', editedBy: 'maker-2' })
        .expect(500);

      expect(db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual(beforeMovement);
      expect(tableCount(db, 'excess_ledger_events')).toBe(1);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(1);
      expect(tableCount(db, 'excess_decision_snapshots')).toBe(1);
      expect(tableCount(db, 'fix_pending_audit')).toBe(0);
      expect(db.prepare("SELECT COUNT(*) AS count FROM command_idempotency WHERE command_type = 'FIX_PENDING'").get()).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });

  test('positive-policy reservation to BD-03 covered Fix releases the old reservation without FX or replacement facts', async () => {
    const db = createDb(':memory:');
    try {
      const root = new BalanceService(db, () => decisionTime);
      const issue = root.createMovement({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'HTTP-A3-FIX-BD03' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '10000',
        currency: 'EUR',
        tenorType: 'SIGHT',
        expiryDate: '2099-12-31',
        createdBy: 'root-maker',
      });
      if (!issue.created) throw new Error('expected EUR LC');
      root.release(issue.movement.movementId, 'root-checker');
      let configuredMaximumUsd = '1000';
      let fxCall = 0;
      const service = new BalanceService(db, () => decisionTime, undefined, {
        policy: { resolve: () => ({ ...policy, allowancePercentage: '5', configuredMaximumUsd }) },
        fx: {
          resolveConfiguredMaximum: async ({ request }) => {
            fxCall += 1;
            return { ok: true, quote: quote(request) };
          },
        },
      });
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', 'a3-fix-bd03-maker')
        .send({ ...body(issue.movement.balanceContractId, '10200'), currency: 'EUR' })
        .expect(201);
      configuredMaximumUsd = '0';

      const response = await request(app)
        .post(`/balance-movements/${maker.body.movementId}/edit`)
        .set('Idempotency-Key', 'a3-fix-bd03')
        .send({ amount: '9900', editedBy: 'maker-2' })
        .expect(200);

      expect(response.body).toMatchObject({ movementId: maker.body.movementId, amount: '9900', status: 'PENDING' });
      expect(fxCall).toBe(1);
      expect(
        db.prepare('SELECT event_type, allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ? ORDER BY rowid').all(maker.body.movementId),
      ).toEqual([
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '200' },
        { event_type: 'RESERVATION_RELEASE', allowance_amount_owner: '200' },
      ]);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(1);
      expect(tableCount(db, 'excess_decision_snapshots')).toBe(1);
      expect(tableCount(db, 'fix_pending_audit')).toBe(1);
      expect(service.hasExcessReservation(maker.body.movementId)).toBe(false);
    } finally {
      db.close();
    }
  });
});

describe('HTTP A3S post-Acknowledge Amount Fix — BD-10', () => {
  test.each(['PENDING', 'REJECTED'] as const)('%s/EARMARKED returns ILLEGAL_STATE_TRANSITION before policy, FX or writes', async (state) => {
    const db = createDb(':memory:');
    try {
      const policyResolve = jest.fn(() => {
        throw new Error('post-Acknowledge guard must run before policy');
      });
      const fxResolve = jest.fn<
        ReturnType<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>,
        Parameters<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>
      >();
      const service = new BalanceService(db, () => decisionTime, undefined, {
        policy: { resolve: policyResolve },
        fx: { resolveConfiguredMaximum: fxResolve },
      });
      const seeded = seedAcknowledgedA3S(service, `HTTP-BD10-${state}`);
      if (state === 'REJECTED') service.reject(seeded.utilizeId, 'checker-2', 'DOCS_REJECTED');
      const before = {
        utilize: service.listMovements(seeded.lcBalanceContractId).find((movement) => movement.movementId === seeded.utilizeId),
        sg: service.listMovements(seeded.sgBalanceContractId),
        fixAudit: tableCount(db, 'fix_pending_audit'),
        excessLedger: tableCount(db, 'excess_ledger_events'),
        fxSnapshots: tableCount(db, 'fx_rate_snapshots'),
        decisions: tableCount(db, 'excess_decision_snapshots'),
      };

      const response = await request(createApp(db, service))
        .post(`/balance-movements/${seeded.utilizeId}/edit`)
        .send({ amount: '21000', editedBy: 'maker-2' })
        .expect(409);

      expect(response.body.code).toBe('ILLEGAL_STATE_TRANSITION');
      expect(policyResolve).not.toHaveBeenCalled();
      expect(fxResolve).not.toHaveBeenCalled();
      expect({
        utilize: service.listMovements(seeded.lcBalanceContractId).find((movement) => movement.movementId === seeded.utilizeId),
        sg: service.listMovements(seeded.sgBalanceContractId),
        fixAudit: tableCount(db, 'fix_pending_audit'),
        excessLedger: tableCount(db, 'excess_ledger_events'),
        fxSnapshots: tableCount(db, 'fx_rate_snapshots'),
        decisions: tableCount(db, 'excess_decision_snapshots'),
      }).toEqual(before);
    } finally {
      db.close();
    }
  });
});

describe.each([
  {
    functionCode: 'B3',
    ownerType: 'EXPORT_CONFIRMATION' as const,
    parentType: 'EPLC_CONFIRMATION' as const,
    childType: 'EPLC_EXAMINATION' as const,
    naturalKey: { lcNumber: 'HTTP-B3', ibNumber: 'EB-1' },
    movementType: 'CREATE',
  },
])('HTTP $functionCode Maker Excess submit', ({ functionCode, ownerType, parentType, childType, naturalKey, movementType }) => {
  function childRequest(parentLogicalContractId: string, amount = '120') {
    return {
      instrumentType: childType,
      naturalKey,
      parentLogicalContractId,
      movementType,
      eventSeq: 1,
      amount,
      currency: 'USD',
      createdBy: 'maker-1',
    };
  }

  test('accepts an eligible overdrawn submission and atomically creates child movement plus reservation', async () => {
    const db = createDb(':memory:');
    try {
      const parent = seedReleasedRoot(db, parentType, naturalKey.lcNumber);
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }, '30', '1000', ownerType),
      );
      const beforeContracts = tableCount(db, 'balance_contracts');
      const beforeMovements = tableCount(db, 'balance_movements');

      const response = await request(createApp(db, service))
        .post('/balance-movements')
        .set('Idempotency-Key', `api-${functionCode}-success`)
        .send(childRequest(parent.logicalContractId))
        .expect(201);

      expect(response.body).toMatchObject({
        status: 'PENDING',
        movementType: 'CREATE',
        amount: '120',
        workflowStatus: 'PENDING',
        coveredAmountOwner: '100',
        excessAmountOwner: '20',
        contingentAccountEntry: expect.any(Object),
      });
      expect(tableCount(db, 'balance_contracts')).toBe(beforeContracts + 1);
      expect(tableCount(db, 'balance_movements')).toBe(beforeMovements + 1);
      expect(tableCount(db, 'excess_ledger_events')).toBe(1);
    } finally {
      db.close();
    }
  });

  test('BD-03 routes an over-capacity submission through legacy sufficiency with zero FX and zero Excess persistence', async () => {
    const db = createDb(':memory:');
    try {
      const parent = seedReleasedRoot(db, parentType, `${naturalKey.lcNumber}-BD03`);
      const fxResolve = jest.fn(async () => ({ ok: false as const, code: 'FX_RATE_UNAVAILABLE' as const }));
      const service = new BalanceService(db, () => decisionTime, undefined, {
        policy: { resolve: () => ({ ...policy, ownerType, allowancePercentage: '0' }) },
        fx: { resolveConfiguredMaximum: fxResolve },
      });
      const beforeContracts = tableCount(db, 'balance_contracts');
      const beforeMovements = tableCount(db, 'balance_movements');

      const response = await request(createApp(db, service))
        .post('/balance-movements')
        .set('Idempotency-Key', `api-${functionCode}-bd03-insufficient`)
        .send({ ...childRequest(parent.logicalContractId), naturalKey: { ...naturalKey, lcNumber: `${naturalKey.lcNumber}-BD03` } })
        .expect(409);

      expect(response.body.code).toBe('INSUFFICIENT_AVAILABLE_BALANCE');
      expect(response.body.message).toMatch(
        functionCode === 'A8'
          ? /SG Issue amount 120 exceeds parent LC's Tight Available Balance 100/
          : /Present Docs amount 120 exceeds the parent Confirmation's Present Earmark-adjusted Tight Available Balance 100/,
      );
      expect(fxResolve).not.toHaveBeenCalled();
      expect(tableCount(db, 'balance_contracts')).toBe(beforeContracts);
      expect(tableCount(db, 'balance_movements')).toBe(beforeMovements);
      expect(tableCount(db, 'excess_ledger_events')).toBe(0);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('Reject retains and whole Delete Pending releases the complete child reservation', async () => {
    const db = createDb(':memory:');
    try {
      const lcNumber = `${naturalKey.lcNumber}-DELETE`;
      const parent = seedReleasedRoot(db, parentType, lcNumber);
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }, '30', '1000', ownerType),
      );
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', `api-${functionCode}-delete-maker`)
        .send({ ...childRequest(parent.logicalContractId), naturalKey: { ...naturalKey, lcNumber } })
        .expect(201);

      await request(app)
        .post(`/balance-movements/${maker.body.movementId}/reject`)
        .send({ releasedBy: 'checker-delete', reasonCode: 'REJECT_FOR_CORRECTION' })
        .expect(200);
      expect(service.hasExcessReservation(maker.body.movementId)).toBe(true);

      await request(app)
        .post(`/balance-movements/${maker.body.movementId}/cancel`)
        .set('Idempotency-Key', `api-${functionCode}-delete`)
        .send({ cancelledBy: 'maker-1', reasonCode: 'DELETE_PENDING' })
        .expect(200);

      expect(service.hasExcessReservation(maker.body.movementId)).toBe(false);
      expect(db.prepare('SELECT status FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual({ status: 'CANCELLED' });
      expect(
        db.prepare('SELECT event_type, allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ? ORDER BY rowid').all(maker.body.movementId),
      ).toEqual([
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '20' },
        { event_type: 'RESERVATION_RELEASE', allowance_amount_owner: '20' },
      ]);
      expect(db.prepare('SELECT status_before FROM delete_pending_audit WHERE movement_id = ?').get(maker.body.movementId)).toEqual({
        status_before: 'REJECTED',
      });
    } finally {
      db.close();
    }
  });

  test('Fix Pending replaces the original reservation using the same child movement identity', async () => {
    const db = createDb(':memory:');
    try {
      const parent = seedReleasedRoot(db, parentType, `${naturalKey.lcNumber}-FIX`);
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }, '30', '1000', ownerType),
      );
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', `api-${functionCode}-fix-maker`)
        .send({ ...childRequest(parent.logicalContractId), naturalKey: { ...naturalKey, lcNumber: `${naturalKey.lcNumber}-FIX` } })
        .expect(201);

      const response = await request(app)
        .post(`/balance-movements/${maker.body.movementId}/edit`)
        .set('Idempotency-Key', `api-${functionCode}-fix`)
        .send({ amount: '125', editedBy: 'maker-2' })
        .expect(200);

      expect(response.body).toMatchObject({ movementId: maker.body.movementId, amount: '125', status: 'PENDING' });
      expect(
        db.prepare('SELECT event_type, allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ? ORDER BY rowid').all(maker.body.movementId),
      ).toEqual([
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '20' },
        { event_type: 'RESERVATION_RELEASE', allowance_amount_owner: '20' },
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '25' },
      ]);
    } finally {
      db.close();
    }
  });

  test('Checker own Release revalues and atomically converts the reservation to Approved Excess', async () => {
    const db = createDb(':memory:');
    try {
      const parent = seedReleasedRoot(db, parentType, `${naturalKey.lcNumber}-RELEASE`);
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }, '30', '1000', ownerType),
      );
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', `api-${functionCode}-release-maker`)
        .send({ ...childRequest(parent.logicalContractId), naturalKey: { ...naturalKey, lcNumber: `${naturalKey.lcNumber}-RELEASE` } })
        .expect(201);

      const released = await request(app)
        .post(`/balance-movements/${maker.body.movementId}/release`)
        .set('Idempotency-Key', `api-${functionCode}-release-checker`)
        .send({ releasedBy: 'checker-1' })
        .expect(200);

      expect(released.body).toMatchObject({ movement: { movementId: maker.body.movementId, status: 'RELEASED' }, releaseEligibility: 'ELIGIBLE' });
      expect(
        db.prepare('SELECT event_type, allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ? ORDER BY rowid').all(maker.body.movementId),
      ).toEqual([
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '20' },
        { event_type: 'RESERVATION_RELEASE', allowance_amount_owner: '20' },
        { event_type: 'APPROVED_UTILIZATION', allowance_amount_owner: '20' },
      ]);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(2);
      expect(tableCount(db, 'excess_decision_snapshots')).toBe(2);
      if (functionCode === 'A8') {
        expect(
          db
            .prepare(
              `SELECT sg_balance_contract_id, source_movement_id, event_type, transaction_currency,
                      capacity_amount, covered_amount, excess_amount
               FROM sg_capacity_events`,
            )
            .all(),
        ).toEqual([
          {
            sg_balance_contract_id: released.body.movement.balanceContractId,
            source_movement_id: maker.body.movementId,
            event_type: 'INITIALIZE',
            transaction_currency: 'USD',
            capacity_amount: '120',
            covered_amount: '100',
            excess_amount: '20',
          },
        ]);
        expect(db.prepare('SELECT balance_after FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual({
          balance_after: '120',
        });
      } else {
        expect(tableCount(db, 'sg_capacity_events')).toBe(0);
      }

      const replay = await request(app)
        .post(`/balance-movements/${maker.body.movementId}/release`)
        .set('Idempotency-Key', `api-${functionCode}-release-checker`)
        .send({ releasedBy: 'checker-1' })
        .expect(200);
      expect(replay.body).toEqual(released.body);
      expect(tableCount(db, 'excess_ledger_events')).toBe(3);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(2);
      expect(tableCount(db, 'excess_decision_snapshots')).toBe(2);
      expect(tableCount(db, 'sg_capacity_events')).toBe(functionCode === 'A8' ? 1 : 0);
      expect(service.resolveExcessReleaseTarget(maker.body.movementId)).toBeNull();

      if (functionCode === 'B3') {
        const beforeB4Movements = tableCount(db, 'balance_movements');
        const mismatched = await request(app)
          .post('/balance-movements')
          .send({
            instrumentType: 'EPLC_CONFIRMATION',
            balanceContractId: parent.balanceContractId,
            movementType: 'HONOUR',
            eventSeq: 2,
            amount: '119',
            currency: 'USD',
            sourceTransactionRef: 'B4-MISMATCH',
            referencedTransactionId: maker.body.movementId,
            createdBy: 'b4-maker',
          })
          .expect(400);
        expect(mismatched.body).toMatchObject({ code: 'REQUEST_VALIDATION_FAILED' });
        expect(tableCount(db, 'balance_movements')).toBe(beforeB4Movements);

        const honour = await request(app)
          .post('/balance-movements')
          .send({
            instrumentType: 'EPLC_CONFIRMATION',
            balanceContractId: parent.balanceContractId,
            movementType: 'HONOUR',
            eventSeq: 2,
            amount: '120',
            currency: 'USD',
            sourceTransactionRef: 'B4-HONOUR',
            referencedTransactionId: maker.body.movementId,
            createdBy: 'b4-maker',
          })
          .expect(201);
        expect(honour.body).toMatchObject({ amount: '120', ceilingAmount: '100', status: 'PENDING' });

        const b4Release = await request(app)
          .post(`/balance-movements/${honour.body.movementId}/release`)
          .send({
            releasedBy: 'b4-checker',
            exportAuthorization: {
              claimStatus: 'SUBMITTED',
              authorizationReference: 'AUTH-B4-20',
              authorizedAmountOwner: '20',
              authorizedCurrency: 'USD',
              authorizationValidationResult: 'CONFIRMED',
            },
          })
          .expect(200);
        expect(b4Release.body).toMatchObject({
          movement: { movementId: honour.body.movementId, status: 'RELEASED', balanceBefore: '100', balanceAfter: '0' },
          authorization: { excessDebtor: 'ISSUING_BANK' },
          assets: [
            { balanceType: 'Due from Issuing Bank', amountOwner: '100', mappingKey: 'EPLC_DUE_FROM_ISSUING_BANK:SIGHT' },
            { balanceType: 'EXPORT_EXCESS_ASSET', amountOwner: '20', mappingKey: 'EXPORT_EXCESS_ASSET:SIGHT' },
          ],
        });
        expect(service.resolveExcessReleaseTarget(honour.body.movementId)).toBeNull();
        expect(tableCount(db, 'excess_ledger_events')).toBe(3);
        expect(tableCount(db, 'fx_rate_snapshots')).toBe(2);
        expect(tableCount(db, 'excess_decision_snapshots')).toBe(2);
        expect(tableCount(db, 'export_authorization_snapshots')).toBe(1);
        expect(tableCount(db, 'export_asset_postings')).toBe(2);
      }
    } finally {
      db.close();
    }
  });

  if (functionCode === 'B3') {
    test('B4 authorization context is event-specific for covered B01 and Excess B02', async () => {
      const db = createDb(':memory:');
      try {
        const lcNumber = 'HTTP-B4-EVENT-EXCESS';
        const parent = seedReleasedRoot(db, parentType, lcNumber, '1000');
        const service = new BalanceService(
          db,
          () => decisionTime,
          undefined,
          runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }, '30', '1000', ownerType),
        );
        const app = createApp(db, service);
        const submitAndReleaseB3 = async (ibNumber: string, amount: string) => {
          const maker = await request(app)
            .post('/balance-movements')
            .set('Idempotency-Key', `b4-event-${ibNumber}`)
            .send({ ...childRequest(parent.logicalContractId, amount), naturalKey: { lcNumber, ibNumber } })
            .expect(201);
          await request(app)
            .post(`/balance-movements/${maker.body.movementId}/release`)
            .set('Idempotency-Key', `b4-event-${ibNumber}-release`)
            .send({ releasedBy: 'b3-checker' })
            .expect(200);
          return maker.body as { movementId: string };
        };
        const b01 = await submitAndReleaseB3('B01', '500');
        const b02 = await submitAndReleaseB3('B02', '600');
        const createB4 = async (source: { movementId: string }, reference: string, amount: string, eventSeq: number) => {
          const response = await request(app)
            .post('/balance-movements')
            .send({
              instrumentType: 'EPLC_CONFIRMATION',
              balanceContractId: parent.balanceContractId,
              movementType: 'HONOUR',
              eventSeq,
              amount,
              currency: 'USD',
              sourceTransactionRef: reference,
              referencedTransactionId: source.movementId,
              createdBy: 'b4-maker',
            })
            .expect(201);
          return response.body as { movementId: string };
        };
        const b4B01 = await createB4(b01, 'B01', '500', 2);
        const b4B02 = await createB4(b02, 'B02', '600', 3);

        await request(app)
          .get(`/balance-movements/${b4B01.movementId}/excess-release-context`)
          .expect(200)
          .expect({
            sourceMovementId: null,
            thisExcessAmountOwner: '0',
            ownerCurrency: 'USD',
            requiresApplicantWaiver: false,
            requiresExportAuthorization: false,
          });
        await request(app)
          .get(`/balance-movements/${b4B02.movementId}/excess-release-context`)
          .expect(200)
          .expect({
            sourceMovementId: b02.movementId,
            thisExcessAmountOwner: '100',
            ownerCurrency: 'USD',
            requiresApplicantWaiver: false,
            requiresExportAuthorization: true,
          });
      } finally {
        db.close();
      }
    });
  }

  if (functionCode === 'A8') {
    test('covered-only A8 approval initializes full Eligible SG Capacity without an Excess ledger dependency', async () => {
      const db = createDb(':memory:');
      try {
        const parent = seedReleasedRoot(db, parentType, `${naturalKey.lcNumber}-COVERED`);
        const service = new BalanceService(db, () => decisionTime, undefined, runtime({ ok: false, code: 'FX_RATE_UNAVAILABLE' }, '30', '1000', ownerType));
        const app = createApp(db, service);
        const maker = await request(app)
          .post('/balance-movements')
          .set('Idempotency-Key', 'api-A8-covered-capacity-maker')
          .send({ ...childRequest(parent.logicalContractId, '80'), naturalKey: { ...naturalKey, lcNumber: `${naturalKey.lcNumber}-COVERED` } })
          .expect(201);

        await request(app).post(`/balance-movements/${maker.body.movementId}/release`).send({ releasedBy: 'checker-1' }).expect(200);

        expect(tableCount(db, 'excess_ledger_events')).toBe(0);
        expect(db.prepare('SELECT event_type, capacity_amount, covered_amount, excess_amount FROM sg_capacity_events').all()).toEqual([
          { event_type: 'INITIALIZE', capacity_amount: '80', covered_amount: '80', excess_amount: '0' },
        ]);
        expect(db.prepare('SELECT balance_after FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual({
          balance_after: '80',
        });
      } finally {
        db.close();
      }
    });
  }

  test('Checker over-limit denial retains the own movement and pending reservation', async () => {
    const db = createDb(':memory:');
    try {
      const parent = seedReleasedRoot(db, parentType, `${naturalKey.lcNumber}-CHECKER-LIMIT`);
      let activeAllowance = '30';
      const service = new BalanceService(db, () => decisionTime, undefined, {
        policy: { resolve: () => ({ ...policy, ownerType, allowancePercentage: activeAllowance }) },
        fx: { resolveConfiguredMaximum: async ({ request }) => ({ ok: true, quote: quote(request) }) },
      });
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', `api-${functionCode}-checker-limit-maker`)
        .send({ ...childRequest(parent.logicalContractId), naturalKey: { ...naturalKey, lcNumber: `${naturalKey.lcNumber}-CHECKER-LIMIT` } })
        .expect(201);
      activeAllowance = '10';

      const response = await request(app)
        .post(`/balance-movements/${maker.body.movementId}/release`)
        .set('Idempotency-Key', `api-${functionCode}-checker-limit`)
        .send({ releasedBy: 'checker-1' })
        .expect(409);

      expect(response.body).toEqual({ code: 'EXCESS_LIMIT_EXCEEDED' });
      expect(db.prepare('SELECT status FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual({ status: 'PENDING' });
      expect(db.prepare('SELECT event_type, allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ?').all(maker.body.movementId)).toEqual([
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '20' },
      ]);
    } finally {
      db.close();
    }
  });

  test('Checker capacity improvement fully releases the Maker reservation and approves only the fresh zero Excess', async () => {
    const db = createDb(':memory:');
    try {
      const parent = seedReleasedRoot(db, parentType, `${naturalKey.lcNumber}-IMPROVED`);
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }, '30', '1000', ownerType),
      );
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', `api-${functionCode}-improved-maker`)
        .send({ ...childRequest(parent.logicalContractId), naturalKey: { ...naturalKey, lcNumber: `${naturalKey.lcNumber}-IMPROVED` } })
        .expect(201);
      // Represent an A2/B2 Increase that was already approved after Maker Submit.
      // Inserting the released historical fact directly keeps this test focused on
      // Checker revaluation/conversion instead of the separate amendment workflow.
      db.prepare(
        `INSERT INTO balance_movements (
          movement_id, balance_contract_id, event_seq, movement_type, exposure_nature,
          amount, ceiling_amount, currency, status, created_by, released_by, created_at, released_at
        )
        SELECT ?, balance_contract_id, 2, 'AMEND_INCREASE', exposure_nature,
          '20', '20', currency, 'RELEASED', 'increase-maker', 'increase-checker', ?, ?
        FROM balance_movements
        WHERE balance_contract_id = ? AND movement_type = 'ISSUE'`,
      ).run(`${functionCode}-released-increase`, decisionTime, decisionTime, parent.balanceContractId);

      const response = await request(app)
        .post(`/balance-movements/${maker.body.movementId}/release`)
        .set('Idempotency-Key', `api-${functionCode}-improved-checker`)
        .send({ releasedBy: 'checker-1' })
        .expect(200);

      expect(response.body).toMatchObject({ excessDecision: 'NOT_REQUIRED', movement: { status: 'RELEASED' } });
      expect(
        db.prepare('SELECT event_type, allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ? ORDER BY rowid').all(maker.body.movementId),
      ).toEqual([
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '20' },
        { event_type: 'RESERVATION_RELEASE', allowance_amount_owner: '20' },
        { event_type: 'APPROVED_UTILIZATION', allowance_amount_owner: '0' },
      ]);
    } finally {
      db.close();
    }
  });

  test('late own-Release failure rolls back conversion snapshots and movement status', async () => {
    const db = createDb(':memory:');
    try {
      const parent = seedReleasedRoot(db, parentType, `${naturalKey.lcNumber}-ROLLBACK`);
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }, '30', '1000', ownerType),
      );
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', `api-${functionCode}-rollback-maker`)
        .send({ ...childRequest(parent.logicalContractId), naturalKey: { ...naturalKey, lcNumber: `${naturalKey.lcNumber}-ROLLBACK` } })
        .expect(201);
      db.exec(`
        CREATE TRIGGER fail_own_release BEFORE UPDATE OF status ON balance_movements
        WHEN OLD.movement_id = '${maker.body.movementId}' AND NEW.status = 'RELEASED'
        BEGIN SELECT RAISE(ABORT, 'injected own Release failure'); END;
      `);

      await request(app)
        .post(`/balance-movements/${maker.body.movementId}/release`)
        .set('Idempotency-Key', `api-${functionCode}-rollback-checker`)
        .send({ releasedBy: 'checker-1' })
        .expect(500);

      expect(db.prepare('SELECT status FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual({ status: 'PENDING' });
      expect(tableCount(db, 'excess_ledger_events')).toBe(1);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(1);
      expect(tableCount(db, 'excess_decision_snapshots')).toBe(1);
    } finally {
      db.close();
    }
  });

  test('returns EXCESS_LIMIT_EXCEEDED with no child contract, movement or Excess write', async () => {
    const db = createDb(':memory:');
    try {
      const parent = seedReleasedRoot(db, parentType, `${naturalKey.lcNumber}-LIMIT`);
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }, '10', '1000', ownerType),
      );
      const beforeContracts = tableCount(db, 'balance_contracts');
      const beforeMovements = tableCount(db, 'balance_movements');

      const response = await request(createApp(db, service))
        .post('/balance-movements')
        .set('Idempotency-Key', `api-${functionCode}-limit`)
        .send({ ...childRequest(parent.logicalContractId), naturalKey: { ...naturalKey, lcNumber: `${naturalKey.lcNumber}-LIMIT` } })
        .expect(409);

      expect(response.body).toMatchObject({
        code: 'EXCESS_LIMIT_EXCEEDED',
        guidance: {
          outcome: 'FINITE',
          minimumRequiredIncreaseOwner: '9.09',
          snapshotTime: expect.any(String),
          evidence: expect.objectContaining({ approvedContractualMaximumOwner: '100', proposedExcessOwner: '20' }),
        },
      });
      expect(tableCount(db, 'balance_contracts')).toBe(beforeContracts);
      expect(tableCount(db, 'balance_movements')).toBe(beforeMovements);
      for (const table of ['excess_accounts', 'excess_ledger_events', 'fx_rate_snapshots', 'excess_decision_snapshots', 'command_idempotency']) {
        expect(tableCount(db, table)).toBe(0);
      }
    } finally {
      db.close();
    }
  });

  test('fresh Submit reads only Checker-released A2/B2 Increase: pending is ignored, partial remains zero-write, sufficient succeeds', async () => {
    const db = createDb(':memory:');
    try {
      const lcNumber = `${naturalKey.lcNumber}-FORMAL-INCREASE`;
      const parent = seedReleasedRoot(db, parentType, lcNumber);
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }, '10', '1000', ownerType),
      );
      const app = createApp(db, service);
      const submit = (key: string) =>
        request(app)
          .post('/balance-movements')
          .set('Idempotency-Key', key)
          .send({ ...childRequest(parent.logicalContractId), naturalKey: { ...naturalKey, lcNumber } });
      const amendmentType = 'AMEND';
      const createIncrease = (eventSeq: number, amount: string, reference: string) =>
        request(app)
          .post('/balance-movements')
          .send({
            instrumentType: parentType,
            balanceContractId: parent.balanceContractId,
            movementType: amendmentType,
            eventSeq,
            amount,
            currency: 'USD',
            sourceTransactionRef: reference,
            createdBy: `${functionCode}-increase-maker`,
          });

      const beforeInitial = tableCount(db, 'balance_movements');
      const initial = await submit(`api-${functionCode}-formal-initial`).expect(409);
      expect(initial.body).toMatchObject({ code: 'EXCESS_LIMIT_EXCEEDED', guidance: { minimumRequiredIncreaseOwner: '9.09' } });
      expect(tableCount(db, 'balance_movements')).toBe(beforeInitial);

      const partial = await createIncrease(2, '5', `${functionCode}-PARTIAL`).expect(201);
      const whilePending = await submit(`api-${functionCode}-formal-pending`).expect(409);
      expect(whilePending.body).toMatchObject({ code: 'EXCESS_LIMIT_EXCEEDED', guidance: { minimumRequiredIncreaseOwner: '9.09' } });
      expect(tableCount(db, 'balance_movements')).toBe(beforeInitial + 1);

      await request(app)
        .post(`/balance-movements/${partial.body.movementId}/release`)
        .send({ releasedBy: `${functionCode}-increase-checker` })
        .expect(200);
      const afterPartialRelease = tableCount(db, 'balance_movements');
      const stillInsufficient = await submit(`api-${functionCode}-formal-partial`).expect(409);
      expect(stillInsufficient.body).toMatchObject({ code: 'EXCESS_LIMIT_EXCEEDED', guidance: { minimumRequiredIncreaseOwner: '4.09' } });
      expect(tableCount(db, 'balance_movements')).toBe(afterPartialRelease);

      const sufficient = await createIncrease(3, '5', `${functionCode}-SUFFICIENT`).expect(201);
      await request(app)
        .post(`/balance-movements/${sufficient.body.movementId}/release`)
        .send({ releasedBy: `${functionCode}-increase-checker` })
        .expect(200);
      const accepted = await submit(`api-${functionCode}-formal-sufficient`).expect(201);
      expect(accepted.body).toMatchObject({ workflowStatus: 'PENDING', coveredAmountOwner: '110', excessAmountOwner: '10' });

      expect(
        db.prepare("SELECT event_type FROM excess_ledger_events WHERE event_type IN ('FORMAL_INCREASE_REGULARIZATION', 'ALLOCATION', 'CURE')").all(),
      ).toEqual([]);
      expect(
        db
          .prepare('SELECT movement_type, amount, status FROM balance_movements WHERE balance_contract_id = ? ORDER BY event_seq')
          .all(parent.balanceContractId),
      ).toEqual([
        { movement_type: 'ISSUE', amount: '100', status: 'RELEASED' },
        { movement_type: amendmentType, amount: '5', status: 'RELEASED' },
        { movement_type: amendmentType, amount: '5', status: 'RELEASED' },
      ]);
    } finally {
      db.close();
    }
  });

  test('a historical Checker-released A2/B2 Increase leaves existing Approved Excess immutable and creates no cure/allocation facts', async () => {
    const db = createDb(':memory:');
    try {
      const lcNumber = `${naturalKey.lcNumber}-APPROVED-IMMUTABLE`;
      const parent = seedReleasedRoot(db, parentType, lcNumber);
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime({ ok: true, quote: quote({} as CurrencyExchangeRequest) }, '30', '1000', ownerType),
      );
      const app = createApp(db, service);
      const accepted = await request(app)
        .post('/balance-movements')
        .set('Idempotency-Key', `api-${functionCode}-approved-before-increase`)
        .send({ ...childRequest(parent.logicalContractId), naturalKey: { ...naturalKey, lcNumber } })
        .expect(201);
      await request(app)
        .post(`/balance-movements/${accepted.body.movementId}/release`)
        .set('Idempotency-Key', `api-${functionCode}-approved-release`)
        .send({ releasedBy: `${functionCode}-approved-checker` })
        .expect(200);
      const approvedBefore = db
        .prepare(
          "SELECT event_type, movement_id, excess_amount_owner, allowance_amount_owner FROM excess_ledger_events WHERE event_type = 'APPROVED_UTILIZATION' ORDER BY rowid",
        )
        .all();
      const eventCountBefore = tableCount(db, 'excess_ledger_events');

      // The active Excess service only reads the released A2/B2 fact; it owns no
      // cure/allocation hook. Insert that already-Checker-released legacy fact
      // directly so this assertion does not reinterpret the unchanged A2/B2 API.
      db.prepare(
        `INSERT INTO balance_movements (
          movement_id, balance_contract_id, event_seq, movement_type, exposure_nature,
          amount, ceiling_amount, currency, status, created_by, released_by, created_at, released_at
        )
        SELECT ?, balance_contract_id, 2, ?, exposure_nature,
          '30', '30', currency, 'RELEASED', ?, ?, ?, ?
        FROM balance_movements
        WHERE balance_contract_id = ? AND movement_type = 'ISSUE'`,
      ).run(
        `${functionCode}-historical-released-increase`,
        'AMEND',
        `${functionCode}-increase-maker`,
        `${functionCode}-increase-checker`,
        decisionTime,
        decisionTime,
        parent.balanceContractId,
      );

      expect(
        db
          .prepare(
            "SELECT event_type, movement_id, excess_amount_owner, allowance_amount_owner FROM excess_ledger_events WHERE event_type = 'APPROVED_UTILIZATION' ORDER BY rowid",
          )
          .all(),
      ).toEqual(approvedBefore);
      expect(tableCount(db, 'excess_ledger_events')).toBe(eventCountBefore);
      expect(approvedBefore).toEqual([
        { event_type: 'APPROVED_UTILIZATION', movement_id: accepted.body.movementId, excess_amount_owner: '20', allowance_amount_owner: '20' },
      ]);
    } finally {
      db.close();
    }
  });
});

describe('HTTP A3S compound Maker Excess submit', () => {
  function setup(db: Db, allowancePercentage: string) {
    let activeAllowancePercentage = allowancePercentage;
    const lc = seedReleasedRoot(db, 'IPLC_LC', `HTTP-A3S-${allowancePercentage}`);
    const base = new BalanceService(db, () => decisionTime);
    const sgIssue = base.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: lc.naturalKey.lcNumber, sgNumber: 'SG-1' },
      parentLogicalContractId: lc.logicalContractId,
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '20',
      currency: 'USD',
      createdBy: 'sg-maker',
    });
    if (!sgIssue.created) throw new Error('expected SG issue');
    base.release(sgIssue.movement.movementId, 'sg-checker');
    const fxResolve = jest.fn(async ({ request }: { request: CurrencyExchangeRequest }) => ({ ok: true as const, quote: quote(request) }));
    const service = new BalanceService(db, () => decisionTime, undefined, {
      policy: { resolve: () => ({ ...policy, allowancePercentage: activeAllowancePercentage }) },
      fx: { resolveConfiguredMaximum: fxResolve },
    });
    const businessEventId = `A3S-${allowancePercentage}`;
    return {
      service,
      lc,
      fxResolve,
      setAllowancePercentage: (value: string) => {
        activeAllowancePercentage = value;
      },
      requests: [
        {
          instrumentType: 'SHGT',
          balanceContractId: sgIssue.movement.balanceContractId,
          movementType: 'FULL_REDEEM',
          eventSeq: 2,
          amount: '20',
          currency: 'USD',
          businessEventId,
          sourceTransactionRef: 'A3S-DOC',
          createdBy: 'maker-1',
        },
        {
          instrumentType: 'IPLC_LC',
          balanceContractId: lc.balanceContractId,
          movementType: 'UTILIZE',
          eventSeq: 2,
          amount: '120',
          currency: 'USD',
          businessEventId,
          sourceTransactionRef: 'A3S-DOC',
          createdBy: 'maker-1',
        },
      ],
    };
  }

  test('preserves the movement-array response and atomically reserves eligible Excess', async () => {
    const db = createDb(':memory:');
    try {
      const { service, requests } = setup(db, '30');
      const beforeMovements = tableCount(db, 'balance_movements');
      const response = await request(createApp(db, service))
        .post('/balance-movements/compound')
        .set('Idempotency-Key', 'api-A3S-success')
        .send({ requests })
        .expect(201);

      expect(response.body).toHaveLength(2);
      expect(response.body.map((movement: { movementType: string }) => movement.movementType)).toEqual(['FULL_REDEEM', 'UTILIZE']);
      expect(tableCount(db, 'balance_movements')).toBe(beforeMovements + 2);
      expect(tableCount(db, 'excess_ledger_events')).toBe(1);
      expect(db.prepare("SELECT excess_amount_owner FROM excess_ledger_events WHERE event_type = 'PENDING_RESERVATION'").get()).toEqual({
        excess_amount_owner: '20',
      });
      expect(tableCount(db, 'sg_capacity_events')).toBe(0);
      const arrival = response.body.find((movement: { movementType: string }) => movement.movementType === 'UTILIZE');
      expect(arrival).toMatchObject({ amount: '120', ceilingAmount: '100' });
      expect(service.getBalanceSnapshot(arrival.balanceContractId).tightAvailableBalance).toBe('0');
    } finally {
      db.close();
    }
  });

  test('BD-03 routes over-capacity A3S through legacy sufficiency with zero FX and zero compound writes', async () => {
    const db = createDb(':memory:');
    try {
      const { service, requests, fxResolve } = setup(db, '0');
      const beforeMovements = tableCount(db, 'balance_movements');

      const response = await request(createApp(db, service))
        .post('/balance-movements/compound')
        .set('Idempotency-Key', 'api-A3S-bd03-insufficient')
        .send({ requests })
        .expect(409);

      expect(response.body).toEqual({
        code: 'INSUFFICIENT_AVAILABLE_BALANCE',
        message: 'Requested amount 120 exceeds Available Balance 100.',
      });
      expect(fxResolve).not.toHaveBeenCalled();
      expect(tableCount(db, 'balance_movements')).toBe(beforeMovements);
      expect(tableCount(db, 'excess_ledger_events')).toBe(0);
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('returns Eligible SG re-selection guidance first and only returns Minimum Required Increase after a better SG is selected but remains insufficient', async () => {
    const db = createDb(':memory:');
    try {
      const { service, lc, requests, fxResolve } = setup(db, '10');
      const alternativeIssue = service.createMovement({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: lc.naturalKey.lcNumber, sgNumber: 'SG-2' },
        parentLogicalContractId: lc.logicalContractId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '30',
        currency: 'USD',
        createdBy: 'sg-2-maker',
      });
      if (!alternativeIssue.created) throw new Error('expected alternative SG issue');
      service.release(alternativeIssue.movement.movementId, 'sg-2-checker');
      const app = createApp(db, service);
      const beforeFirstSubmit = tableCount(db, 'balance_movements');

      const reselect = await request(app).post('/balance-movements/compound').set('Idempotency-Key', 'api-A3S-reselect-first').send({ requests }).expect(409);

      expect(reselect.body).toEqual({
        code: 'A3S_RESELECT_ELIGIBLE_SG',
        eligibleAlternatives: [
          {
            balanceContractId: alternativeIssue.movement.balanceContractId,
            sgNumber: 'SG-2',
            currency: 'USD',
            eligibleCapacityOwner: '30',
          },
        ],
      });
      expect(reselect.body.guidance).toBeUndefined();
      expect(fxResolve).not.toHaveBeenCalled();
      expect(tableCount(db, 'balance_movements')).toBe(beforeFirstSubmit);

      const reselectedBusinessEventId = 'A3S-10-RESELECTED';
      const reselectedRequests = [
        {
          ...requests[0],
          balanceContractId: alternativeIssue.movement.balanceContractId,
          amount: '30',
          businessEventId: reselectedBusinessEventId,
        },
        { ...requests[1], businessEventId: reselectedBusinessEventId },
      ];
      const stillInsufficient = await request(app)
        .post('/balance-movements/compound')
        .set('Idempotency-Key', 'api-A3S-reselect-formal')
        .send({ requests: reselectedRequests })
        .expect(409);

      expect(stillInsufficient.body).toMatchObject({
        code: 'EXCESS_LIMIT_EXCEEDED',
        guidance: { outcome: 'FINITE', minimumRequiredIncreaseOwner: '27.27' },
      });
      expect(fxResolve).not.toHaveBeenCalled();
      expect(tableCount(db, 'balance_movements')).toBe(beforeFirstSubmit);
    } finally {
      db.close();
    }
  });

  test('pre-Acknowledge A3S Fix Pending replaces both the LC amount and Excess reservation atomically', async () => {
    const db = createDb(':memory:');
    try {
      const { service, requests } = setup(db, '30');
      const app = createApp(db, service);
      const maker = await request(app).post('/balance-movements/compound').set('Idempotency-Key', 'api-A3S-fix-maker').send({ requests }).expect(201);
      const lcMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'UTILIZE');
      const sgMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'FULL_REDEEM');

      const response = await request(app)
        .post(`/balance-movements/${lcMovement.movementId}/edit`)
        .set('Idempotency-Key', 'api-A3S-fix')
        .send({ amount: '125', editedBy: 'maker-2' })
        .expect(200);

      expect(response.body).toMatchObject({ movementId: lcMovement.movementId, amount: '125', status: 'PENDING' });
      expect(db.prepare('SELECT amount, status FROM balance_movements WHERE movement_id = ?').get(sgMovement.movementId)).toEqual({
        amount: '20',
        status: 'PENDING',
      });
      expect(
        db.prepare('SELECT event_type, allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ? ORDER BY rowid').all(lcMovement.movementId),
      ).toEqual([
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '20' },
        { event_type: 'RESERVATION_RELEASE', allowance_amount_owner: '20' },
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '25' },
      ]);
    } finally {
      db.close();
    }
  });

  test('A3S Checker Acknowledge atomically releases the linked SG once and replays the same key without new facts', async () => {
    const db = createDb(':memory:');
    try {
      const { service, requests } = setup(db, '30');
      const app = createApp(db, service);
      const maker = await request(app).post('/balance-movements/compound').set('Idempotency-Key', 'api-A3S-ack-maker').send({ requests }).expect(201);
      const lcMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'UTILIZE');
      const sgMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'FULL_REDEEM');

      const first = await request(app)
        .post(`/balance-movements/${lcMovement.movementId}/acknowledge`)
        .set('Idempotency-Key', 'api-A3S-ack-checker')
        .send({ acknowledgedBy: 'checker-A3S' })
        .expect(200);
      const countsAfterFirst = {
        ledger: tableCount(db, 'excess_ledger_events'),
        fx: tableCount(db, 'fx_rate_snapshots'),
        decisions: tableCount(db, 'excess_decision_snapshots'),
      };

      expect(first.body).toMatchObject({ movement: { movementId: lcMovement.movementId, status: 'PENDING', acknowledgedBy: 'checker-A3S' } });
      expect(db.prepare('SELECT status FROM balance_movements WHERE movement_id = ?').get(sgMovement.movementId)).toEqual({ status: 'RELEASED' });
      expect(countsAfterFirst).toEqual({ ledger: 1, fx: 2, decisions: 2 });
      expect(tableCount(db, 'sg_capacity_events')).toBe(0);

      const replay = await request(app)
        .post(`/balance-movements/${lcMovement.movementId}/acknowledge`)
        .set('Idempotency-Key', 'api-A3S-ack-checker')
        .send({ acknowledgedBy: 'checker-A3S' })
        .expect(200);
      expect(replay.body).toEqual(first.body);
      expect({
        ledger: tableCount(db, 'excess_ledger_events'),
        fx: tableCount(db, 'fx_rate_snapshots'),
        decisions: tableCount(db, 'excess_decision_snapshots'),
        sgCapacity: tableCount(db, 'sg_capacity_events'),
      }).toEqual({ ...countsAfterFirst, sgCapacity: 0 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM balance_movements WHERE movement_id = ? AND status = ?').get(sgMovement.movementId, 'RELEASED')).toEqual(
        {
          count: 1,
        },
      );
    } finally {
      db.close();
    }
  });

  test('covered-only legacy A3S Acknowledge still releases the linked SG and redeems capacity exactly once without Excess facts', async () => {
    const db = createDb(':memory:');
    try {
      const { service, requests } = setup(db, '30');
      const coveredRequests = requests.map((movement) => (movement.instrumentType === 'IPLC_LC' ? { ...movement, amount: '100' } : movement));
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements/compound')
        .set('Idempotency-Key', 'api-A3S-covered-maker')
        .send({ requests: coveredRequests })
        .expect(201);
      const lcMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'UTILIZE');
      const sgMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'FULL_REDEEM');

      const first = await request(app)
        .post(`/balance-movements/${lcMovement.movementId}/acknowledge`)
        .set('Idempotency-Key', 'api-A3S-covered-checker')
        .send({ acknowledgedBy: 'checker-A3S-covered' })
        .expect(200);

      expect(first.body).toMatchObject({ movementId: lcMovement.movementId, status: 'PENDING', acknowledgedBy: 'checker-A3S-covered' });
      expect(db.prepare('SELECT status FROM balance_movements WHERE movement_id = ?').get(sgMovement.movementId)).toEqual({ status: 'RELEASED' });
      expect(tableCount(db, 'sg_capacity_events')).toBe(0);
      for (const table of ['excess_accounts', 'excess_ledger_events', 'fx_rate_snapshots', 'excess_decision_snapshots']) {
        expect(tableCount(db, table)).toBe(0);
      }

      const replay = await request(app)
        .post(`/balance-movements/${lcMovement.movementId}/acknowledge`)
        .set('Idempotency-Key', 'api-A3S-covered-checker')
        .send({ acknowledgedBy: 'checker-A3S-covered' })
        .expect(200);
      expect(replay.body).toEqual(first.body);
      expect(tableCount(db, 'sg_capacity_events')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('covered-only legacy A3S Acknowledge rolls back both legs and capacity when idempotency persistence fails late', async () => {
    const db = createDb(':memory:');
    try {
      const { service, requests } = setup(db, '30');
      const coveredRequests = requests.map((movement) => (movement.instrumentType === 'IPLC_LC' ? { ...movement, amount: '100' } : movement));
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements/compound')
        .set('Idempotency-Key', 'api-A3S-covered-rollback-maker')
        .send({ requests: coveredRequests })
        .expect(201);
      const lcMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'UTILIZE');
      const sgMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'FULL_REDEEM');
      const before = {
        lc: db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(lcMovement.movementId),
        sg: db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(sgMovement.movementId),
        capacity: db.prepare('SELECT * FROM sg_capacity_events ORDER BY rowid').all(),
      };
      db.exec(`CREATE TRIGGER fail_covered_a3s_ack_idempotency BEFORE INSERT ON command_idempotency
               WHEN NEW.command_type = 'CHECKER_ACKNOWLEDGE' BEGIN SELECT RAISE(ABORT, 'late covered A3S acknowledge failure'); END;`);

      await request(app)
        .post(`/balance-movements/${lcMovement.movementId}/acknowledge`)
        .set('Idempotency-Key', 'api-A3S-covered-rollback-checker')
        .send({ acknowledgedBy: 'checker-A3S-covered' })
        .expect(500);

      expect(db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(lcMovement.movementId)).toEqual(before.lc);
      expect(db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(sgMovement.movementId)).toEqual(before.sg);
      expect(db.prepare('SELECT * FROM sg_capacity_events ORDER BY rowid').all()).toEqual(before.capacity);
      expect(db.prepare("SELECT COUNT(*) AS count FROM command_idempotency WHERE command_type = 'CHECKER_ACKNOWLEDGE'").get()).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });

  test('post-Acknowledge A3S Reject retains reservation and SG facts, then whole Delete releases only Pending Excess', async () => {
    const db = createDb(':memory:');
    try {
      const { service, requests } = setup(db, '30');
      const app = createApp(db, service);
      const maker = await request(app).post('/balance-movements/compound').set('Idempotency-Key', 'api-A3S-delete-maker').send({ requests }).expect(201);
      const lcMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'UTILIZE');
      const sgMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'FULL_REDEEM');
      await request(app)
        .post(`/balance-movements/${lcMovement.movementId}/acknowledge`)
        .set('Idempotency-Key', 'api-A3S-delete-ack')
        .send({ acknowledgedBy: 'checker-A3S' })
        .expect(200);
      const committedSg = db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(sgMovement.movementId);
      const committedCapacity = db.prepare('SELECT * FROM sg_capacity_events ORDER BY rowid').all();

      await request(app)
        .post(`/balance-movements/${lcMovement.movementId}/reject`)
        .send({ releasedBy: 'checker-A3S-reject', reasonCode: 'A4_REJECTED', remarks: 'final decision rejected' })
        .expect(200);
      expect(service.hasExcessReservation(lcMovement.movementId)).toBe(true);
      expect(db.prepare('SELECT status, reason_code FROM balance_movements WHERE movement_id = ?').get(lcMovement.movementId)).toEqual({
        status: 'REJECTED',
        reason_code: 'A4_REJECTED',
      });
      expect(db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(sgMovement.movementId)).toEqual(committedSg);
      expect(db.prepare('SELECT * FROM sg_capacity_events ORDER BY rowid').all()).toEqual(committedCapacity);

      await request(app)
        .post(`/balance-movements/${lcMovement.movementId}/cancel`)
        .set('Idempotency-Key', 'api-A3S-delete')
        .send({ cancelledBy: 'maker-1', reasonCode: 'DELETE_PENDING' })
        .expect(200);

      expect(db.prepare('SELECT status, acknowledged_at FROM balance_movements WHERE movement_id = ?').get(lcMovement.movementId)).toEqual({
        status: 'CANCELLED',
        acknowledged_at: decisionTime,
      });
      expect(service.hasExcessReservation(lcMovement.movementId)).toBe(false);
      expect(
        db.prepare('SELECT event_type, allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ? ORDER BY rowid').all(lcMovement.movementId),
      ).toEqual([
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '20' },
        { event_type: 'RESERVATION_RELEASE', allowance_amount_owner: '20' },
      ]);
      expect(db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(sgMovement.movementId)).toEqual(committedSg);
      expect(db.prepare('SELECT * FROM sg_capacity_events ORDER BY rowid').all()).toEqual(committedCapacity);
      expect(db.prepare('SELECT status_before FROM delete_pending_audit WHERE movement_id = ?').get(lcMovement.movementId)).toEqual({
        status_before: 'REJECTED',
      });
      expect(db.prepare("SELECT COUNT(*) AS count FROM excess_ledger_events WHERE event_type = 'APPROVED_UTILIZATION'").get()).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });

  test('pre-Acknowledge A3S whole Delete atomically cancels both compound legs and reverses the capacity reservation', async () => {
    const db = createDb(':memory:');
    try {
      const { service, requests } = setup(db, '30');
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements/compound')
        .set('Idempotency-Key', 'api-A3S-pre-ack-delete-maker')
        .send({ requests })
        .expect(201);
      const lcMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'UTILIZE');
      const sgMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'FULL_REDEEM');

      expect(tableCount(db, 'sg_capacity_events')).toBe(0);

      await request(app)
        .post(`/balance-movements/${lcMovement.movementId}/cancel`)
        .set('Idempotency-Key', 'api-A3S-pre-ack-delete')
        .send({ cancelledBy: 'maker-1', reasonCode: 'DELETE_PENDING' })
        .expect(200);

      expect(
        db.prepare('SELECT status FROM balance_movements WHERE movement_id IN (?, ?) ORDER BY movement_type').all(lcMovement.movementId, sgMovement.movementId),
      ).toEqual([{ status: 'CANCELLED' }, { status: 'CANCELLED' }]);
      expect(service.hasExcessReservation(lcMovement.movementId)).toBe(false);
      expect(tableCount(db, 'sg_capacity_events')).toBe(0);
      expect(tableCount(db, 'sg_capacity_events')).toBe(0);
      expect(db.prepare('SELECT COUNT(*) AS count FROM delete_pending_audit WHERE movement_id = ?').get(lcMovement.movementId)).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  test('pre-Acknowledge rejected A3S whole Delete still cancels both compound legs and reverses capacity', async () => {
    const db = createDb(':memory:');
    try {
      const { service, requests } = setup(db, '30');
      const app = createApp(db, service);
      const maker = await request(app)
        .post('/balance-movements/compound')
        .set('Idempotency-Key', 'api-A3S-rejected-delete-maker')
        .send({ requests })
        .expect(201);
      const lcMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'UTILIZE');
      const sgMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'FULL_REDEEM');
      await request(app).post(`/balance-movements/${lcMovement.movementId}/reject`).send({ releasedBy: 'checker-1', reasonCode: 'DOCS_REJECTED' }).expect(200);

      await request(app)
        .post(`/balance-movements/${lcMovement.movementId}/cancel`)
        .set('Idempotency-Key', 'api-A3S-rejected-delete')
        .send({ cancelledBy: 'maker-1', reasonCode: 'DELETE_PENDING' })
        .expect(200);

      expect(
        db
          .prepare('SELECT movement_id, status FROM balance_movements WHERE movement_id IN (?, ?) ORDER BY movement_id')
          .all(lcMovement.movementId, sgMovement.movementId),
      ).toEqual(
        expect.arrayContaining([
          { movement_id: lcMovement.movementId, status: 'CANCELLED' },
          { movement_id: sgMovement.movementId, status: 'CANCELLED' },
        ]),
      );
      expect(tableCount(db, 'sg_capacity_events')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('pre-Acknowledge A3S Delete ignores a colliding businessEventId owned by another Import LC', async () => {
    const db = createDb(':memory:');
    try {
      const { service, requests } = setup(db, '30');
      const app = createApp(db, service);
      const maker = await request(app).post('/balance-movements/compound').set('Idempotency-Key', 'api-A3S-owner-delete-maker').send({ requests }).expect(201);
      const lcMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'UTILIZE');
      const ownSgMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'FULL_REDEEM');
      const otherLc = seedReleasedRoot(db, 'IPLC_LC', 'HTTP-A3S-DELETE-OTHER');
      const otherSgIssue = service.createMovement({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'HTTP-A3S-DELETE-OTHER', sgNumber: 'SG-OTHER' },
        parentLogicalContractId: otherLc.logicalContractId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '20',
        currency: 'USD',
        createdBy: 'other-maker',
      });
      if (!otherSgIssue.created) throw new Error('expected other SG issue');
      service.release(otherSgIssue.movement.movementId, 'other-checker');
      const otherRedemption = service.createMovement({
        instrumentType: 'SHGT',
        balanceContractId: otherSgIssue.movement.balanceContractId,
        movementType: 'FULL_REDEEM',
        eventSeq: 2,
        amount: '20',
        currency: 'USD',
        businessEventId: requests[0]!.businessEventId,
        createdBy: 'other-maker',
      });
      if (!otherRedemption.created) throw new Error('expected other SG redemption');

      await request(app)
        .post(`/balance-movements/${lcMovement.movementId}/cancel`)
        .set('Idempotency-Key', 'api-A3S-owner-delete')
        .send({ cancelledBy: 'maker-1', reasonCode: 'DELETE_PENDING' })
        .expect(200);

      expect(db.prepare('SELECT status FROM balance_movements WHERE movement_id = ?').get(ownSgMovement.movementId)).toEqual({ status: 'CANCELLED' });
      expect(db.prepare('SELECT status FROM balance_movements WHERE movement_id = ?').get(otherRedemption.movement.movementId)).toEqual({ status: 'PENDING' });
    } finally {
      db.close();
    }
  });

  test('pre-Acknowledge A3S Delete rolls back every compound mutation when idempotency persistence fails late', async () => {
    const db = createDb(':memory:');
    try {
      const { service, requests } = setup(db, '30');
      const app = createApp(db, service);
      const maker = await request(app).post('/balance-movements/compound').set('Idempotency-Key', 'api-A3S-late-failure-maker').send({ requests }).expect(201);
      const lcMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'UTILIZE');
      const sgMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'FULL_REDEEM');
      const before = {
        lc: db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(lcMovement.movementId),
        sg: db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(sgMovement.movementId),
        ledger: db.prepare('SELECT * FROM excess_ledger_events ORDER BY rowid').all(),
        capacity: db.prepare('SELECT * FROM sg_capacity_events ORDER BY rowid').all(),
      };
      db.exec(`CREATE TRIGGER fail_delete_idempotency BEFORE INSERT ON command_idempotency
               WHEN NEW.command_type = 'DELETE_PENDING' BEGIN SELECT RAISE(ABORT, 'late delete failure'); END;`);

      await request(app)
        .post(`/balance-movements/${lcMovement.movementId}/cancel`)
        .set('Idempotency-Key', 'api-A3S-late-failure-delete')
        .send({ cancelledBy: 'maker-1', reasonCode: 'DELETE_PENDING' })
        .expect(500);

      expect(db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(lcMovement.movementId)).toEqual(before.lc);
      expect(db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(sgMovement.movementId)).toEqual(before.sg);
      expect(db.prepare('SELECT * FROM excess_ledger_events ORDER BY rowid').all()).toEqual(before.ledger);
      expect(db.prepare('SELECT * FROM sg_capacity_events ORDER BY rowid').all()).toEqual(before.capacity);
      expect(tableCount(db, 'delete_pending_audit')).toBe(0);
      expect(db.prepare("SELECT COUNT(*) AS count FROM command_idempotency WHERE command_type = 'DELETE_PENDING'").get()).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });

  test('A3S final A4 Release converts Excess without repeating the linked SG redemption', async () => {
    const db = createDb(':memory:');
    try {
      const { service, requests } = setup(db, '30');
      const app = createApp(db, service);
      const maker = await request(app).post('/balance-movements/compound').set('Idempotency-Key', 'api-A3S-final-maker').send({ requests }).expect(201);
      const lcMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'UTILIZE');
      const sgMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'FULL_REDEEM');
      await request(app)
        .post(`/balance-movements/${lcMovement.movementId}/acknowledge`)
        .set('Idempotency-Key', 'api-A3S-final-ack')
        .send({ acknowledgedBy: 'checker-A3S' })
        .expect(200);
      const lockedLcSplit = db.prepare('SELECT amount, ceiling_amount FROM balance_movements WHERE movement_id = ?').get(lcMovement.movementId);
      const sgAfterAcknowledge = db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(sgMovement.movementId);
      const capacityAfterAcknowledge = db.prepare('SELECT * FROM sg_capacity_events ORDER BY rowid').all();

      // A released A2 increase now makes a fresh capacity calculation sufficient.
      // A4 must nevertheless finalise the Legal/Covered/Excess split locked at
      // A3S Acknowledge instead of recalculating Excess from the later capacity.
      db.prepare(
        `INSERT INTO balance_movements (
          movement_id, balance_contract_id, event_seq, movement_type, exposure_nature,
          amount, ceiling_amount, currency, status, created_by, released_by, created_at, released_at
        )
        SELECT ?, balance_contract_id, 3, 'AMEND_INCREASE', exposure_nature,
          '20', '20', currency, 'RELEASED', 'increase-maker', 'increase-checker', ?, ?
        FROM balance_movements
        WHERE balance_contract_id = ? AND movement_type = 'ISSUE'`,
      ).run('A3S-released-increase-after-ack', decisionTime, decisionTime, requests[1]!.balanceContractId);

      await request(app).post(`/balance-movements/${lcMovement.movementId}/maker-submit`).send({ makerSubmittedBy: 'a4-maker' }).expect(200);

      await request(app)
        .post(`/balance-movements/${lcMovement.movementId}/release`)
        .set('Idempotency-Key', 'api-A3S-final-release-absent')
        .send({ releasedBy: 'a4-checker' })
        .expect(200);

      expect(db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(sgMovement.movementId)).toEqual(sgAfterAcknowledge);
      expect(db.prepare('SELECT * FROM sg_capacity_events ORDER BY rowid').all()).toEqual(capacityAfterAcknowledge);
      expect(db.prepare('SELECT amount, ceiling_amount FROM balance_movements WHERE movement_id = ?').get(lcMovement.movementId)).toEqual(lockedLcSplit);
      expect(
        db.prepare('SELECT event_type, allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ? ORDER BY rowid').all(lcMovement.movementId),
      ).toEqual([
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '20' },
        { event_type: 'RESERVATION_RELEASE', allowance_amount_owner: '20' },
        { event_type: 'APPROVED_UTILIZATION', allowance_amount_owner: '20' },
      ]);
      expect(tableCount(db, 'applicant_waiver_snapshots')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('A3S Checker snapshot failure rolls back both linked SG release and LC Acknowledge', async () => {
    const db = createDb(':memory:');
    try {
      const { service, requests } = setup(db, '30');
      const app = createApp(db, service);
      const maker = await request(app).post('/balance-movements/compound').set('Idempotency-Key', 'api-A3S-rollback-maker').send({ requests }).expect(201);
      const lcMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'UTILIZE');
      const sgMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'FULL_REDEEM');
      db.exec(`
        CREATE TRIGGER fail_checker_fx_snapshot BEFORE INSERT ON fx_rate_snapshots
        WHEN NEW.decision_point = 'CHECKER_RELEASE'
        BEGIN SELECT RAISE(ABORT, 'injected Checker snapshot failure'); END;
      `);

      await request(app)
        .post(`/balance-movements/${lcMovement.movementId}/acknowledge`)
        .set('Idempotency-Key', 'api-A3S-rollback-checker')
        .send({ acknowledgedBy: 'checker-A3S' })
        .expect(500);

      expect(db.prepare('SELECT status FROM balance_movements WHERE movement_id = ?').get(sgMovement.movementId)).toEqual({ status: 'PENDING' });
      expect(db.prepare('SELECT status, acknowledged_at FROM balance_movements WHERE movement_id = ?').get(lcMovement.movementId)).toEqual({
        status: 'PENDING',
        acknowledged_at: null,
      });
      expect(tableCount(db, 'fx_rate_snapshots')).toBe(1);
      expect(tableCount(db, 'excess_decision_snapshots')).toBe(1);
      expect(tableCount(db, 'excess_ledger_events')).toBe(1);
      expect(tableCount(db, 'sg_capacity_events')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('A3S Checker over-limit denial retains both linked legs and the pending reservation', async () => {
    const db = createDb(':memory:');
    try {
      const { service, requests, setAllowancePercentage } = setup(db, '30');
      const app = createApp(db, service);
      const maker = await request(app).post('/balance-movements/compound').set('Idempotency-Key', 'api-A3S-blocked-maker').send({ requests }).expect(201);
      const lcMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'UTILIZE');
      const sgMovement = maker.body.find((movement: { movementType: string }) => movement.movementType === 'FULL_REDEEM');
      setAllowancePercentage('10');

      const response = await request(app)
        .post(`/balance-movements/${lcMovement.movementId}/acknowledge`)
        .set('Idempotency-Key', 'api-A3S-blocked-checker')
        .send({ acknowledgedBy: 'checker-A3S' })
        .expect(409);

      expect(response.body).toEqual({ code: 'EXCESS_LIMIT_EXCEEDED' });
      expect(db.prepare('SELECT status FROM balance_movements WHERE movement_id = ?').get(sgMovement.movementId)).toEqual({ status: 'PENDING' });
      expect(db.prepare('SELECT status, acknowledged_at FROM balance_movements WHERE movement_id = ?').get(lcMovement.movementId)).toEqual({
        status: 'PENDING',
        acknowledged_at: null,
      });
      expect(db.prepare('SELECT event_type, allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ?').all(lcMovement.movementId)).toEqual([
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '20' },
      ]);
    } finally {
      db.close();
    }
  });

  test('returns EXCESS_LIMIT_EXCEEDED and writes neither compound leg nor Excess facts', async () => {
    const db = createDb(':memory:');
    try {
      const { service, requests } = setup(db, '10');
      const beforeMovements = tableCount(db, 'balance_movements');
      const response = await request(createApp(db, service))
        .post('/balance-movements/compound')
        .set('Idempotency-Key', 'api-A3S-limit')
        .send({ requests })
        .expect(409);

      expect(response.body).toMatchObject({
        code: 'EXCESS_LIMIT_EXCEEDED',
        guidance: {
          outcome: 'FINITE',
          minimumRequiredIncreaseOwner: '9.09',
          snapshotTime: expect.any(String),
          evidence: expect.objectContaining({ approvedContractualMaximumOwner: '100', proposedExcessOwner: '20' }),
        },
      });
      expect(tableCount(db, 'balance_movements')).toBe(beforeMovements);
      for (const table of ['excess_accounts', 'excess_ledger_events', 'fx_rate_snapshots', 'excess_decision_snapshots', 'command_idempotency']) {
        expect(tableCount(db, table)).toBe(0);
      }
    } finally {
      db.close();
    }
  });

  test('rejects a Shipping Guarantee owned by another LC before policy, FX or writes', async () => {
    const db = createDb(':memory:');
    try {
      const ownerLc = seedReleasedRoot(db, 'IPLC_LC', 'HTTP-A3S-OWNER');
      const otherLc = seedReleasedRoot(db, 'IPLC_LC', 'HTTP-A3S-OTHER');
      const base = new BalanceService(db, () => decisionTime);
      const sgIssue = base.createMovement({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'HTTP-A3S-OTHER', sgNumber: 'SG-X' },
        parentLogicalContractId: otherLc.logicalContractId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '20',
        currency: 'USD',
        createdBy: 'sg-maker',
      });
      if (!sgIssue.created) throw new Error('expected other-owner SG');
      base.release(sgIssue.movement.movementId, 'sg-checker');
      const policyResolve = jest.fn(() => policy);
      const fxResolve = jest.fn<
        ReturnType<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>,
        Parameters<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>
      >();
      const service = new BalanceService(db, () => decisionTime, undefined, {
        policy: { resolve: policyResolve },
        fx: { resolveConfiguredMaximum: fxResolve },
      });
      const businessEventId = 'A3S-CROSS-LC';
      const beforeMovements = tableCount(db, 'balance_movements');
      const response = await request(createApp(db, service))
        .post('/balance-movements/compound')
        .set('Idempotency-Key', 'api-A3S-cross-lc')
        .send({
          requests: [
            {
              instrumentType: 'SHGT',
              balanceContractId: sgIssue.movement.balanceContractId,
              movementType: 'FULL_REDEEM',
              eventSeq: 2,
              amount: '20',
              currency: 'USD',
              businessEventId,
              sourceTransactionRef: 'CROSS-LC',
              createdBy: 'maker-1',
            },
            {
              instrumentType: 'IPLC_LC',
              balanceContractId: ownerLc.balanceContractId,
              movementType: 'UTILIZE',
              eventSeq: 2,
              amount: '120',
              currency: 'USD',
              businessEventId,
              sourceTransactionRef: 'CROSS-LC',
              createdBy: 'maker-1',
            },
          ],
        })
        .expect(400);

      expect(response.body.code).toBe('REQUEST_VALIDATION_FAILED');
      expect(response.body.message).toMatch(/same Import LC allowance owner/);
      expect(policyResolve).not.toHaveBeenCalled();
      expect(fxResolve).not.toHaveBeenCalled();
      expect(tableCount(db, 'balance_movements')).toBe(beforeMovements);
      expect(tableCount(db, 'excess_ledger_events')).toBe(0);
      expect(tableCount(db, 'command_idempotency')).toBe(0);
    } finally {
      db.close();
    }
  });
});
