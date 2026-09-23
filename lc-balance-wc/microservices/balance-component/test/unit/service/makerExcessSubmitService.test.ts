import type { ExcessPolicyConfig } from '../../../src/config/excessPolicyConfig';
import { CurrencyMismatchError } from '../../../src/errors';
import type { CurrencyExchangeQuote } from '../../../src/integration/currencyExchange';
import {
  MakerExcessSubmitService,
  MakerExcessFactsChangedError,
  type MakerExcessAtomicTransaction,
  type MakerExcessSubmitCommand,
  type MakerExcessSubmitDependencies,
  type MakerExcessSubmitResponse,
} from '../../../src/service/makerExcessSubmitService';

const command: MakerExcessSubmitCommand = {
  commandType: 'MAKER_SUBMIT',
  functionCode: 'A3',
  ownerType: 'IMPORT_LC',
  ownerId: 'import-lc-1',
  ownerCurrency: 'EUR',
  transactionAmountOwner: '120',
  movementId: 'movement-1',
  actorContext: 'maker-1',
  idempotencyKey: 'idem-1',
  requestHash: 'hash-1',
  decisionTime: '2026-09-22T00:00:00.000Z',
};

const policy: Readonly<ExcessPolicyConfig> = {
  policyVersion: 'policy-v1',
  ownerType: 'IMPORT_LC',
  allowancePercentage: '10',
  configuredMaximumUsd: '1000.00',
  fxMaxStalenessSeconds: 300,
  currencyPrecisions: { USD: 2, EUR: 2 },
  rateScale: 6,
  roundingMode: 'ROUND_HALF_UP',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: null,
  fallbackPolicy: 'FAIL_CLOSED',
  pbdFallbackPolicy: {
    authorized: false,
    fallbackPolicyId: null,
    fallbackPolicyVersion: null,
    effectiveFrom: null,
    effectiveTo: null,
  },
};

const fxQuote: CurrencyExchangeQuote = {
  fromCurrency: 'USD',
  toCurrency: 'EUR',
  requestedAmount: '1000.00',
  ratePurpose: 'BOOKING',
  bookingRate: '0.920000',
  convertedAmount: '920.00',
  rateOrigin: 'PROVIDER_SUPPLIED',
  rateSource: 'PROVIDER',
  providerRateId: 'rate-1',
  providerRateVersion: 'opaque-v1',
  rateTimestamp: '2026-09-21T23:59:00.000Z',
  approvalStatus: 'APPROVED',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: null,
  correlationId: 'movement-1',
  policyVersion: 'policy-v1',
  requestAttemptId: 'attempt-1',
};

function response(): MakerExcessSubmitResponse {
  return {
    httpStatus: 201,
    body: {
      movementId: command.movementId,
      workflowStatus: 'PENDING',
      coveredAmountOwner: '100',
      excessAmountOwner: '20',
      excessDecision: 'WITHIN_ALLOWANCE',
      businessResultCode: null,
      releaseEligibility: 'ELIGIBLE',
    },
  };
}

function createHarness(overrides: Partial<MakerExcessSubmitDependencies> = {}) {
  const calls: string[] = [];
  const transaction: MakerExcessAtomicTransaction = {
    claimIdempotency: jest.fn(() => {
      calls.push('claim-idempotency');
      return { kind: 'CLAIMED' };
    }),
    assertCurrentFactsVersion: jest.fn(() => calls.push('validate-current-facts')),
    lockAllowance: jest.fn(() => {
      calls.push('lock-allowance');
      return {
        excessAccountId: 'excess-account-1',
        version: 3,
        approvedUtilizedOwner: '10.00',
        otherPendingReservedOwner: '5.00',
      };
    }),
    persist: jest.fn(() => calls.push('persist')),
  };
  const dependencies: MakerExcessSubmitDependencies = {
    idempotency: {
      preflight: jest.fn(() => {
        calls.push('idempotency');
        return { kind: 'MISS' };
      }),
    },
    currentFacts: {
      load: jest.fn(() => {
        calls.push('current-facts');
        return {
          ownerType: 'IMPORT_LC',
          ownerId: 'import-lc-1',
          factsVersion: 'facts-v1',
          approvedContractualMaximumOwner: '1000.00',
          splitInput: {
            functionCode: 'A3',
            transactionCurrency: 'EUR',
            ownerCurrency: 'EUR',
            transactionAmountOwner: '120.00',
            importLcTightAvailableOwner: '100.00',
          },
        };
      }),
    },
    policy: {
      resolve: jest.fn(() => {
        calls.push('policy');
        return policy;
      }),
    },
    fx: {
      resolveConfiguredMaximum: jest.fn(async () => {
        calls.push('fx');
        return { ok: true as const, quote: fxQuote };
      }),
    },
    legacy: {
      submit: jest.fn(() => {
        calls.push('legacy-submit');
        return { kind: 'LEGACY_SUBMIT' };
      }),
    },
    unitOfWork: {
      execute: jest.fn((operation) => {
        calls.push('unit-of-work');
        return operation(transaction);
      }),
    },
    ...overrides,
  };
  return { calls, dependencies, transaction, service: new MakerExcessSubmitService(dependencies) };
}

