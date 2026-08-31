import { MovementReleaseSideEffectService, type ReleaseSideEffectCommandPort } from '../../../src/service/movementReleaseSideEffectService';
import type { ContractLifecycleEligibilityService } from '../../../src/service/contractLifecycleEligibilityService';
import type { BalanceContractStore } from '../../../src/store/balanceContractStore';
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
    status: 'RELEASED',
    exposureNature: 'CONTINGENT',
    createdBy: 'maker1',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as BalanceMovement;
}

function setup() {
  const contracts = {
    findById: jest.fn(),
    markClosed: jest.fn(),
    markExpired: jest.fn(),
    reactivate: jest.fn(),
  } as unknown as BalanceContractStore;
  const movements = {
    findById: jest.fn(),
    markPresentDocsConsumed: jest.fn(),
    listByContract: jest.fn(() => []),
  } as unknown as BalanceMovementStore;
  const lifecycle = {
    gatherEventTree: jest.fn(() => ({ hasOpenEvents: false })),
  } as unknown as ContractLifecycleEligibilityService;
  const commands = {
    createMovement: jest.fn(),
    release: jest.fn(),
  } as unknown as ReleaseSideEffectCommandPort;
  return {
    contracts,
    movements,
    lifecycle,
    commands,
    service: new MovementReleaseSideEffectService(contracts, movements, lifecycle, commands, () => 777),
  };
}

describe('MovementReleaseSideEffectService standard effects', () => {
  it('marks a referenced B3 presentation consumed for B4', () => {
    const { service, contracts, movements } = setup();
    const b3 = movement('CREATE', { movementId: 'b3', balanceContractId: 'exam-contract' });
    jest.mocked(movements.findById).mockReturnValue(b3);
    jest.mocked(contracts.findById).mockReturnValue(contract('EPLC_EXAMINATION', { balanceContractId: 'exam-contract' }));

    service.applyStandard(movement('HONOUR', { referencedTransactionId: 'b3' }), contract('EPLC_CONFIRMATION'), 'checker1', '2026-01-02');

    expect(movements.markPresentDocsConsumed).toHaveBeenCalledWith({
      movementId: 'b3',
      presentDocsConsumedBy: 'checker1',
      presentDocsConsumedAt: '2026-01-02',
    });
  });

  it('recursively finalizes a pending referenced A3/A3S UTILIZE for A6', () => {
    const { service, contracts, movements, commands } = setup();
    const utilize = movement('UTILIZE', { movementId: 'a3', status: 'PENDING' });
    jest.mocked(movements.findById).mockReturnValue(utilize);
    jest.mocked(contracts.findById).mockReturnValue(contract('IPLC_LC'));

    service.applyStandard(movement('CREATE', { referencedTransactionId: 'a3' }), contract('IPLC_ACCEPTANCE'), 'checker1', '2026-01-02');

    expect(commands.release).toHaveBeenCalledWith('a3', 'checker1');
  });

  it('applies Close, Expire and both Reopen target statuses', () => {
    const { service, contracts } = setup();
    service.applyStandard(movement('CLOSE'), contract(), 'checker', '2026-01-02');
    service.applyStandard(movement('EXPIRE'), contract(), 'checker', '2026-01-02');
    service.applyStandard(movement('REOPEN'), contract('IPLC_LC', { expiryDate: '2026-02-01' }), 'checker', '2026-01-02');
    service.applyStandard(movement('REOPEN'), contract('IPLC_LC', { expiryDate: '2025-12-01' }), 'checker', '2026-01-02');

    expect(contracts.markClosed).toHaveBeenCalledWith('contract-1', '2026-01-02');
    expect(contracts.markExpired).toHaveBeenCalledWith('contract-1', '2026-01-02');
    expect(contracts.reactivate).toHaveBeenCalledWith('contract-1', 'ACTIVE', '2026-01-02');
    expect(contracts.reactivate).toHaveBeenCalledWith('contract-1', 'EXPIRED', '2026-01-02');
  });
});

