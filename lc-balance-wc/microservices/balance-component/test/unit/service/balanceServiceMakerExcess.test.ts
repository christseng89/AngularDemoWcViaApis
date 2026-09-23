import { createDb, type Db } from '../../../src/db';
import { BalanceService, type BalanceMakerExcessRuntime, type CreateMovementRequest } from '../../../src/service/balanceService';
import type { ExcessPolicyConfig } from '../../../src/config/excessPolicyConfig';
import type { CurrencyExchangeQuote, CurrencyExchangeRequest } from '../../../src/integration/currencyExchange';

const decisionTime = '2026-09-22T00:00:00.000Z';

const policy: Readonly<ExcessPolicyConfig> = {
  policyVersion: 'policy-v1',
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

function providerQuote(request: CurrencyExchangeRequest): CurrencyExchangeQuote {
  return {
    fromCurrency: 'USD',
    toCurrency: 'EUR',
    requestedAmount: '1000',
    ratePurpose: 'BOOKING',
    bookingRate: '0.92',
    convertedAmount: '920',
    rateOrigin: 'PROVIDER_SUPPLIED',
    rateSource: 'PROVIDER',
    providerRateId: 'rate-1',
    providerRateVersion: 'opaque-v1',
    requestAttemptId: 'attempt-1',
    rateTimestamp: '2026-09-21T23:59:00.000Z',
    approvalStatus: 'APPROVED',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveTo: null,
    correlationId: request.correlationId,
    policyVersion: request.policyVersion,
  };
}

function seedReleasedEurLc(db: Db, lcNumber: string): { balanceContractId: string; logicalContractId: string } {
  const service = new BalanceService(db, () => decisionTime);
  const issue = service.createMovement({
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '100',
    currency: 'EUR',
    tenorType: 'SIGHT',
    expiryDate: '2099-12-31',
    createdBy: 'maker-issue',
  });
  if (!issue.created) throw new Error('expected a new LC issue');
  service.release(issue.movement.movementId, 'checker-issue');
  const contract = service.resolveContract('IPLC_LC', { lcNumber });
  if (!contract) throw new Error('expected released LC contract');
  return contract;
}

function a3Request(balanceContractId: string, sourceTransactionRef = 'DOC-1'): CreateMovementRequest {
  return {
    instrumentType: 'IPLC_LC',
    balanceContractId,
    movementType: 'UTILIZE',
    eventSeq: 2,
    amount: '120',
    currency: 'EUR',
    sourceTransactionRef,
    createdBy: 'maker-1',
  };
}

function runtime(resolveFx: BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']): BalanceMakerExcessRuntime {
  return {
    policy: { resolve: () => policy },
    fx: { resolveConfiguredMaximum: resolveFx },
  };
}

function control() {
  return { actorContext: 'maker-1', idempotencyKey: 'key-1', decisionTime };
}

function count(db: Db, table: string, where = ''): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get() as { count: number }).count;
}

