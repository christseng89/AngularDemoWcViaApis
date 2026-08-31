import Decimal from 'decimal.js';
import { MovementReleasePolicyService } from '../../../src/service/movementReleasePolicyService';
import type { MovementRequestValidator } from '../../../src/service/movementRequestValidator';
import type { ContractLifecycleEligibilityService } from '../../../src/service/contractLifecycleEligibilityService';
import type { BalanceMovementStore } from '../../../src/store/balanceMovementStore';
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

function setup(isCreating = false) {
  const movements = { listByContract: jest.fn(() => []) } as unknown as BalanceMovementStore;
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
    validator,
    lifecycle,
    service: new MovementReleasePolicyService(movements, validator, lifecycle, () => isCreating),
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