describe('MakerExcessSubmitService orchestration', () => {
  test('replays idempotent success before loading current facts or calling FX', async () => {
    const replay = response();
    const { dependencies, service } = createHarness({
      idempotency: { preflight: jest.fn(() => ({ kind: 'REPLAY', response: replay })) },
    });

    await expect(service.submit(command)).resolves.toEqual(replay);
    expect(dependencies.idempotency.preflight).toHaveBeenCalledWith({
      commandType: 'MAKER_SUBMIT',
      ownerId: 'import-lc-1',
      actorContext: 'maker-1',
      key: 'idem-1',
      requestHash: 'hash-1',
    });
    expect(dependencies.currentFacts.load).not.toHaveBeenCalled();
    expect(dependencies.policy.resolve).not.toHaveBeenCalled();
    expect(dependencies.fx.resolveConfiguredMaximum).not.toHaveBeenCalled();
    expect(dependencies.unitOfWork.execute).not.toHaveBeenCalled();
  });

  test('rejects a preflight idempotency conflict before any domain reads, FX or writes', async () => {
    const { dependencies, service, transaction } = createHarness({
      idempotency: { preflight: jest.fn(() => ({ kind: 'CONFLICT' })) },
    });

    await expect(service.submit(command)).resolves.toEqual({ ok: false, code: 'IDEMPOTENCY_CONFLICT' });
    expect(dependencies.idempotency.preflight).toHaveBeenCalledWith({
      commandType: 'MAKER_SUBMIT',
      ownerId: 'import-lc-1',
      actorContext: 'maker-1',
      key: 'idem-1',
      requestHash: 'hash-1',
    });
    expect(dependencies.currentFacts.load).not.toHaveBeenCalled();
    expect(dependencies.policy.resolve).not.toHaveBeenCalled();
    expect(dependencies.fx.resolveConfiguredMaximum).not.toHaveBeenCalled();
    expect(dependencies.unitOfWork.execute).not.toHaveBeenCalled();
    expect(transaction.persist).not.toHaveBeenCalled();
  });

  test('routes a covered-only movement to the legacy submit path with zero FX or Excess persistence', async () => {
    const { dependencies, service, transaction } = createHarness({
      currentFacts: {
        load: jest.fn(() => ({
          ownerType: 'IMPORT_LC',
          ownerId: 'import-lc-1',
          factsVersion: 'facts-v1',
          approvedContractualMaximumOwner: '1000.00',
          splitInput: {
            functionCode: 'A3',
            transactionCurrency: 'EUR',
            ownerCurrency: 'EUR',
            transactionAmountOwner: '80.00',
            importLcTightAvailableOwner: '100.00',
          },
        })),
      },
    });

    const coveredCommand = { ...command, transactionAmountOwner: '80.00' };
    await expect(service.submit(coveredCommand)).resolves.toEqual({ kind: 'LEGACY_SUBMIT' });
    expect(dependencies.fx.resolveConfiguredMaximum).not.toHaveBeenCalled();
    expect(dependencies.unitOfWork.execute).not.toHaveBeenCalled();
    expect(transaction.persist).not.toHaveBeenCalled();
    expect(dependencies.legacy.submit).toHaveBeenCalledWith(coveredCommand);
  });

  test.each([
    ['owner identity', { ownerId: 'other-owner' }],
    ['owner currency', { ownerCurrency: 'GBP' }],
    ['transaction amount', { transactionAmountOwner: '121' }],
  ] as const)('rejects a command whose %s differs from the authoritative current facts before policy or FX', async (_label, patch) => {
    const { dependencies, service } = createHarness();

    await expect(service.submit({ ...command, ...patch })).rejects.toThrow('Current Excess facts do not match');
    expect(dependencies.policy.resolve).not.toHaveBeenCalled();
    expect(dependencies.fx.resolveConfiguredMaximum).not.toHaveBeenCalled();
    expect(dependencies.unitOfWork.execute).not.toHaveBeenCalled();
  });

  test('rejects a policy resolved for a different allowance owner before split or FX', async () => {
    const { dependencies, service } = createHarness({
      policy: { resolve: jest.fn(() => ({ ...policy, ownerType: 'EXPORT_CONFIRMATION' })) },
    });

    await expect(service.submit(command)).rejects.toThrow('policy owner type does not match');
    expect(dependencies.fx.resolveConfiguredMaximum).not.toHaveBeenCalled();
    expect(dependencies.unitOfWork.execute).not.toHaveBeenCalled();
  });

  test('rejects a missing owner-currency precision before FX or persistence', async () => {
    const { dependencies, service } = createHarness({
      policy: { resolve: jest.fn(() => ({ ...policy, currencyPrecisions: { USD: 2 } })) },
    });

    await expect(service.submit(command)).rejects.toThrow('Missing owner-currency precision for EUR');
    expect(dependencies.fx.resolveConfiguredMaximum).not.toHaveBeenCalled();
    expect(dependencies.unitOfWork.execute).not.toHaveBeenCalled();
  });

  test('orders current facts, policy, split, FX and locked atomic persistence for positive Excess', async () => {
    const { calls, dependencies, service, transaction } = createHarness();

    await expect(service.submit(command)).resolves.toEqual(response());
    expect(calls).toEqual([
      'idempotency',
      'current-facts',
      'policy',
      'fx',
      'unit-of-work',
      'claim-idempotency',
      'validate-current-facts',
      'lock-allowance',
      'persist',
    ]);
    expect(transaction.claimIdempotency).toHaveBeenCalledWith({
      commandType: 'MAKER_SUBMIT',
      ownerId: 'import-lc-1',
      actorContext: 'maker-1',
      key: 'idem-1',
      requestHash: 'hash-1',
    });
    expect(transaction.assertCurrentFactsVersion).toHaveBeenCalledWith(command, 'facts-v1');
    expect(transaction.lockAllowance).toHaveBeenCalledWith('IMPORT_LC', 'import-lc-1', 'EUR', 2, 'policy-v1');
    expect(dependencies.fx.resolveConfiguredMaximum).toHaveBeenCalledWith({
      request: {
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        amount: '1000.00',
        ratePurpose: 'BOOKING',
        decisionTime: command.decisionTime,
        correlationId: command.movementId,
        policyVersion: policy.policyVersion,
      },
      commandIdempotencyKey: command.idempotencyKey,
      maxStalenessSeconds: policy.fxMaxStalenessSeconds,
      pbdAuthorization: { authorized: false },
    });
    expect(transaction.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        movementId: 'movement-1',
        ownerId: 'import-lc-1',
        expectedFactsVersion: 'facts-v1',
        coveredAmountOwner: '100',
        excessAmountOwner: '20',
        effectiveLimitOwner: '100',
        excessDecision: 'WITHIN_ALLOWANCE',
        releaseEligibility: 'ELIGIBLE',
        policySnapshot: policy,
        fxSnapshot: fxQuote,
        idempotency: expect.objectContaining({ key: 'idem-1', requestHash: 'hash-1', response: response() }),
        audit: expect.objectContaining({ actorContext: 'maker-1', action: 'MAKER_SUBMIT' }),
      }),
    );
  });

  test.each([
    ['same hash replay', { kind: 'REPLAY' as const, response: response() }, response()],
    ['different hash conflict', { kind: 'CONFLICT' as const }, { ok: false as const, code: 'IDEMPOTENCY_CONFLICT' as const }],
  ])('resolves a concurrent preflight-MISS as transactional %s without persistence', async (_label, claim, expected) => {
    const { service, transaction } = createHarness();
    (transaction.claimIdempotency as jest.Mock).mockReturnValue(claim);

    await expect(service.submit(command)).resolves.toEqual(expected);
    expect(transaction.assertCurrentFactsVersion).not.toHaveBeenCalled();
    expect(transaction.lockAllowance).not.toHaveBeenCalled();
    expect(transaction.persist).not.toHaveBeenCalled();
  });

  test.each([
    ['0', '10'],
    ['1000.00', '0'],
  ])('enforces the currency invariant before the zero-policy legacy route (maximum=%s, percentage=%s)', async (configuredMaximumUsd, allowancePercentage) => {
    const { dependencies, service, transaction } = createHarness({
      currentFacts: {
        load: jest.fn(() => ({
          ownerType: 'IMPORT_LC',
          ownerId: 'import-lc-1',
          factsVersion: 'facts-v1',
          approvedContractualMaximumOwner: '1000.00',
          splitInput: {
            functionCode: 'A3',
            transactionCurrency: 'USD',
            ownerCurrency: 'EUR',
            transactionAmountOwner: '120.00',
            importLcTightAvailableOwner: '100.00',
          },
        })),
      },
      policy: { resolve: jest.fn(() => ({ ...policy, configuredMaximumUsd, allowancePercentage })) },
    });

    await expect(service.submit(command)).rejects.toBeInstanceOf(CurrencyMismatchError);
    expect(dependencies.policy.resolve).not.toHaveBeenCalled();
    expect(dependencies.legacy.submit).not.toHaveBeenCalled();
    expect(dependencies.fx.resolveConfiguredMaximum).not.toHaveBeenCalled();
    expect(dependencies.unitOfWork.execute).not.toHaveBeenCalled();
    expect(transaction.persist).not.toHaveBeenCalled();
  });

  test('rejects stale current facts inside the transaction before allowance lock or persistence', async () => {
    const { service, transaction } = createHarness();
    (transaction.assertCurrentFactsVersion as jest.Mock).mockImplementation(() => {
      throw new MakerExcessFactsChangedError('facts-v1');
    });

    await expect(service.submit(command)).rejects.toThrow(MakerExcessFactsChangedError);
    expect(transaction.lockAllowance).not.toHaveBeenCalled();
    expect(transaction.persist).not.toHaveBeenCalled();
  });

  test('rejects current facts for a different command identity before policy, FX or persistence', async () => {
    const { dependencies, service, transaction } = createHarness({
      currentFacts: {
        load: jest.fn(() => ({
          ownerType: 'IMPORT_LC',
          ownerId: 'different-owner',
          factsVersion: 'facts-v1',
          approvedContractualMaximumOwner: '1000.00',
          splitInput: {
            functionCode: 'A3',
            transactionCurrency: 'EUR',
            ownerCurrency: 'EUR',
            transactionAmountOwner: '120.00',
            importLcTightAvailableOwner: '100.00',
          },
        })),
      },
    });

    await expect(service.submit(command)).rejects.toThrow('Current Excess facts do not match the Maker command identity.');
    expect(dependencies.policy.resolve).not.toHaveBeenCalled();
    expect(dependencies.fx.resolveConfiguredMaximum).not.toHaveBeenCalled();
    expect(dependencies.unitOfWork.execute).not.toHaveBeenCalled();
    expect(transaction.persist).not.toHaveBeenCalled();
  });

  test('propagates persistence failure so the unit of work rolls back the idempotency claim and all pending facts', async () => {
    const { calls, dependencies, service, transaction } = createHarness();
    (transaction.persist as jest.Mock).mockImplementation(() => {
      calls.push('persist-failed');
      throw new Error('persistence failed');
    });
    (dependencies.unitOfWork.execute as jest.Mock).mockImplementation((operation: (tx: MakerExcessAtomicTransaction) => unknown) => {
      calls.push('unit-of-work');
      try {
        return operation(transaction);
      } catch (error) {
        calls.push('rollback');
        throw error;
      }
    });

    await expect(service.submit(command)).rejects.toThrow('persistence failed');
    expect(calls).toContain('rollback');
    expect(transaction.claimIdempotency).toHaveBeenCalledTimes(1);
    expect(transaction.persist).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['0', '10'],
    ['1000.00', '0'],
  ])('uses legacy processing when configured maximum=%s or allowance percentage=%s', async (configuredMaximumUsd, allowancePercentage) => {
    const { dependencies, service, transaction } = createHarness({
      policy: { resolve: jest.fn(() => ({ ...policy, configuredMaximumUsd, allowancePercentage })) },
    });

    await expect(service.submit(command)).resolves.toEqual({ kind: 'LEGACY_SUBMIT' });
    expect(dependencies.fx.resolveConfiguredMaximum).not.toHaveBeenCalled();
    expect(dependencies.unitOfWork.execute).not.toHaveBeenCalled();
    expect(transaction.persist).not.toHaveBeenCalled();
  });

  test('uses USD_PAR without an external FX call for a USD owner', async () => {
    const { dependencies, service, transaction } = createHarness({
      currentFacts: {
        load: jest.fn(() => ({
          ownerType: 'IMPORT_LC',
          ownerId: 'import-lc-1',
          factsVersion: 'facts-usd-v1',
          approvedContractualMaximumOwner: '1000.00',
          splitInput: {
            functionCode: 'A3',
            transactionCurrency: 'USD',
            ownerCurrency: 'USD',
            transactionAmountOwner: '120.00',
            importLcTightAvailableOwner: '100.00',
          },
        })),
      },
    });

    const usdCommand = { ...command, ownerCurrency: 'USD' };
    await expect(service.submit(usdCommand)).resolves.toEqual(response());
    expect(dependencies.fx.resolveConfiguredMaximum).not.toHaveBeenCalled();
    expect(transaction.assertCurrentFactsVersion).toHaveBeenCalledWith(usdCommand, 'facts-usd-v1');
    expect(transaction.persist).toHaveBeenCalledWith(
      expect.objectContaining({ fxSnapshot: expect.objectContaining({ rateOrigin: 'USD_PAR', bookingRate: '1' }) }),
    );
  });

  test.each([
    ['A3', { functionCode: 'A3' as const, importLcTightAvailableOwner: '100.00' }],
    ['A3S', { functionCode: 'A3S' as const, baseParentTightAvailableOwner: '40.00', currentSgRedemptionAmountOwner: '60.00' }],
    ['B3', { functionCode: 'B3' as const, confirmationTightAvailableOwner: '100.00' }],
  ])('%s rejects a calculable over-limit command with HTTP 409 and no persistence', async (functionCode, capacity) => {
    const ownerType = functionCode === 'B3' ? 'EXPORT_CONFIRMATION' : 'IMPORT_LC';
    const ownerId = functionCode === 'B3' ? 'confirmation-1' : 'import-lc-1';
    const functionCommand: MakerExcessSubmitCommand = {
      ...command,
      functionCode: functionCode as MakerExcessSubmitCommand['functionCode'],
      ownerType: ownerType as MakerExcessSubmitCommand['ownerType'],
      ownerId,
    };
    const { service, transaction } = createHarness({
      currentFacts: {
        load: jest.fn(() => ({
          ownerType,
          ownerId,
          factsVersion: 'facts-v1',
          approvedContractualMaximumOwner: '1000.00',
          splitInput: {
            ...capacity,
            transactionCurrency: 'EUR',
            ownerCurrency: 'EUR',
            transactionAmountOwner: '120.00',
          },
        })),
      },
      policy: { resolve: jest.fn(() => ({ ...policy, ownerType })) },
    });
    (transaction.lockAllowance as jest.Mock).mockReturnValue({
      excessAccountId: 'excess-account-1',
      version: 3,
      approvedUtilizedOwner: '90.00',
      otherPendingReservedOwner: '5.00',
    });

    await expect(service.submit(functionCommand)).resolves.toMatchObject({
      ok: false,
      httpStatus: 409,
      code: 'EXCESS_LIMIT_EXCEEDED',
      guidance: {
        outcome: 'FINITE',
        minimumRequiredIncreaseOwner: '13.64',
        snapshotTime: command.decisionTime,
        fxContribution: false,
        evidence: {
          transactionAmountOwner: '120',
          effectiveCapacityOwner: '100',
          proposedExcessOwner: '20',
          approvedContractualMaximumOwner: '1000',
          allowancePercentage: '10',
          configuredMaximumOwner: '920',
          approvedUtilizedOwner: '90',
          otherPendingReservedOwner: '5',
          capacityGainPerIncrease: '1',
        },
      },
    });
    expect(transaction.persist).not.toHaveBeenCalled();
  });

  test.each(['FX_RATE_UNAVAILABLE', 'FX_RATE_STALE'] as const)('returns %s before opening the persistence transaction', async (code) => {
    const { dependencies, service, transaction } = createHarness({
      fx: { resolveConfiguredMaximum: jest.fn(async () => ({ ok: false as const, code })) },
    });

    await expect(service.submit(command)).resolves.toEqual({ ok: false, code });
    expect(dependencies.unitOfWork.execute).not.toHaveBeenCalled();
    expect(transaction.lockAllowance).not.toHaveBeenCalled();
    expect(transaction.persist).not.toHaveBeenCalled();
  });
});
