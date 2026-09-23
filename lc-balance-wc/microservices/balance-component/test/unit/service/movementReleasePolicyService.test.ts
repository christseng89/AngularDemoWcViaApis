import Decimal from 'decimal.js';
import { MovementReleasePolicyService, type CheckerExcessRuntime } from '../../../src/service/movementReleasePolicyService';
import type { ExcessPolicyConfig } from '../../../src/config/excessPolicyConfig';
import type { CurrencyExchangeQuote } from '../../../src/integration/currencyExchange';
import type { MovementRequestValidator } from '../../../src/service/movementRequestValidator';
import type { ContractLifecycleEligibilityService } from '../../../src/service/contractLifecycleEligibilityService';
import type { BalanceMovementStore } from '../../../src/store/balanceMovementStore';
import type { BalanceContractStore } from '../../../src/store/balanceContractStore';
import type { BalanceContract, BalanceMovement, InstrumentType } from '../../../src/types';

function contract(instrumentType: InstrumentType = 'IPLC_LC', overrides: Partial<BalanceContract> = {}): BalanceContract {
  return {
    balanceContractId: 'contract-1',
    logicalContractId: 'logical-1',
    instrumentType,
    naturalKey: { lcNumber: 'LC001' },
    status: 'ACTIVE',
    currency: 'USD',
    ...overrides,
  } as BalanceContract;
}