describe('BalanceService A3 Maker Excess atomic boundary', () => {
  test.each([
    ['11200', true, '200'],
    ['11201', false, '201'],
  ] as const)(
    'uses original LC Amount for the 2%% allowance after 10%% tolerance: Arrival %s',
    async (arrivalAmount, allowed, expectedExcess) => {
      const db = createDb(':memory:');
      try {
        const base = new BalanceService(db, () => decisionTime);
        const issue = base.createMovement({
          instrumentType: 'IPLC_LC',
          naturalKey: { lcNumber: `LC-TOLERANCE-${arrivalAmount}` },
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '10000',
          tolerancePct: '10',
          currency: 'EUR',
          tenorType: 'SIGHT',
          expiryDate: '2099-12-31',
          createdBy: 'maker-issue',
        });
        if (!issue.created) throw new Error('expected LC issue');
        base.release(issue.movement.movementId, 'checker-issue');

        const service = new BalanceService(db, () => decisionTime, undefined, {
          policy: { resolve: () => ({ ...policy, allowancePercentage: '2' }) },
          fx: { resolveConfiguredMaximum: async ({ request }) => ({ ok: true, quote: providerQuote(request) }) },
        });
        const request = { ...a3Request(issue.movement.balanceContractId), amount: arrivalAmount };
        const result = await service.submitA3ExcessByMaker(request, control());

        if (allowed) {
          expect(result).toMatchObject({ httpStatus: 201, body: { coveredAmountOwner: '11000', excessAmountOwner: expectedExcess } });
          expect(db.prepare("SELECT amount, ceiling_amount FROM balance_movements WHERE movement_type = 'UTILIZE'").get()).toEqual({
            amount: '11200',
            ceiling_amount: '11000',
          });
          expect(service.getBalanceSnapshot(issue.movement.balanceContractId).tightAvailableBalance).toBe('0');
        } else {
          expect(result).toMatchObject({ ok: false, httpStatus: 409, code: 'EXCESS_LIMIT_EXCEEDED' });
          expect(count(db, 'balance_movements', "WHERE movement_type = 'UTILIZE'")).toBe(0);
          expect(count(db, 'excess_ledger_events')).toBe(0);
        }
      } finally {
        db.close();
      }
    },
  );

  test.each(['FX_RATE_UNAVAILABLE', 'FX_RATE_STALE'] as const)('%s denies Maker Submit with zero prepared-movement and Excess writes', async (code) => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, `FX-${code}`);
      const fx: BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum'] = async () => {
        expect(count(db, 'balance_movements', "WHERE movement_type = 'UTILIZE'")).toBe(0);
        expect(count(db, 'excess_accounts')).toBe(0);
        expect(count(db, 'excess_ledger_events')).toBe(0);
        expect(count(db, 'command_idempotency')).toBe(0);
        return { ok: false, code };
      };
      const service = new BalanceService(db, () => decisionTime, undefined, runtime(fx));

      await expect(service.submitA3ExcessByMaker(a3Request(contract.balanceContractId), control())).resolves.toEqual({ ok: false, code });

      expect(count(db, 'balance_movements', "WHERE movement_type = 'UTILIZE'")).toBe(0);
      for (const table of ['excess_accounts', 'excess_ledger_events', 'fx_rate_snapshots', 'excess_decision_snapshots', 'command_idempotency']) {
        expect(count(db, table)).toBe(0);
      }
    } finally {
      db.close();
    }
  });

  test('configuration resolution failure creates no movement, reservation, FX, decision or idempotent success', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'CONFIG-FAIL-1');
      const fx = jest.fn<
        ReturnType<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>,
        Parameters<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>
      >();
      const service = new BalanceService(db, () => decisionTime, undefined, {
        policy: {
          resolve: () => {
            throw new Error('injected configuration failure');
          },
        },
        fx: { resolveConfiguredMaximum: fx },
      });

      await expect(service.submitA3ExcessByMaker(a3Request(contract.balanceContractId), control())).rejects.toThrow('injected configuration failure');
      expect(fx).not.toHaveBeenCalled();
      expect(count(db, 'balance_movements', "WHERE movement_type = 'UTILIZE'")).toBe(0);
      for (const table of ['excess_accounts', 'excess_ledger_events', 'fx_rate_snapshots', 'excess_decision_snapshots', 'command_idempotency']) {
        expect(count(db, table)).toBe(0);
      }
    } finally {
      db.close();
    }
  });

  test('rejects a calculable over-limit as HTTP 409 with zero writes', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'OVER-LIMIT-201-1');
      const service = new BalanceService(db, () => decisionTime, undefined, {
        policy: { resolve: () => ({ ...policy, allowancePercentage: '10' }) },
        fx: { resolveConfiguredMaximum: async ({ request }) => ({ ok: true, quote: providerQuote(request) }) },
      });

      await expect(service.submitA3ExcessByMaker(a3Request(contract.balanceContractId), control())).resolves.toEqual(
        expect.objectContaining({
          ok: false,
          httpStatus: 409,
          code: 'EXCESS_LIMIT_EXCEEDED',
          guidance: expect.objectContaining({
            outcome: 'FINITE',
            minimumRequiredIncreaseOwner: '9.09',
            evidence: expect.objectContaining({ approvedContractualMaximumOwner: '100', proposedExcessOwner: '20' }),
          }),
        }),
      );
      expect(count(db, 'balance_movements', "WHERE movement_type = 'UTILIZE'")).toBe(0);
      for (const table of ['excess_accounts', 'excess_ledger_events', 'fx_rate_snapshots', 'excess_decision_snapshots', 'command_idempotency']) {
        expect(count(db, table)).toBe(0);
      }
    } finally {
      db.close();
    }
  });

  test.each(['FX_RATE_UNAVAILABLE', 'FX_RATE_STALE'] as const)(
    'Checker %s records only a command-attempt audit and retains every pending fact',
    async (code) => {
      const db = createDb(':memory:');
      try {
        const contract = seedReleasedEurLc(db, `CHECKER-${code}`);
        let fxCall = 0;
        const service = new BalanceService(
          db,
          () => decisionTime,
          undefined,
          runtime(async ({ request }) => {
            fxCall += 1;
            return fxCall === 1 ? { ok: true, quote: providerQuote(request) } : { ok: false, code };
          }),
        );
        const maker = await service.submitA3ExcessByMaker(a3Request(contract.balanceContractId), control());
        if (!('body' in maker)) throw new Error('expected persisted Maker Excess response');

        const before = {
          movement: db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId),
          reservation: db.prepare('SELECT * FROM excess_ledger_events WHERE movement_id = ?').get(maker.body.movementId),
          fx: db.prepare('SELECT * FROM fx_rate_snapshots WHERE movement_id = ?').all(maker.body.movementId),
          decision: db.prepare('SELECT * FROM excess_decision_snapshots WHERE movement_id = ?').all(maker.body.movementId),
          idempotency: db.prepare('SELECT * FROM command_idempotency').all(),
        };

        await expect(
          service.revalueA3ExcessByChecker(maker.body.movementId, {
            checkerContext: 'checker-1',
            idempotencyKey: `checker-${code}-1`,
            decisionTime: '2026-09-22T00:01:00.000Z',
          }),
        ).resolves.toEqual({ ok: false, code });

        expect(db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual(before.movement);
        expect(db.prepare('SELECT * FROM excess_ledger_events WHERE movement_id = ?').get(maker.body.movementId)).toEqual(before.reservation);
        expect(db.prepare('SELECT * FROM fx_rate_snapshots WHERE movement_id = ?').all(maker.body.movementId)).toEqual(before.fx);
        expect(db.prepare('SELECT * FROM excess_decision_snapshots WHERE movement_id = ?').all(maker.body.movementId)).toEqual(before.decision);
        expect(db.prepare('SELECT * FROM command_idempotency').all()).toEqual(before.idempotency);
        expect(db.prepare('SELECT status FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual({ status: 'PENDING' });
        expect(
          db
            .prepare(
              `SELECT command_type, movement_id, owner_type, owner_id, owner_currency,
                      actor_context, command_idempotency_key, result_code, policy_version,
                      from_currency, to_currency, requested_amount_usd, rate_purpose, decision_time
               FROM excess_command_attempt_audits`,
            )
            .get(),
        ).toEqual({
          command_type: 'CHECKER_RELEASE',
          movement_id: maker.body.movementId,
          owner_type: 'IMPORT_LC',
          owner_id: contract.logicalContractId,
          owner_currency: 'EUR',
          actor_context: 'checker-1',
          command_idempotency_key: `checker-${code}-1`,
          result_code: code,
          policy_version: 'policy-v1',
          from_currency: 'USD',
          to_currency: 'EUR',
          requested_amount_usd: '1000',
          rate_purpose: 'BOOKING',
          decision_time: '2026-09-22T00:01:00.000Z',
        });
        expect(count(db, 'excess_command_attempt_audits')).toBe(1);
      } finally {
        db.close();
      }
    },
  );

  test('Checker FX failure replay keeps the first audited result for the same command identity', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'CHECKER-FX-REPLAY');
      let fxCall = 0;
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime(async ({ request }) => {
          fxCall += 1;
          if (fxCall === 1) return { ok: true, quote: providerQuote(request) };
          return { ok: false, code: fxCall === 2 ? 'FX_RATE_UNAVAILABLE' : 'FX_RATE_STALE' };
        }),
      );
      const maker = await service.submitA3ExcessByMaker(a3Request(contract.balanceContractId), control());
      if (!('body' in maker)) throw new Error('expected persisted Maker Excess response');
      const checkerControl = {
        checkerContext: 'checker-replay',
        idempotencyKey: 'checker-replay-key',
        decisionTime: '2026-09-22T00:01:00.000Z',
      };

      await expect(service.revalueA3ExcessByChecker(maker.body.movementId, checkerControl)).resolves.toEqual({
        ok: false,
        code: 'FX_RATE_UNAVAILABLE',
      });
      await expect(service.revalueA3ExcessByChecker(maker.body.movementId, checkerControl)).resolves.toEqual({
        ok: false,
        code: 'FX_RATE_UNAVAILABLE',
      });

      expect(count(db, 'excess_command_attempt_audits')).toBe(1);
      expect(db.prepare('SELECT result_code FROM excess_command_attempt_audits').get()).toEqual({ result_code: 'FX_RATE_UNAVAILABLE' });
      expect(db.prepare('SELECT status FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual({ status: 'PENDING' });
      expect(count(db, 'excess_ledger_events')).toBe(1);
      expect(count(db, 'fx_rate_snapshots')).toBe(1);
      expect(count(db, 'excess_decision_snapshots')).toBe(1);

      await expect(
        service.revalueA3ExcessByChecker(maker.body.movementId, {
          ...checkerControl,
          decisionTime: '2026-09-22T00:02:00.000Z',
        }),
      ).resolves.toEqual({ ok: false, code: 'IDEMPOTENCY_CONFLICT' });
      expect(fxCall).toBe(2);

      await expect(
        service.revalueA3ExcessByChecker(maker.body.movementId, {
          ...checkerControl,
          idempotencyKey: 'checker-retry-key-2',
          decisionTime: '2026-09-22T00:02:00.000Z',
        }),
      ).resolves.toEqual({ ok: false, code: 'FX_RATE_STALE' });
      expect(fxCall).toBe(3);
      expect(count(db, 'excess_command_attempt_audits')).toBe(2);
    } finally {
      db.close();
    }
  });

  test('rejects same-Maker or non-pending Checker attempts before FX and without a command-attempt audit', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'CHECKER-GUARDS');
      const fx = jest.fn<
        ReturnType<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>,
        Parameters<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>
      >(async ({ request }) => ({ ok: true, quote: providerQuote(request) }));
      const service = new BalanceService(db, () => decisionTime, undefined, runtime(fx));
      const maker = await service.submitA3ExcessByMaker(a3Request(contract.balanceContractId), control());
      if (!('body' in maker)) throw new Error('expected persisted Maker Excess response');

      await expect(
        service.revalueA3ExcessByChecker(maker.body.movementId, {
          checkerContext: 'maker-1',
          idempotencyKey: 'same-maker-key',
          decisionTime: '2026-09-22T00:01:00.000Z',
        }),
      ).rejects.toThrow('Maker');
      expect(fx).toHaveBeenCalledTimes(1);
      expect(count(db, 'excess_command_attempt_audits')).toBe(0);

      db.prepare("UPDATE balance_movements SET status = 'REJECTED' WHERE movement_id = ?").run(maker.body.movementId);
      await expect(
        service.revalueA3ExcessByChecker(maker.body.movementId, {
          checkerContext: 'checker-1',
          idempotencyKey: 'rejected-key',
          decisionTime: '2026-09-22T00:01:00.000Z',
        }),
      ).rejects.toThrow('Cannot RELEASE');
      expect(fx).toHaveBeenCalledTimes(1);
      expect(count(db, 'excess_command_attempt_audits')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('audit persistence failure still leaves the pending movement and reservation unchanged', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'CHECKER-AUDIT-FAIL');
      let fxCall = 0;
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime(async ({ request }) => {
          fxCall += 1;
          return fxCall === 1 ? { ok: true, quote: providerQuote(request) } : { ok: false, code: 'FX_RATE_UNAVAILABLE' };
        }),
      );
      const maker = await service.submitA3ExcessByMaker(a3Request(contract.balanceContractId), control());
      if (!('body' in maker)) throw new Error('expected persisted Maker Excess response');
      const movementBefore = db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId);
      const reservationBefore = db.prepare('SELECT * FROM excess_ledger_events WHERE movement_id = ?').get(maker.body.movementId);
      db.exec(
        `CREATE TRIGGER fail_checker_attempt_audit BEFORE INSERT ON excess_command_attempt_audits
         BEGIN SELECT RAISE(ABORT, 'injected checker audit failure'); END`,
      );

      await expect(
        service.revalueA3ExcessByChecker(maker.body.movementId, {
          checkerContext: 'checker-1',
          idempotencyKey: 'audit-fail-key',
          decisionTime: '2026-09-22T00:01:00.000Z',
        }),
      ).rejects.toThrow('injected checker audit failure');
      expect(db.prepare('SELECT * FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual(movementBefore);
      expect(db.prepare('SELECT * FROM excess_ledger_events WHERE movement_id = ?').get(maker.body.movementId)).toEqual(reservationBefore);
      expect(count(db, 'excess_command_attempt_audits')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('returns idempotency conflict when a different same-scope attempt wins during Checker FX lookup', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'CHECKER-IDEM-RACE');
      let fxCall = 0;
      const checkerKey = 'checker-race-key';
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime(async ({ request }) => {
          fxCall += 1;
          if (fxCall === 1) return { ok: true, quote: providerQuote(request) };
          db.prepare(
            `INSERT INTO excess_command_attempt_audits (
              command_attempt_audit_id, command_type, movement_id, owner_type, owner_id, owner_currency,
              actor_context, command_idempotency_key, request_hash, result_code, policy_version,
              from_currency, to_currency, requested_amount_usd, rate_purpose, decision_time, created_at
            ) VALUES (?, 'CHECKER_RELEASE', ?, 'IMPORT_LC', ?, 'EUR', ?, ?, ?,
                      'FX_RATE_STALE', 'policy-v1', 'USD', 'EUR', '1000', 'BOOKING', ?, ?)`,
          ).run(
            'concurrent-audit',
            request.correlationId,
            contract.logicalContractId,
            'checker-race',
            checkerKey,
            'different-request-hash',
            '2026-09-22T00:02:00.000Z',
            decisionTime,
          );
          return { ok: false, code: 'FX_RATE_UNAVAILABLE' };
        }),
      );
      const maker = await service.submitA3ExcessByMaker(a3Request(contract.balanceContractId), control());
      if (!('body' in maker)) throw new Error('expected persisted Maker Excess response');

      await expect(
        service.revalueA3ExcessByChecker(maker.body.movementId, {
          checkerContext: 'checker-race',
          idempotencyKey: checkerKey,
          decisionTime: '2026-09-22T00:01:00.000Z',
        }),
      ).resolves.toEqual({ ok: false, code: 'IDEMPOTENCY_CONFLICT' });
      expect(count(db, 'excess_command_attempt_audits')).toBe(1);
      expect(db.prepare('SELECT result_code FROM excess_command_attempt_audits').get()).toEqual({ result_code: 'FX_RATE_STALE' });
      expect(db.prepare('SELECT status FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual({ status: 'PENDING' });
      expect(count(db, 'excess_ledger_events')).toBe(1);
    } finally {
      db.close();
    }
  });

  test('Checker revaluation reloads linked SG facts, effective policy, allowance excluding itself and a fresh Booking quote', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'CHECKER-REREAD-1');
      let activePolicy = policy;
      let fxCall = 0;
      const resolveFx: BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum'] = async ({ request }) => {
        fxCall += 1;
        const base = providerQuote(request);
        return fxCall === 1
          ? { ok: true, quote: base }
          : {
              ok: true,
              quote: {
                ...base,
                bookingRate: '0.04',
                convertedAmount: '40',
                providerRateId: 'checker-rate-latest',
                providerRateVersion: 'checker-v2',
                requestAttemptId: 'checker-attempt-2',
                rateTimestamp: '2026-09-22T00:00:30.000Z',
              },
            };
      };
      const service = new BalanceService(db, () => decisionTime, undefined, {
        policy: { resolve: () => activePolicy },
        fx: { resolveConfiguredMaximum: resolveFx },
      });
      const sg = service.createMovement({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'CHECKER-REREAD-1', sgNumber: 'SG-BEFORE-CHECKER' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '10',
        currency: 'EUR',
        parentLogicalContractId: contract.logicalContractId,
        createdBy: 'maker-sg',
      });
      if (!sg.created) throw new Error('expected SG issue');
      service.release(sg.movement.movementId, 'checker-sg');
      const maker = await service.submitA3ExcessByMaker(a3Request(contract.balanceContractId), control());
      if (!('body' in maker)) throw new Error('expected persisted Maker Excess response');

      const redeem = service.createMovement({
        instrumentType: 'SHGT',
        balanceContractId: sg.movement.balanceContractId,
        movementType: 'FULL_REDEEM',
        eventSeq: 2,
        amount: '10',
        currency: 'EUR',
        sourceTransactionRef: 'SG-REDEEM-1',
        createdBy: 'maker-redeem',
      });
      if (!redeem.created) throw new Error('expected SG redemption');
      service.release(redeem.movement.movementId, 'checker-redeem');
      activePolicy = { ...policy, policyVersion: 'policy-checker-v2', allowancePercentage: '50' };

      await expect(
        service.revalueA3ExcessByChecker(maker.body.movementId, {
          checkerContext: 'checker-1',
          idempotencyKey: 'checker-key-1',
          decisionTime: '2026-09-22T00:01:00.000Z',
        }),
      ).resolves.toMatchObject({
        ok: true,
        facts: { proposedExcessOwner: '20', factsVersion: expect.any(String) },
        policy: { policyVersion: 'policy-checker-v2' },
        fxSnapshot: { convertedAmount: '40', providerRateId: 'checker-rate-latest' },
        effectiveLimitOwner: '40',
        excessDecision: 'WITHIN_ALLOWANCE',
        businessResultCode: null,
        releaseEligibility: 'ELIGIBLE',
      });
      expect(fxCall).toBe(2);
      expect(db.prepare('SELECT COUNT(*) AS count FROM excess_ledger_events').get()).toEqual({ count: 1 });
      expect(db.prepare('SELECT status FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual({ status: 'PENDING' });
      expect(count(db, 'fx_rate_snapshots')).toBe(1);
      expect(count(db, 'excess_decision_snapshots')).toBe(1);
      expect(count(db, 'command_idempotency')).toBe(1);
    } finally {
      db.close();
    }
  });

  test('Checker zero-policy routing returns LEGACY_RELEASE without requiring an Excess account or writing Excess facts', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'CHECKER-BD03-1');
      const fx = jest.fn<
        ReturnType<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>,
        Parameters<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>
      >();
      const service = new BalanceService(db, () => decisionTime, undefined, {
        policy: { resolve: () => ({ ...policy, configuredMaximumUsd: '0' }) },
        fx: { resolveConfiguredMaximum: fx },
      });
      await expect(service.submitA3ExcessByMaker({ ...a3Request(contract.balanceContractId), amount: '80' }, control())).resolves.toEqual({
        kind: 'LEGACY_SUBMIT',
      });
      const candidate = db.prepare("SELECT movement_id FROM balance_movements WHERE movement_type = 'UTILIZE'").get() as { movement_id: string };

      await expect(
        service.revalueA3ExcessByChecker(candidate.movement_id, {
          checkerContext: 'checker-1',
          idempotencyKey: 'checker-bd03-key',
          decisionTime: '2026-09-22T00:01:00.000Z',
        }),
      ).resolves.toEqual({ kind: 'LEGACY_RELEASE' });
      expect(fx).not.toHaveBeenCalled();
      expect(count(db, 'excess_accounts')).toBe(0);
      expect(count(db, 'excess_ledger_events')).toBe(0);
      expect(count(db, 'fx_rate_snapshots')).toBe(0);
      expect(count(db, 'excess_decision_snapshots')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('Checker zero-policy routing enforces transaction-to-owner currency before legacy routing with zero FX or Excess writes', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'CHECKER-BD03-CURRENCY-1');
      const fx = jest.fn<
        ReturnType<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>,
        Parameters<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>
      >();
      const service = new BalanceService(db, () => decisionTime, undefined, {
        policy: { resolve: () => ({ ...policy, allowancePercentage: '0' }) },
        fx: { resolveConfiguredMaximum: fx },
      });
      await service.submitA3ExcessByMaker({ ...a3Request(contract.balanceContractId), amount: '80' }, control());
      const candidate = db.prepare("SELECT movement_id FROM balance_movements WHERE movement_type = 'UTILIZE'").get() as { movement_id: string };
      db.prepare("UPDATE balance_movements SET currency = 'USD' WHERE movement_id = ?").run(candidate.movement_id);

      await expect(
        service.revalueA3ExcessByChecker(candidate.movement_id, {
          checkerContext: 'checker-1',
          idempotencyKey: 'checker-bd03-currency-key',
          decisionTime: '2026-09-22T00:01:00.000Z',
        }),
      ).rejects.toThrow('does not match Import LC owner currency');
      expect(fx).not.toHaveBeenCalled();
      for (const table of ['excess_accounts', 'excess_ledger_events', 'fx_rate_snapshots', 'excess_decision_snapshots']) {
        expect(count(db, table)).toBe(0);
      }
    } finally {
      db.close();
    }
  });

  test('Checker capacity improvement to fully covered returns NOT_REQUIRED without mutating the pending reservation', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'CHECKER-NOT-REQUIRED-1');
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime(async ({ request }) => ({ ok: true, quote: providerQuote(request) })),
      );
      const sg = service.createMovement({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'CHECKER-NOT-REQUIRED-1', sgNumber: 'SG-FULLY-COVERED' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '20',
        currency: 'EUR',
        parentLogicalContractId: contract.logicalContractId,
        createdBy: 'maker-sg',
      });
      if (!sg.created) throw new Error('expected SG issue');
      service.release(sg.movement.movementId, 'checker-sg');
      const maker = await service.submitA3ExcessByMaker({ ...a3Request(contract.balanceContractId), amount: '100' }, control());
      if (!('body' in maker)) throw new Error('expected persisted Maker Excess response');

      const redeem = service.createMovement({
        instrumentType: 'SHGT',
        balanceContractId: sg.movement.balanceContractId,
        movementType: 'FULL_REDEEM',
        eventSeq: 2,
        amount: '20',
        currency: 'EUR',
        sourceTransactionRef: 'SG-FULL-REDEEM',
        createdBy: 'maker-redeem',
      });
      if (!redeem.created) throw new Error('expected SG redemption');
      service.release(redeem.movement.movementId, 'checker-redeem');

      await expect(
        service.revalueA3ExcessByChecker(maker.body.movementId, {
          checkerContext: 'checker-1',
          idempotencyKey: 'checker-not-required-key',
          decisionTime: '2026-09-22T00:01:00.000Z',
        }),
      ).resolves.toMatchObject({
        ok: true,
        facts: { proposedExcessOwner: '0' },
        excessDecision: 'NOT_REQUIRED',
        businessResultCode: null,
        releaseEligibility: 'ELIGIBLE',
      });
      expect(db.prepare('SELECT status FROM balance_movements WHERE movement_id = ?').get(maker.body.movementId)).toEqual({ status: 'PENDING' });
      expect(db.prepare('SELECT event_type, excess_amount_owner FROM excess_ledger_events').get()).toEqual({
        event_type: 'PENDING_RESERVATION',
        excess_amount_owner: '20',
      });
      expect(count(db, 'fx_rate_snapshots')).toBe(1);
      expect(count(db, 'excess_decision_snapshots')).toBe(1);
    } finally {
      db.close();
    }
  });

  test('uses one movement identity for response, FX correlation and every committed active fact', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'IDENTITY-1');
      const fx = jest.fn<
        ReturnType<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>,
        Parameters<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>
      >(async ({ request }) => ({
        ok: true,
        quote: providerQuote(request),
      }));
      const service = new BalanceService(db, () => decisionTime, undefined, runtime(fx));

      const result = await service.submitA3ExcessByMaker(a3Request(contract.balanceContractId), control());
      if (!('body' in result)) throw new Error('expected persisted Maker Excess response');
      const movementId = result.body.movementId;

      expect(fx).toHaveBeenCalledWith(expect.objectContaining({ request: expect.objectContaining({ correlationId: movementId }) }));
      expect(db.prepare('SELECT movement_id FROM balance_movements WHERE movement_id = ?').get(movementId)).toEqual({ movement_id: movementId });
      expect(db.prepare('SELECT movement_id, correlation_id FROM fx_rate_snapshots').get()).toEqual({ movement_id: movementId, correlation_id: movementId });
      expect(db.prepare('SELECT movement_id FROM excess_ledger_events').get()).toEqual({ movement_id: movementId });
      expect(db.prepare('SELECT transaction_amount_owner, excess_amount_owner FROM excess_ledger_events').get()).toEqual({
        transaction_amount_owner: '120',
        excess_amount_owner: '20',
      });
      expect(db.prepare('SELECT movement_id FROM excess_decision_snapshots').get()).toEqual({ movement_id: movementId });
      const stored = db.prepare('SELECT response_body FROM command_idempotency').get() as { response_body: string };
      expect(JSON.parse(stored.response_body)).toMatchObject({ movementId });
      for (const table of ['fx_rate_snapshots', 'excess_ledger_events', 'excess_decision_snapshots', 'command_idempotency']) {
        expect(count(db, table)).toBe(1);
      }

      db.prepare("UPDATE balance_contracts SET status = 'CLOSED' WHERE balance_contract_id = ?").run(contract.balanceContractId);
      await expect(service.submitA3ExcessByMaker(a3Request(contract.balanceContractId), control())).resolves.toEqual(result);
      await expect(service.submitA3ExcessByMaker({ ...a3Request(contract.balanceContractId), amount: '121' }, control())).resolves.toEqual({
        ok: false,
        code: 'IDEMPOTENCY_CONFLICT',
      });
      expect(count(db, 'balance_movements', "WHERE movement_type = 'UTILIZE'")).toBe(1);
      for (const table of ['fx_rate_snapshots', 'excess_ledger_events', 'excess_decision_snapshots', 'command_idempotency']) {
        expect(count(db, table)).toBe(1);
      }
    } finally {
      db.close();
    }
  });

  test('keeps legacy createMovement behavior and does not write Excess or FX facts', () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'LEGACY-1');
      const service = new BalanceService(db, () => decisionTime);
      const result = service.createMovement({ ...a3Request(contract.balanceContractId), amount: '80' });

      expect(result.created).toBe(true);
      expect(count(db, 'balance_movements', "WHERE movement_type = 'UTILIZE'")).toBe(1);
      for (const table of ['excess_accounts', 'excess_ledger_events', 'fx_rate_snapshots', 'excess_decision_snapshots', 'command_idempotency']) {
        expect(count(db, table)).toBe(0);
      }
    } finally {
      db.close();
    }
  });

  test('routes an either-zero allowance policy through unchanged legacy sufficiency with no FX or Excess persistence', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'BD03-1');
      const fx = jest.fn<
        ReturnType<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>,
        Parameters<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>
      >();
      const zeroPolicy = { ...policy, configuredMaximumUsd: '0' };
      const zeroRuntime: BalanceMakerExcessRuntime = {
        policy: { resolve: () => zeroPolicy },
        fx: { resolveConfiguredMaximum: fx },
      };
      const service = new BalanceService(db, () => decisionTime, undefined, zeroRuntime);

      const request = { ...a3Request(contract.balanceContractId), amount: '80' };
      const first = await service.submitA3ExcessByMaker(request, control());
      expect(first).toEqual({ kind: 'LEGACY_SUBMIT' });
      await expect(service.submitA3ExcessByMaker(request, control())).resolves.toEqual(first);
      await expect(service.submitA3ExcessByMaker({ ...request, amount: '81' }, control())).resolves.toEqual({
        ok: false,
        code: 'IDEMPOTENCY_CONFLICT',
      });
      expect(fx).not.toHaveBeenCalled();
      expect(count(db, 'balance_movements', "WHERE movement_type = 'UTILIZE'")).toBe(1);
      for (const table of ['excess_accounts', 'excess_ledger_events', 'fx_rate_snapshots', 'excess_decision_snapshots']) {
        expect(count(db, table)).toBe(0);
      }
      expect(count(db, 'command_idempotency')).toBe(1);
    } finally {
      db.close();
    }
  });

  test('makes a positive-policy covered-only submit idempotent without FX or Excess persistence', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'COVERED-IDEM-1');
      const fx = jest.fn<
        ReturnType<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>,
        Parameters<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>
      >();
      const service = new BalanceService(db, () => decisionTime, undefined, runtime(fx));
      const request = { ...a3Request(contract.balanceContractId), amount: '80' };

      const first = await service.submitA3ExcessByMaker(request, control());
      await expect(service.submitA3ExcessByMaker(request, control())).resolves.toEqual(first);
      await expect(service.submitA3ExcessByMaker({ ...request, amount: '81' }, control())).resolves.toEqual({
        ok: false,
        code: 'IDEMPOTENCY_CONFLICT',
      });
      expect(first).toEqual({ kind: 'LEGACY_SUBMIT' });
      expect(fx).not.toHaveBeenCalled();
      expect(count(db, 'balance_movements', "WHERE movement_type = 'UTILIZE'")).toBe(1);
      expect(count(db, 'command_idempotency')).toBe(1);
      for (const table of ['excess_accounts', 'excess_ledger_events', 'fx_rate_snapshots', 'excess_decision_snapshots']) {
        expect(count(db, table)).toBe(0);
      }
    } finally {
      db.close();
    }
  });

  test('rejects missing runtime, non-A3 shape and actor mismatch before any Maker Excess write', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'CONTROL-1');
      const request = a3Request(contract.balanceContractId);
      await expect(new BalanceService(db).submitA3ExcessByMaker(request, control())).rejects.toThrow('runtime is not configured');

      const configured = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime(async ({ request: fxRequest }) => ({ ok: true, quote: providerQuote(fxRequest) })),
      );
      await expect(configured.submitA3ExcessByMaker({ ...request, movementType: 'AMEND_INCREASE' }, control())).rejects.toThrow(
        'requires an existing IPLC_LC UTILIZE',
      );
      await expect(configured.submitA3ExcessByMaker(request, { ...control(), actorContext: 'other-maker' })).rejects.toThrow(
        'Maker actor must match movement createdBy',
      );
      await expect(configured.submitA3ExcessByMaker({ ...request, balanceContractId: undefined }, control())).rejects.toThrow(
        'existing balanceContractId is required',
      );
      await expect(configured.submitA3ExcessByMaker({ ...request, balanceContractId: 'missing-contract' }, control())).rejects.toThrow(
        'No BalanceContract missing-contract',
      );
      expect(count(db, 'balance_movements', "WHERE movement_type = 'UTILIZE'")).toBe(0);
      expect(count(db, 'command_idempotency')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('rejects a non-IPLC database contract even when the caller labels the request IPLC_LC', async () => {
    const db = createDb(':memory:');
    try {
      const base = new BalanceService(db, () => decisionTime);
      const issue = base.createMovement({
        instrumentType: 'EPLC_LC',
        naturalKey: { lcNumber: 'WRONG-OWNER-1' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '100',
        currency: 'EUR',
        tenorType: 'SIGHT',
        expiryDate: '2099-12-31',
        createdBy: 'maker-issue',
      });
      if (!issue.created) throw new Error('expected export LC issue');
      base.release(issue.movement.movementId, 'checker-issue');
      const fx = jest.fn<
        ReturnType<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>,
        Parameters<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>
      >();
      const service = new BalanceService(db, () => decisionTime, undefined, runtime(fx));

      await expect(service.submitA3ExcessByMaker(a3Request(issue.movement.balanceContractId), control())).rejects.toThrow(
        'does not match Balance Contract instrumentType',
      );
      expect(fx).not.toHaveBeenCalled();
      expect(count(db, 'excess_accounts')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('derives A3 Covered from Tight Available, excluding pending A2 increase and outstanding SG exposure', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'TIGHT-A3-1');
      const base = new BalanceService(db, () => decisionTime);
      base.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: contract.balanceContractId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 2,
        amount: '50',
        currency: 'EUR',
        sourceTransactionRef: 'A2-PENDING',
        createdBy: 'maker-a2',
      });
      const sg = base.createMovement({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'TIGHT-A3-1', sgNumber: 'SG-1' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '20',
        currency: 'EUR',
        parentLogicalContractId: contract.logicalContractId,
        createdBy: 'maker-sg',
      });
      if (!sg.created) throw new Error('expected SG issue');
      base.release(sg.movement.movementId, 'checker-sg');
      const resolveFx: BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum'] = async ({ request }) => ({
        ok: true,
        quote: providerQuote(request),
      });
      const service = new BalanceService(db, () => decisionTime, undefined, runtime(resolveFx));
      const request = { ...a3Request(contract.balanceContractId), eventSeq: 3, amount: '100' };

      await expect(service.submitA3ExcessByMaker(request, control())).resolves.toMatchObject({
        httpStatus: 201,
        body: { coveredAmountOwner: '80', excessAmountOwner: '20' },
      });
      expect(db.prepare('SELECT transaction_amount_owner, covered_amount_owner, excess_amount_owner FROM excess_ledger_events').get()).toEqual({
        transaction_amount_owner: '100',
        covered_amount_owner: '80',
        excess_amount_owner: '20',
      });
      expect(db.prepare("SELECT amount, ceiling_amount FROM balance_movements WHERE movement_type = 'UTILIZE'").get()).toEqual({
        amount: '100',
        ceiling_amount: '80',
      });
      expect(service.getBalanceSnapshot(contract.balanceContractId).tightAvailableBalance).toBe('0');
    } finally {
      db.close();
    }
  });

  test.each([
    [
      'CLOSED contract',
      (db: Db, balanceContractId: string, request: CreateMovementRequest) => {
        db.prepare("UPDATE balance_contracts SET status = 'CLOSED' WHERE balance_contract_id = ?").run(balanceContractId);
        return request;
      },
    ],
    [
      'bad referenced transaction',
      (_db: Db, _balanceContractId: string, request: CreateMovementRequest) => ({
        ...request,
        referencedTransactionId: 'missing-movement',
      }),
    ],
    ['currency mismatch', (_db: Db, _balanceContractId: string, request: CreateMovementRequest) => ({ ...request, currency: 'USD' })],
  ] as const)('rejects %s through existing lifecycle controls before FX with zero Excess writes', async (_label, mutate) => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, `LIFECYCLE-${_label}`);
      const fx = jest.fn<
        ReturnType<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>,
        Parameters<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>
      >();
      const service = new BalanceService(db, () => decisionTime, undefined, runtime(fx));
      const request = mutate(db, contract.balanceContractId, a3Request(contract.balanceContractId));

      await expect(service.submitA3ExcessByMaker(request, control())).rejects.toThrow();
      expect(fx).not.toHaveBeenCalled();
      expect(count(db, 'balance_movements', "WHERE movement_type = 'UTILIZE'")).toBe(0);
      for (const table of ['excess_accounts', 'excess_ledger_events', 'fx_rate_snapshots', 'excess_decision_snapshots', 'command_idempotency']) {
        expect(count(db, table)).toBe(0);
      }
    } finally {
      db.close();
    }
  });

  test('rejects an unreleased root ISSUE before FX with zero Excess writes', async () => {
    const db = createDb(':memory:');
    try {
      const base = new BalanceService(db, () => decisionTime);
      const issue = base.createMovement({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'UNRELEASED-1' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '100',
        currency: 'EUR',
        tenorType: 'SIGHT',
        expiryDate: '2099-12-31',
        createdBy: 'maker-issue',
      });
      if (!issue.created) throw new Error('expected pending issue');
      const fx = jest.fn<
        ReturnType<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>,
        Parameters<BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum']>
      >();
      const service = new BalanceService(db, () => decisionTime, undefined, runtime(fx));

      await expect(service.submitA3ExcessByMaker(a3Request(issue.movement.balanceContractId), control())).rejects.toThrow('has not been Checker-Released');
      expect(fx).not.toHaveBeenCalled();
      expect(count(db, 'excess_accounts')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('recomputes the DB facts fingerprint after FX and rejects a changed contract before persistence', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'FACTS-CHANGE-1');
      const fx: BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum'] = async ({ request }) => {
        db.prepare('UPDATE balance_contracts SET contract_version = contract_version + 1 WHERE balance_contract_id = ?').run(contract.balanceContractId);
        return { ok: true, quote: providerQuote(request) };
      };
      const service = new BalanceService(db, () => decisionTime, undefined, runtime(fx));

      await expect(service.submitA3ExcessByMaker(a3Request(contract.balanceContractId), control())).rejects.toThrow('Current Excess facts changed');
      expect(count(db, 'balance_movements', "WHERE movement_type = 'UTILIZE'")).toBe(0);
      expect(count(db, 'excess_accounts')).toBe(0);
      expect(count(db, 'command_idempotency')).toBe(0);
    } finally {
      db.close();
    }
  });

  test('includes linked SG facts in the post-FX fingerprint and rejects a changed SG exposure with zero Excess writes', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'SG-FACTS-CHANGE-1');
      const base = new BalanceService(db, () => decisionTime);
      const fx: BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum'] = async ({ request }) => {
        const sg = base.createMovement({
          instrumentType: 'SHGT',
          naturalKey: { lcNumber: 'SG-FACTS-CHANGE-1', sgNumber: 'SG-DURING-FX' },
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '10',
          currency: 'EUR',
          parentLogicalContractId: contract.logicalContractId,
          createdBy: 'maker-sg',
        });
        if (!sg.created) throw new Error('expected SG issue during FX');
        base.release(sg.movement.movementId, 'checker-sg');
        return { ok: true, quote: providerQuote(request) };
      };
      const service = new BalanceService(db, () => decisionTime, undefined, runtime(fx));

      await expect(service.submitA3ExcessByMaker(a3Request(contract.balanceContractId), control())).rejects.toThrow('Current Excess facts changed');
      expect(count(db, 'balance_movements', "WHERE movement_type = 'UTILIZE'")).toBe(0);
      for (const table of ['excess_accounts', 'excess_ledger_events', 'fx_rate_snapshots', 'excess_decision_snapshots', 'command_idempotency']) {
        expect(count(db, table)).toBe(0);
      }
    } finally {
      db.close();
    }
  });

  test('rolls back a late database abort and permits the same idempotency key to retry successfully', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'RETRY-1');
      const resolveFx: BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum'] = async ({ request }) => ({ ok: true, quote: providerQuote(request) });
      const service = new BalanceService(db, () => decisionTime, undefined, runtime(resolveFx));
      db.exec(`CREATE TRIGGER fail_excess_decision BEFORE INSERT ON excess_decision_snapshots BEGIN SELECT RAISE(ABORT, 'injected late failure'); END`);

      await expect(service.submitA3ExcessByMaker(a3Request(contract.balanceContractId), control())).rejects.toThrow('injected late failure');
      expect(count(db, 'balance_movements', "WHERE movement_type = 'UTILIZE'")).toBe(0);
      for (const table of ['excess_accounts', 'excess_ledger_events', 'fx_rate_snapshots', 'excess_decision_snapshots', 'command_idempotency']) {
        expect(count(db, table)).toBe(0);
      }

      db.exec('DROP TRIGGER fail_excess_decision');
      await expect(service.submitA3ExcessByMaker(a3Request(contract.balanceContractId), control())).resolves.toMatchObject({
        httpStatus: 201,
        body: { workflowStatus: 'PENDING', excessAmountOwner: '20' },
      });
      expect(count(db, 'balance_movements', "WHERE movement_type = 'UTILIZE'")).toBe(1);
      expect(count(db, 'command_idempotency')).toBe(1);
    } finally {
      db.close();
    }
  });

  test('rolls back movement, FX, reservation, decision and idempotency when the final account CAS aborts', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'CAS-ABORT-1');
      const resolveFx: BalanceMakerExcessRuntime['fx']['resolveConfiguredMaximum'] = async ({ request }) => ({ ok: true, quote: providerQuote(request) });
      const service = new BalanceService(db, () => decisionTime, undefined, runtime(resolveFx));
      db.exec(`CREATE TRIGGER fail_account_cas BEFORE UPDATE ON excess_accounts BEGIN SELECT RAISE(ABORT, 'injected account CAS failure'); END`);

      await expect(service.submitA3ExcessByMaker(a3Request(contract.balanceContractId), control())).rejects.toThrow('injected account CAS failure');
      expect(count(db, 'balance_movements', "WHERE movement_type = 'UTILIZE'")).toBe(0);
      for (const table of ['excess_accounts', 'excess_ledger_events', 'fx_rate_snapshots', 'excess_decision_snapshots', 'command_idempotency']) {
        expect(count(db, table)).toBe(0);
      }
    } finally {
      db.close();
    }
  });

  test('A3 Checker Acknowledge atomically saves the fresh decision while retaining the pending reservation', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'ACK-ATOMIC-1');
      let fxCall = 0;
      const service = new BalanceService(
        db,
        () => decisionTime,
        undefined,
        runtime(async ({ request }) => {
          fxCall += 1;
          return {
            ok: true,
            quote: {
              ...providerQuote(request),
              providerRateVersion: `v${fxCall}`,
              requestAttemptId: `attempt-${fxCall}`,
            },
          };
        }),
      );
      const maker = await service.submitA3ExcessByMaker(a3Request(contract.balanceContractId), control());
      if (!('body' in maker)) throw new Error('expected persisted Maker Excess response');

      await expect(
        service.acknowledgeA3ExcessByChecker(maker.body.movementId, {
          checkerContext: 'checker-ack',
          idempotencyKey: 'checker-ack-key',
          decisionTime: '2026-09-22T00:01:00.000Z',
        }),
      ).resolves.toMatchObject({
        ok: true,
        movement: { movementId: maker.body.movementId, status: 'PENDING', acknowledgedBy: 'checker-ack' },
        excessDecision: 'WITHIN_ALLOWANCE',
        releaseEligibility: 'ELIGIBLE',
      });

      expect(fxCall).toBe(2);
      expect(db.prepare('SELECT event_type, allowance_amount_owner FROM excess_ledger_events WHERE movement_id = ?').all(maker.body.movementId)).toEqual([
        { event_type: 'PENDING_RESERVATION', allowance_amount_owner: '20' },
      ]);
      expect(db.prepare('SELECT decision_point, provider_rate_version FROM fx_rate_snapshots WHERE movement_id = ? ORDER BY rowid').all(maker.body.movementId)).toEqual([
        { decision_point: 'MAKER_SUBMIT', provider_rate_version: 'v1' },
        { decision_point: 'CHECKER_RELEASE', provider_rate_version: 'v2' },
      ]);
      expect(db.prepare('SELECT action, excess_decision FROM excess_decision_snapshots WHERE movement_id = ? ORDER BY rowid').all(maker.body.movementId)).toEqual([
        { action: 'MAKER_SUBMIT', excess_decision: 'WITHIN_ALLOWANCE' },
        { action: 'CHECKER_RELEASE', excess_decision: 'WITHIN_ALLOWANCE' },
      ]);
    } finally {
      db.close();
    }
  });

  test('A3 Checker Acknowledge preserves the pre-Excess legacy path when the movement has no Maker Excess decision', async () => {
    const db = createDb(':memory:');
    try {
      const contract = seedReleasedEurLc(db, 'ACK-LEGACY-NO-EXCESS');
      const fxResolve = jest.fn(async ({ request }) => ({ ok: true as const, quote: providerQuote(request) }));
      const service = new BalanceService(db, () => decisionTime, undefined, runtime(fxResolve));
      const created = service.createMovement({ ...a3Request(contract.balanceContractId), amount: '80' });
      if (!created.created) throw new Error('expected legacy A3 movement');

      const checkerControl = {
        checkerContext: 'checker-legacy',
        idempotencyKey: 'checker-legacy-key',
        decisionTime: '2026-09-23T00:01:00.000Z',
      };
      const first = await service.acknowledgeA3ExcessByChecker(created.movement.movementId, checkerControl);
      expect(first).toMatchObject({
        kind: 'LEGACY_RELEASE',
        movement: { movementId: created.movement.movementId, status: 'PENDING', acknowledgedBy: 'checker-legacy' },
      });
      await expect(service.acknowledgeA3ExcessByChecker(created.movement.movementId, checkerControl)).resolves.toEqual(first);
      expect(fxResolve).not.toHaveBeenCalled();
      expect(count(db, 'excess_accounts')).toBe(0);
      expect(count(db, 'fx_rate_snapshots')).toBe(0);
      expect(count(db, 'excess_decision_snapshots')).toBe(0);
      expect(count(db, 'sg_capacity_events')).toBe(0);
      expect(count(db, 'command_idempotency', "WHERE command_type = 'CHECKER_ACKNOWLEDGE'")).toBe(1);
    } finally {
      db.close();
    }
  });
});
