import { MovementRequestValidator } from '../../../src/service/movementRequestValidator';
import type { CreateMovementRequest } from '../../../src/service/balanceService';
import type { BalanceMovement } from '../../../src/types';

function request(overrides: Partial<CreateMovementRequest> = {}): CreateMovementRequest {
  return {
    instrumentType: 'IPLC_LC',
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '1000',
    currency: 'USD',
    naturalKey: { lcNumber: 'LC001' },
    tenorType: 'SIGHT',
    expiryDate: '2026-09-01',
    createdBy: 'maker1',
    ...overrides,
  };
}

describe('MovementRequestValidator', () => {
  const movements = {
    findByBusinessEventId: jest.fn<BalanceMovement[], [string]>(),
    listByContract: jest.fn<BalanceMovement[], [string]>(),
  };
  const validator = new MovementRequestValidator(movements, (movementType) => movementType === 'ISSUE' || movementType === 'CREATE');

  beforeEach(() => jest.clearAllMocks());

  it('accepts a complete root ISSUE request', () => {
    expect(() => validator.validateCreateRequest(request())).not.toThrow();
  });

  it('preserves the exact positive-amount validation error contract', () => {
    expect(() => validator.assertValidAmount('UTILIZE', '0')).toThrow('amount "0" must be greater than 0.');
  });

  it.each(['AMEND_INCREASE', 'AMEND_DECREASE', 'AMEND'])('allows zero Amount for %s so Tolerance-only amendments can use the API', (movementType) => {
    expect(() => validator.assertValidAmount(movementType, '0')).not.toThrow();
  });

  it('still rejects a negative typed Amount for A2 while B2 AMEND retains its signed wire convention', () => {
    expect(() => validator.assertValidAmount('AMEND_INCREASE', '-1')).toThrow('must not be negative');
    expect(() => validator.assertValidAmount('AMEND_DECREASE', '-1')).toThrow('must not be negative');
    expect(() => validator.assertValidAmount('AMEND', '-1')).not.toThrow();
  });

  it('requires a monetary amendment to change Amount, Tolerance, or both', () => {
    expect(() => validator.assertMonetaryAmendmentChangesTerms('AMEND_INCREASE', '0', '0', '20')).toThrow(
      'must change Amount, Tolerance, or both',
    );
    expect(() => validator.assertMonetaryAmendmentChangesTerms('AMEND_INCREASE', '0', '5', '20')).not.toThrow();
    expect(() => validator.assertMonetaryAmendmentChangesTerms('AMEND_INCREASE', '100', undefined, '20')).not.toThrow();
    expect(() => validator.assertMonetaryAmendmentChangesTerms('UTILIZE', '0', undefined, undefined)).not.toThrow();
  });

  it('enforces protected result and amendment-only change inputs', () => {
    expect(() => validator.assertToleranceChangeAllowed('AMEND_INCREASE', '15', '5', 'INCREASE')).toThrow('tolerancePct is calculated by the system');
    expect(() => validator.assertToleranceChangeAllowed('UTILIZE', null, '5', 'INCREASE')).toThrow('only allowed for Amendment');
    expect(() => validator.assertToleranceChangeAllowed('AMEND', null, '5', null)).toThrow('toleranceChangeDirection is required');
    expect(() => validator.assertToleranceChangeAllowed('AMEND_DECREASE', null, '5', 'DECREASE')).not.toThrow();
  });

  it('requires the instrument-specific natural key for a creating movement', () => {
    expect(() =>
      validator.validateCreateRequest(
        request({ instrumentType: 'SHGT', movementType: 'CREATE', naturalKey: { lcNumber: 'LC001' }, expiryDate: null, tenorType: null }),
      ),
    ).toThrow('naturalKey.sgNumber is required for CREATE against SHGT.');
  });

  it('rejects a negative tolerance without involving persistence', () => {
    expect(() => validator.assertToleranceNonNegative('-0.01')).toThrow('tolerancePct "-0.01" must not be negative.');
  });

  it('requires whole-number tolerance for A1/B1 and whole-number changes for A2/B2', () => {
    expect(() => validator.assertToleranceNonNegative('10.5')).toThrow('tolerancePct "10.5" must be a whole number.');
    expect(() => validator.assertToleranceNonNegative('10')).not.toThrow();
    expect(() => validator.assertToleranceChangeAllowed('AMEND', null, '2.5', 'INCREASE')).toThrow(
      'toleranceChangePct "2.5" must be a whole number.',
    );
    expect(() => validator.assertToleranceChangeAllowed('AMEND', null, '2', 'INCREASE')).not.toThrow();
  });

  it('keeps the A3S cross-record amount invariant behind the movement-history port', () => {
    const redemption = { movementId: 'sg-redemption', balanceContractId: 'sg-1', movementType: 'FULL_REDEEM' } as BalanceMovement;
    const issue = { movementId: 'sg-issue', balanceContractId: 'sg-1', movementType: 'ISSUE', status: 'RELEASED', ceilingAmount: '500' } as BalanceMovement;
    movements.findByBusinessEventId.mockReturnValue([redemption]);
    movements.listByContract.mockReturnValue([issue, redemption]);

    expect(() => validator.assertA3SBillCoversShippingGuarantee('event-1', '499')).toThrow(
      'A3S Bill Amount must be greater than or equal to the Shipping Guarantee Balance (500).',
    );
  });

  it('skips A3S cross-record validation when there is no businessEventId', () => {
    expect(() => validator.assertA3SBillCoversShippingGuarantee(undefined, '500')).not.toThrow();
    expect(movements.findByBusinessEventId).not.toHaveBeenCalled();
  });

  it('rejects an A3S event without exactly one SG redemption', () => {
    movements.findByBusinessEventId.mockReturnValue([]);
    expect(() => validator.assertA3SBillCoversShippingGuarantee('event-empty', '500')).toThrow(/exactly one Shipping Guarantee redemption/);
  });
});