function movement(movementType = 'UTILIZE', overrides: Partial<BalanceMovement> = {}): BalanceMovement {
  return {
    movementId: 'movement-1',
    balanceContractId: 'contract-1',
    eventSeq: 2,
    movementType,
    amount: '100',
    ceilingAmount: '100',
    currency: 'USD',
    status: 'PENDING',
    sourceTransactionRef: 'B01',
    exposureNature: 'CONTINGENT',
    createdBy: 'maker1',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as BalanceMovement;
}

function setup(isCreating = false, checkerExcessRuntime?: CheckerExcessRuntime) {
  const movements = { listByContract: jest.fn(() => []), findById: jest.fn() } as unknown as BalanceMovementStore;
  const contracts = { findById: jest.fn() } as unknown as BalanceContractStore;
  const validator = {
    assertValidAmount: jest.fn(),
    assertToleranceNonNegative: jest.fn(),
  } as unknown as MovementRequestValidator;
  const lifecycle = {
    evaluateClose: jest.fn(() => ({ eligible: true, reasons: [] })),
    evaluateExpiry: jest.fn(() => ({ eligible: true, reasons: [] })),
    gatherEventTree: jest.fn(() => ({ hasOpenEvents: false })),
  } as unknown as ContractLifecycleEligibilityService;
  return {
    movements,
    contracts,
    validator,
    lifecycle,
    service: new MovementReleasePolicyService(movements, contracts, validator, lifecycle, () => isCreating, checkerExcessRuntime),
  };
}

const checkerPolicy: Readonly<ExcessPolicyConfig> = {
  policyVersion: 'checker-policy-v1',
  ownerType: 'IMPORT_LC',
  allowancePercentage: '10',
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

const checkerQuote: CurrencyExchangeQuote = {
  fromCurrency: 'USD',
  toCurrency: 'EUR',
  requestedAmount: '1000',
  ratePurpose: 'BOOKING',
  bookingRate: '0.92',
  convertedAmount: '920',
  rateOrigin: 'PROVIDER_SUPPLIED',
  rateSource: 'PROVIDER',
  providerRateId: 'checker-rate-1',
  providerRateVersion: 'opaque-v1',
  requestAttemptId: 'checker-attempt-1',
  rateTimestamp: '2026-09-22T00:00:00.000Z',
  approvalStatus: 'APPROVED',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: null,
  correlationId: 'movement-1',
  policyVersion: 'checker-policy-v1',
};

function checkerRuntime(overrides: Partial<CheckerExcessRuntime> = {}): CheckerExcessRuntime {
  return {
    ownerIdentity: {
      load: jest.fn((_movement, owner) => ({ ownerType: 'IMPORT_LC', ownerId: owner.logicalContractId, ownerCurrency: owner.currency })),
    },
    currentFacts: {
      load: jest.fn(() => ({
        ownerType: 'IMPORT_LC',
        ownerId: 'logical-1',
        ownerCurrency: 'EUR',
        approvedContractualMaximumOwner: '100',
        proposedExcessOwner: '20',
        excessAccountId: 'excess-account-1',
        factsVersion: 'facts-v2',
      })),
    },
    policy: { resolve: jest.fn(() => checkerPolicy) },
    allowance: {
      loadExcludingMovement: jest.fn(() => ({ approvedUtilizedOwner: '0', otherPendingReservedOwner: '0' })),
    },
    fx: { resolveConfiguredMaximum: jest.fn(async () => ({ ok: true as const, quote: checkerQuote })) },
    ...overrides,
  };
}

describe('MovementReleasePolicyService submit guards', () => {
  it('rechecks amount and enforces the A4/A6 Maker Submit gate', () => {
    const { service, validator } = setup();
    const utilize = movement();

    expect(() => service.assertSubmitGuards(utilize, contract(), true)).toThrow(/requires a Maker Submit/);
    expect(validator.assertValidAmount).toHaveBeenCalledWith('UTILIZE', '100');
    expect(() => service.assertSubmitGuards({ ...utilize, makerSubmittedAt: '2026-01-02' }, contract(), true)).not.toThrow();
  });

  it('requires the configured secondary reference again at Release time', () => {
    const { service } = setup();
    expect(() => service.assertSubmitGuards(movement('UTILIZE', { sourceTransactionRef: null }), contract(), false)).toThrow(
      'sourceTransactionRef is required for UTILIZE.',
    );
    expect(() => service.assertSubmitGuards(movement('UTILIZE', { sourceTransactionRef: 'B01' }), contract(), false)).not.toThrow();
  });

  it('rechecks creating-movement natural key, tenor, tolerance and expiry business day', () => {
    const { service, validator } = setup(true);
    const issue = movement('ISSUE');

    expect(() => service.assertSubmitGuards(issue, contract('IPLC_LC', { naturalKey: { lcNumber: '' } }), false)).toThrow('naturalKey.lcNumber is required');
    expect(() => service.assertSubmitGuards(issue, contract('SHGT', { naturalKey: { lcNumber: 'LC001' } }), false)).toThrow('naturalKey.sgNumber is required');
    expect(() => service.assertSubmitGuards(issue, contract('IPLC_LC', { tenorType: null }), false)).toThrow('tenorType is required');
    expect(() => service.assertSubmitGuards(issue, contract('IPLC_LC', { tenorType: 'BUYERS_USANCE', tenorDays: 0 }), false)).toThrow(
      'tenorDays must be greater than 0',
    );
    expect(() => service.assertSubmitGuards(issue, contract('IPLC_LC', { tenorType: 'SIGHT', expiryDate: '2026-08-30' }), false)).toThrow(
      'domestic non-business day',
    );
    expect(() => service.assertSubmitGuards(issue, contract('IPLC_LC', { tenorType: 'SIGHT', expiryDate: '2026-08-31' }), false)).not.toThrow();
    expect(validator.assertToleranceNonNegative).toHaveBeenCalled();
  });
});

describe('MovementReleasePolicyService eligibility', () => {
  it('rejects an inactive ordinary contract and a missing referenced source', () => {
    const { service, movements } = setup();
    expect(() => service.assertEligibility(movement('AMEND_INCREASE'), contract('IPLC_LC', { status: 'CLOSED' }), new Decimal(0))).toThrow(
      'contract status is now CLOSED',
    );
    jest.mocked(movements.findById).mockReturnValue(undefined);
    expect(() =>
      service.assertEligibility(
        movement('CREATE', { referencedTransactionId: 'missing-source' }),
        contract('IPLC_ACCEPTANCE', { parentLogicalContractId: 'lc-logical' }),
        new Decimal(0),
      ),
    ).toThrow('referenced source transaction no longer exists');
  });

  it('rechecks A6 and B4 referenced sources against current state', () => {
    const { service, movements, contracts } = setup();
    const a3 = movement('UTILIZE', {
      movementId: 'a3',
      balanceContractId: 'lc-contract',
      acknowledgedAt: '2026-01-01',
      makerSubmittedAt: '2026-01-02',
    });
    jest.mocked(movements.findById).mockReturnValue(a3);
    jest.mocked(contracts.findById).mockReturnValue(contract('IPLC_LC', { balanceContractId: 'lc-contract', logicalContractId: 'lc-logical' }));
    const a6 = movement('CREATE', { referencedTransactionId: 'a3' });
    const acceptance = contract('IPLC_ACCEPTANCE', { parentLogicalContractId: 'lc-logical' });
    expect(() => service.assertEligibility(a6, acceptance, new Decimal(0))).not.toThrow();
    jest.mocked(movements.findById).mockReturnValue({ ...a3, status: 'RELEASED' });
    expect(() => service.assertEligibility(a6, acceptance, new Decimal(0))).not.toThrow();
    jest.mocked(movements.findById).mockReturnValue({ ...a3, status: 'REJECTED' });
    expect(() => service.assertEligibility(a6, acceptance, new Decimal(0))).toThrow('A3/A3S source is no longer');

    const b3 = movement('CREATE', { movementId: 'b3', balanceContractId: 'exam', status: 'RELEASED', presentDocsConsumedAt: null });
    jest.mocked(movements.findById).mockReturnValue(b3);
    jest
      .mocked(contracts.findById)
      .mockReturnValue(contract('EPLC_EXAMINATION', { balanceContractId: 'exam', parentLogicalContractId: 'confirmation-logical' }));
    const b4 = movement('ACCEPT', { referencedTransactionId: 'b3' });
    const confirmation = contract('EPLC_CONFIRMATION', { balanceContractId: 'confirmation', logicalContractId: 'confirmation-logical' });
    expect(() => service.assertEligibility(b4, confirmation, new Decimal(0))).not.toThrow();
    jest.mocked(movements.findById).mockReturnValue({ ...b3, presentDocsConsumedAt: '2026-01-03' });
    expect(() => service.assertEligibility(b4, confirmation, new Decimal(0))).toThrow('B3 source is no longer');
  });

  it.each(['CLOSE', 'EXPIRE'] as const)('%s rejects stale eligibility and a changed frozen balance', (movementType) => {
    const { service, lifecycle } = setup();
    const candidate = movement(movementType);
    const eligibilityMethod = movementType === 'CLOSE' ? lifecycle.evaluateClose : lifecycle.evaluateExpiry;
    jest.mocked(eligibilityMethod).mockReturnValueOnce({ eligible: false, reasons: ['open event'] });

    expect(() => service.assertEligibility(candidate, contract(), new Decimal(100))).toThrow('eligibility no longer holds: open event');
    expect(() => service.assertEligibility(candidate, contract(), new Decimal(99))).toThrow('Confirmed Balance has changed since Submit');
    expect(() => service.assertEligibility(candidate, contract(), new Decimal(100))).not.toThrow();
  });

  it('rechecks REOPEN status, open events and the current restoration chain', () => {
    const { service, movements, lifecycle } = setup();
    const reopen = movement('REOPEN', { ceilingAmount: '100' });
    const closed = contract('IPLC_LC', { status: 'CLOSED' });

    expect(() => service.assertEligibility(reopen, contract(), new Decimal(0))).toThrow('no longer CLOSED');
    jest.mocked(lifecycle.gatherEventTree).mockReturnValueOnce({ hasOpenEvents: true } as ReturnType<ContractLifecycleEligibilityService['gatherEventTree']>);
    expect(() => service.assertEligibility(reopen, closed, new Decimal(0))).toThrow('not yet fully resolved');

    jest
      .mocked(movements.listByContract)
      .mockReturnValue([
        movement('ISSUE', { movementId: 'issue', eventSeq: 1, status: 'RELEASED', ceilingAmount: '100' }),
        movement('CLOSE', { movementId: 'close', eventSeq: 2, status: 'RELEASED', ceilingAmount: '100' }),
        reopen,
      ]);
    expect(() => service.assertEligibility({ ...reopen, ceilingAmount: '99' }, closed, new Decimal(0))).toThrow('amount to restore has changed');
    expect(() => service.assertEligibility(reopen, closed, new Decimal(0))).not.toThrow();
  });

  it('rejects a standalone SHGT Partial Redeem but permits a business-event-linked leg', () => {
    const { service } = setup();
    const sg = contract('SHGT');
    expect(() => service.assertEligibility(movement('PARTIAL_REDEEM'), sg, new Decimal(0))).toThrow('must be Full Redeem only');
    expect(() => service.assertEligibility(movement('PARTIAL_REDEEM', { businessEventId: 'event-1' }), sg, new Decimal(0))).not.toThrow();
  });
});

describe('MovementReleasePolicyService Checker Excess revaluation', () => {
  const releaseInput = {
    movementId: 'movement-1',
    checkerContext: 'checker-1',
    idempotencyKey: 'release-key-1',
    decisionTime: '2026-09-22T00:01:00.000Z',
  };

  it('rejects an unconfigured runtime and missing current movement or contract facts', async () => {
    await expect(setup().service.revalueExcessAtCheckerRelease(releaseInput)).rejects.toThrow('runtime is not configured');

    const missingMovement = setup(false, checkerRuntime());
    await expect(missingMovement.service.revalueExcessAtCheckerRelease(releaseInput)).rejects.toThrow('No BalanceMovement movement-1');

    const missingContract = setup(false, checkerRuntime());
    jest.mocked(missingContract.movements.findById).mockReturnValue(movement());
    await expect(missingContract.service.revalueExcessAtCheckerRelease(releaseInput)).rejects.toThrow('No BalanceContract contract-1');
  });

  it('rejects mismatched policy ownership, owner facts and missing precision', async () => {
    const policyMismatch = checkerRuntime({
      policy: { resolve: jest.fn(() => ({ ...checkerPolicy, ownerType: 'EXPORT_CONFIRMATION' })) },
    });
    const first = setup(false, policyMismatch);
    jest.mocked(first.movements.findById).mockReturnValue(movement('UTILIZE', { currency: 'EUR' }));
    jest.mocked(first.contracts.findById).mockReturnValue(contract('IPLC_LC', { currency: 'EUR' }));
    await expect(first.service.revalueExcessAtCheckerRelease(releaseInput)).rejects.toThrow('policy owner type does not match');

    const missingPrecision = checkerRuntime({
      policy: { resolve: jest.fn(() => ({ ...checkerPolicy, currencyPrecisions: { USD: 2 } })) },
    });
    const second = setup(false, missingPrecision);
    jest.mocked(second.movements.findById).mockReturnValue(movement('UTILIZE', { currency: 'EUR' }));
    jest.mocked(second.contracts.findById).mockReturnValue(contract('IPLC_LC', { currency: 'EUR' }));
    await expect(second.service.revalueExcessAtCheckerRelease(releaseInput)).rejects.toThrow('Missing owner-currency precision for EUR');

    const mismatchedFacts = checkerRuntime({
      currentFacts: {
        load: jest.fn(() => ({
          ownerType: 'IMPORT_LC',
          ownerId: 'different-owner',
          ownerCurrency: 'EUR',
          approvedContractualMaximumOwner: '100',
          proposedExcessOwner: '20',
          excessAccountId: 'excess-account-1',
          factsVersion: 'facts-mismatch',
        })),
      },
    });
    const third = setup(false, mismatchedFacts);
    jest.mocked(third.movements.findById).mockReturnValue(movement('UTILIZE', { currency: 'EUR' }));
    jest.mocked(third.contracts.findById).mockReturnValue(contract('IPLC_LC', { currency: 'EUR' }));
    await expect(third.service.revalueExcessAtCheckerRelease(releaseInput)).rejects.toThrow('do not match the resolved allowance owner identity');
  });

  it('returns NOT_REQUIRED and ELIGIBLE when current capacity fully covers the pending transaction', async () => {
    const runtime = checkerRuntime({
      currentFacts: {
        load: jest.fn(() => ({
          ownerType: 'IMPORT_LC',
          ownerId: 'logical-1',
          ownerCurrency: 'EUR',
          approvedContractualMaximumOwner: '100',
          proposedExcessOwner: '0',
          excessAccountId: 'excess-account-1',
          factsVersion: 'facts-no-excess',
        })),
      },
    });
    const { service, movements, contracts } = setup(false, runtime);
    jest.mocked(movements.findById).mockReturnValue(movement('UTILIZE', { currency: 'EUR' }));
    jest.mocked(contracts.findById).mockReturnValue(contract('IPLC_LC', { currency: 'EUR' }));

    await expect(service.revalueExcessAtCheckerRelease(releaseInput)).resolves.toMatchObject({
      ok: true,
      excessDecision: 'NOT_REQUIRED',
      businessResultCode: null,
      releaseEligibility: 'ELIGIBLE',
    });
  });

  it('re-reads movement, contract, linked facts, current policy, latest Booking rate and allowance on every attempt', async () => {
    const runtime = checkerRuntime();
    const { service, movements, contracts } = setup(false, runtime);
    const pending = movement('UTILIZE', { currency: 'EUR' });
    const owner = contract('IPLC_LC', { currency: 'EUR' });
    jest.mocked(movements.findById).mockReturnValue(pending);
    jest.mocked(contracts.findById).mockReturnValue(owner);

    await expect(service.revalueExcessAtCheckerRelease(releaseInput)).resolves.toMatchObject({
      ok: true,
      excessDecision: 'LIMIT_EXCEEDED',
      businessResultCode: 'EXCESS_LIMIT_EXCEEDED',
      releaseEligibility: 'BLOCKED',
      effectiveLimitOwner: '10',
    });
    await expect(service.revalueExcessAtCheckerRelease({ ...releaseInput, idempotencyKey: 'release-key-2' })).resolves.toMatchObject({ ok: true });

    expect(movements.findById).toHaveBeenCalledTimes(2);
    expect(contracts.findById).toHaveBeenCalledTimes(2);
    expect(runtime.currentFacts.load).toHaveBeenCalledTimes(2);
    expect(runtime.policy.resolve).toHaveBeenCalledTimes(2);
    expect(runtime.fx.resolveConfiguredMaximum).toHaveBeenCalledTimes(2);
    expect(runtime.allowance.loadExcludingMovement).toHaveBeenCalledTimes(2);
    expect(runtime.fx.resolveConfiguredMaximum).toHaveBeenLastCalledWith(
      expect.objectContaining({
        commandIdempotencyKey: 'release-key-2',
        request: expect.objectContaining({
          fromCurrency: 'USD',
          toCurrency: 'EUR',
          amount: '1000',
          ratePurpose: 'BOOKING',
          decisionTime: releaseInput.decisionTime,
          correlationId: 'movement-1',
        }),
      }),
    );
  });

  it.each(['FX_RATE_UNAVAILABLE', 'FX_RATE_STALE'] as const)('returns %s without reading allowance', async (code) => {
    const runtime = checkerRuntime({ fx: { resolveConfiguredMaximum: jest.fn(async () => ({ ok: false as const, code })) } });
    const { service, movements, contracts } = setup(false, runtime);
    jest.mocked(movements.findById).mockReturnValue(movement('UTILIZE', { currency: 'EUR' }));
    jest.mocked(contracts.findById).mockReturnValue(contract('IPLC_LC', { currency: 'EUR' }));

    await expect(service.revalueExcessAtCheckerRelease(releaseInput)).resolves.toMatchObject({
      ok: false,
      code,
      auditContext: {
        movementId: 'movement-1',
        ownerType: 'IMPORT_LC',
        ownerId: 'logical-1',
        ownerCurrency: 'EUR',
        policyVersion: 'checker-policy-v1',
        requestedAmountUsd: '1000',
      },
    });
    expect(runtime.allowance.loadExcludingMovement).not.toHaveBeenCalled();
  });

  it('uses USD_PAR without a provider call for USD owners', async () => {
    const runtime = checkerRuntime({
      currentFacts: {
        load: jest.fn(() => ({
          ownerType: 'IMPORT_LC',
          ownerId: 'logical-1',
          ownerCurrency: 'USD',
          approvedContractualMaximumOwner: '100',
          proposedExcessOwner: '5',
          excessAccountId: 'excess-account-1',
          factsVersion: 'facts-usd',
        })),
      },
    });
    const { service, movements, contracts } = setup(false, runtime);
    jest.mocked(movements.findById).mockReturnValue(movement());
    jest.mocked(contracts.findById).mockReturnValue(contract());

    await expect(service.revalueExcessAtCheckerRelease(releaseInput)).resolves.toMatchObject({
      ok: true,
      fxSnapshot: { rateOrigin: 'USD_PAR', bookingRate: '1', convertedAmount: '1000' },
    });
    expect(runtime.fx.resolveConfiguredMaximum).not.toHaveBeenCalled();
  });

  it.each([
    ['percentage', { allowancePercentage: '0' }],
    ['configured maximum', { configuredMaximumUsd: '0' }],
  ] as const)('keeps a zero %s on the legacy Checker path with no FX or allowance lookup', async (_label, zeroField) => {
    const runtime = checkerRuntime({ policy: { resolve: jest.fn(() => ({ ...checkerPolicy, ...zeroField })) } });
    const { service, movements, contracts } = setup(false, runtime);
    jest.mocked(movements.findById).mockReturnValue(movement('UTILIZE', { currency: 'EUR' }));
    jest.mocked(contracts.findById).mockReturnValue(contract('IPLC_LC', { currency: 'EUR' }));

    await expect(service.revalueExcessAtCheckerRelease(releaseInput)).resolves.toEqual({ kind: 'LEGACY_RELEASE' });
    expect(runtime.currentFacts.load).not.toHaveBeenCalled();
    expect(runtime.fx.resolveConfiguredMaximum).not.toHaveBeenCalled();
    expect(runtime.allowance.loadExcludingMovement).not.toHaveBeenCalled();
  });
});