describe('MovementReleaseSideEffectService expiry amendment', () => {
  it('ignores other movement types and applies a plain ACTIVE expiry amendment', () => {
    const { service, contracts } = setup();
    service.applyExpiryAmendment(movement('UTILIZE'), contract(), 'checker', '2026-01-02');
    expect(contracts.reactivate).not.toHaveBeenCalled();

    service.applyExpiryAmendment(movement('AMEND_EXPIRY_DATE', { newExpiryDate: '2026-03-01' }), contract(), 'checker', '2026-01-02');
    expect(contracts.reactivate).toHaveBeenCalledWith('contract-1', 'ACTIVE', '2026-01-02', '2026-03-01');
  });

  it('preserves status, required-date and future-date release guards', () => {
    const { service } = setup();
    expect(() =>
      service.applyExpiryAmendment(
        movement('AMEND_EXPIRY_DATE', { newExpiryDate: '2026-03-01' }),
        contract('IPLC_LC', { status: 'CLOSED' }),
        'c',
        '2026-01-02',
      ),
    ).toThrow('no longer ACTIVE or EXPIRED');
    expect(() => service.applyExpiryAmendment(movement('AMEND_EXPIRY_DATE'), contract(), 'c', '2026-01-02')).toThrow('has no newExpiryDate');
    expect(() => service.applyExpiryAmendment(movement('AMEND_EXPIRY_DATE', { newExpiryDate: '2026-01-01' }), contract(), 'c', '2026-01-02')).toThrow(
      'no longer strictly later',
    );
  });

  it('blocks an EXPIRED extension with open events', () => {
    const { service, lifecycle } = setup();
    jest.mocked(lifecycle.gatherEventTree).mockReturnValue({ hasOpenEvents: true } as ReturnType<ContractLifecycleEligibilityService['gatherEventTree']>);
    expect(() =>
      service.applyExpiryAmendment(
        movement('AMEND_EXPIRY_DATE', { newExpiryDate: '2026-03-01' }),
        contract('IPLC_LC', { status: 'EXPIRED' }),
        'checker',
        '2026-01-02',
      ),
    ).toThrow('not yet fully resolved');
  });

  it('creates and releases a REVERSAL only when RELEASED EXPIRE is the trailing event', () => {
    const { service, contracts, movements, commands } = setup();
    const expired = contract('IPLC_LC', { status: 'EXPIRED' });
    const expire = movement('EXPIRE', { movementId: 'expire', eventSeq: 2 });
    const amendment = movement('AMEND_EXPIRY_DATE', { movementId: 'amend', eventSeq: 3, newExpiryDate: '2026-03-01', businessEventId: 'event-1' });
    jest.mocked(movements.listByContract).mockReturnValue([movement('ISSUE', { eventSeq: 1 }), expire, amendment]);
    jest.mocked(contracts.findById).mockReturnValue(expired);
    jest.mocked(commands.createMovement).mockReturnValue({ created: true, movement: movement('REVERSAL', { movementId: 'reversal' }) });

    service.applyExpiryAmendment(amendment, expired, 'checker', '2026-01-02');

    expect(commands.createMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        movementType: 'REVERSAL',
        eventSeq: 777,
        reversalOfMovementId: 'expire',
        businessEventId: 'event-1',
      }),
    );
    expect(commands.release).toHaveBeenCalledWith('reversal', 'checker');
    expect(contracts.reactivate).toHaveBeenCalledWith('contract-1', 'ACTIVE', '2026-01-02', '2026-03-01');
  });

  it('reports a REVERSAL idempotency conflict and does not release it', () => {
    const { service, contracts, movements, commands } = setup();
    const expired = contract('IPLC_LC', { status: 'EXPIRED' });
    const expire = movement('EXPIRE', { movementId: 'expire', eventSeq: 1 });
    const amendment = movement('AMEND_EXPIRY_DATE', { movementId: 'amend', eventSeq: 2, newExpiryDate: '2026-03-01' });
    jest.mocked(movements.listByContract).mockReturnValue([expire, amendment]);
    jest.mocked(contracts.findById).mockReturnValue(expired);
    jest.mocked(commands.createMovement).mockReturnValue({ created: false, existing: movement('REVERSAL') });

    expect(() => service.applyExpiryAmendment(amendment, expired, 'checker', '2026-01-02')).toThrow('Unexpected idempotency conflict');
    expect(commands.release).not.toHaveBeenCalled();
  });
});
