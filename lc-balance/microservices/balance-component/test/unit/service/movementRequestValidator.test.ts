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

  it('keeps the A3S cross-record amount invariant behind the movement-history port', () => {
    const redemption = { movementId: 'sg-redemption', balanceContractId: 'sg-1', movementType: 'FULL_REDEEM' } as BalanceMovement;
    const issue = { movementId: 'sg-issue', balanceContractId: 'sg-1', movementType: 'ISSUE', status: 'RELEASED', ceilingAmount: '500' } as BalanceMovement;
    movements.findByBusinessEventId.mockReturnValue([redemption]);
    movements.listByContract.mockReturnValue([issue, redemption]);

    expect(() => validator.assertA3SBillCoversShippingGuarantee('event-1', '499')).toThrow(
      'A3S Bill Amount must be greater than or equal to the Shipping Guarantee Balance (500).',
    );
  });
});
