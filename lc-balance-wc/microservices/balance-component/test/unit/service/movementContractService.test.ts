import { MovementContractService, type NewContractPolicyPort } from '../../../src/service/movementContractService';
import type { CreateMovementRequest } from '../../../src/service/balanceService';
import type { BalanceContractStore } from '../../../src/store/balanceContractStore';
import type { BalanceMovementStore } from '../../../src/store/balanceMovementStore';
import type { BalanceContract, BalanceMovement, InstrumentType } from '../../../src/types';

function contract(instrumentType: InstrumentType = 'IPLC_LC', overrides: Partial<BalanceContract> = {}): BalanceContract {
  return {
    balanceContractId: 'contract-1',
    logicalContractId: 'logical-1',
    contractVersion: 1,
    instrumentType,
    naturalKey: { lcNumber: 'LC001' },
    status: 'ACTIVE',
    currency: 'USD',
    ...overrides,
  } as BalanceContract;
}

function request(overrides: Partial<CreateMovementRequest> = {}): CreateMovementRequest {
  return {
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber: 'LC001' },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '100',
    currency: 'USD',
    createdBy: 'maker1',
    ...overrides,
  };
}

function issue(status: BalanceMovement['status'] = 'RELEASED'): BalanceMovement {
  return { movementId: 'issue', movementType: 'ISSUE', status } as BalanceMovement;
}

function setup(isCreating = true) {
  const contracts = {
    findById: jest.fn(),
    findActiveByNaturalKey: jest.fn(),
    findExpiredByNaturalKey: jest.fn(),
    findClosedByNaturalKey: jest.fn(),
    findActiveByLogicalContractId: jest.fn(),
    insert: jest.fn(),
  } as unknown as BalanceContractStore;
  const movements = { findById: jest.fn(), listByContract: jest.fn(() => [issue()]) } as unknown as BalanceMovementStore;
  const policies = {
    isCreatingMovement: jest.fn(() => isCreating),
    assertCreationSufficiency: jest.fn(),
  } as NewContractPolicyPort;
  return {
    contracts,
    movements,
    policies,
    service: new MovementContractService(
      contracts,
      movements,
      policies,
      () => '2026-01-02T00:00:00.000Z',
      () => 'generated-id',
    ),
  };
}

describe('MovementContractService', () => {
  it('resolves by id and preserves existing-contract currency validation', () => {
    const { service, contracts } = setup(false);
    jest.mocked(contracts.findById).mockReturnValue(contract());
    expect(service.resolveOrCreate(request({ balanceContractId: 'contract-1', naturalKey: undefined, movementType: 'UTILIZE' }))).toMatchObject({
      balanceContractId: 'contract-1',
    });
    expect(() =>
      service.resolveOrCreate(request({ balanceContractId: 'contract-1', naturalKey: undefined, movementType: 'UTILIZE', currency: 'EUR' })),
    ).toThrow('does not match this contract');
  });

  it('uses the dedicated EXPIRED and CLOSED natural-key resolvers', () => {
    const { service, contracts } = setup(false);
    const expired = contract('IPLC_LC', { status: 'EXPIRED' });
    const closed = contract('IPLC_LC', { status: 'CLOSED' });
    jest.mocked(contracts.findExpiredByNaturalKey).mockReturnValue(expired);
    jest.mocked(contracts.findClosedByNaturalKey).mockReturnValue(closed);
    expect(service.resolveOrCreate(request({ movementType: 'AMEND_EXPIRY_DATE' }))).toBe(expired);
    expect(service.resolveOrCreate(request({ movementType: 'REOPEN' }))).toBe(closed);
  });

  it('rejects duplicate creation and an existing root whose ISSUE is not Released', () => {
    const duplicateSetup = setup(true);
    jest.mocked(duplicateSetup.contracts.findActiveByNaturalKey).mockReturnValue(contract());
    expect(() => duplicateSetup.service.resolveOrCreate(request())).toThrow('cannot ISSUE again');

    const pendingSetup = setup(false);
    jest.mocked(pendingSetup.contracts.findActiveByNaturalKey).mockReturnValue(contract());
    jest.mocked(pendingSetup.movements.listByContract).mockReturnValue([issue('PENDING')]);
    expect(() => pendingSetup.service.resolveOrCreate(request({ movementType: 'UTILIZE' }))).toThrow('has not been Checker-Released yet');
  });

  it('reports a missing root ISSUE distinctly from a Pending ISSUE', () => {
    const missingIssue = setup(false);
    jest.mocked(missingIssue.contracts.findActiveByNaturalKey).mockReturnValue(contract());
    jest.mocked(missingIssue.movements.listByContract).mockReturnValue([]);

    expect(() => missingIssue.service.resolveOrCreate(request({ movementType: 'UTILIZE' }))).toThrow('its own ISSUE is still missing');
  });

  it('allows REVERSAL to resolve a non-ACTIVE existing contract', () => {
    const { service, contracts } = setup(false);
    const closed = contract('IPLC_LC', { status: 'CLOSED' });
    jest.mocked(contracts.findById).mockReturnValue(closed);

    expect(service.resolveOrCreate(request({ balanceContractId: closed.balanceContractId, naturalKey: undefined, movementType: 'REVERSAL' }))).toBe(closed);
  });

  it('allows CLOSE against an EXPIRED existing contract', () => {
    const { service, contracts } = setup(false);
    const expired = contract('IPLC_LC', { status: 'EXPIRED' });
    jest.mocked(contracts.findById).mockReturnValue(expired);

    expect(service.resolveOrCreate(request({ balanceContractId: expired.balanceContractId, naturalKey: undefined, movementType: 'CLOSE' }))).toBe(expired);
  });

  it('rejects missing targets for non-creating movements and missing identifiers', () => {
    const { service } = setup(false);
    expect(() => service.resolveOrCreate(request({ naturalKey: undefined, balanceContractId: undefined, movementType: 'UTILIZE' }))).toThrow(
      'naturalKey or balanceContractId is required',
    );
    expect(() => service.resolveOrCreate(request({ movementType: 'UTILIZE' }))).toThrow('only ISSUE/CREATE may implicitly create one');
  });

  it('requires a Released, currency-compatible parent before creating a child', () => {
    const pending = setup(true);
    jest.mocked(pending.contracts.findActiveByLogicalContractId).mockReturnValue(contract());
    jest.mocked(pending.movements.listByContract).mockReturnValue([issue('PENDING')]);
    const child = request({
      instrumentType: 'SHGT',
      movementType: 'ISSUE',
      naturalKey: { lcNumber: 'LC001', sgNumber: 'SG01' },
      parentLogicalContractId: 'logical-1',
    });
    expect(() => pending.service.resolveOrCreate(child)).toThrow('has not been Checker-Released yet');

    const mismatch = setup(true);
    jest.mocked(mismatch.contracts.findActiveByLogicalContractId).mockReturnValue(contract());
    expect(() => mismatch.service.resolveOrCreate({ ...child, currency: 'EUR' })).toThrow('does not match the parent contract');
  });

  it('enforces Acceptance tenor consistency before running creation sufficiency', () => {
    const { service, contracts, policies } = setup(true);
    jest.mocked(contracts.findActiveByLogicalContractId).mockReturnValue(contract('IPLC_LC', { tenorType: 'SIGHT' }));
    const acceptance = request({
      instrumentType: 'IPLC_ACCEPTANCE',
      movementType: 'CREATE',
      naturalKey: { lcNumber: 'LC001', ibNumber: 'IB01' },
      parentLogicalContractId: 'logical-1',
      tenorType: 'BUYERS_USANCE',
    });
    expect(() => service.resolveOrCreate(acceptance)).toThrow();
    expect(policies.assertCreationSufficiency).not.toHaveBeenCalled();
  });

  it('accepts an acknowledged A3 reference through the same-LC natural-key fallback', () => {
    const { service, contracts, movements } = setup(true);
    const parent = contract('IPLC_LC', { logicalContractId: 'source-logical', tenorType: 'BUYERS_USANCE' });
    jest.mocked(contracts.findById).mockReturnValue(parent);
    jest.mocked(contracts.findActiveByLogicalContractId).mockReturnValue(parent);
    jest.mocked(movements.findById).mockReturnValue({
      ...issue('PENDING'),
      movementId: 'a3-source',
      balanceContractId: parent.balanceContractId,
      movementType: 'UTILIZE',
      acknowledgedAt: '2026-01-02T00:00:00.000Z',
      makerSubmittedAt: null,
    });

    expect(
      service.resolveOrCreate(
        request({
          instrumentType: 'IPLC_ACCEPTANCE',
          movementType: 'CREATE',
          naturalKey: { lcNumber: 'LC001', ibNumber: 'IB01' },
          parentLogicalContractId: 'different-parent-id',
          referencedTransactionId: 'a3-source',
          tenorType: 'BUYERS_USANCE',
        }),
      ),
    ).toMatchObject({ instrumentType: 'IPLC_ACCEPTANCE', parentLogicalContractId: 'different-parent-id' });
  });

  it('allows EPLC Acceptance creation without a parent through the optional-parent tenor path', () => {
    const { service } = setup(true);

    expect(
      service.resolveOrCreate(
        request({
          instrumentType: 'EPLC_ACCEPTANCE',
          movementType: 'CREATE',
          naturalKey: { lcNumber: 'ELC001', ibNumber: 'IB01' },
          parentLogicalContractId: undefined,
        }),
      ),
    ).toMatchObject({ instrumentType: 'EPLC_ACCEPTANCE', parentLogicalContractId: null });
  });

  it('creates a root contract with deterministic ids, grace defaults and frozen request fields', () => {
    const { service, contracts, policies } = setup(true);
    const created = service.resolveOrCreate(request({ tenorType: 'SIGHT', expiryDate: '2026-12-31', tolerancePct: '10', mailFloatGraceDays: 3 }));
    expect(policies.assertCreationSufficiency).toHaveBeenCalled();
    expect(created).toMatchObject({
      balanceContractId: 'generated-id',
      logicalContractId: 'generated-id',
      status: 'ACTIVE',
      expiryDate: '2026-12-31',
      mailFloatGraceDays: 3,
      tolerancePct: '10',
      effectiveFrom: '2026-01-02T00:00:00.000Z',
    });
    expect(contracts.insert).toHaveBeenCalledWith(created);
  });

  it('stores a missing root expiry as null', () => {
    const { service } = setup(true);
    expect(service.resolveOrCreate(request({ expiryDate: undefined }))).toMatchObject({ expiryDate: null });
  });

  it('creates a child contract with its parent identity and without root-only expiry or grace fields', () => {
    const { service, contracts } = setup(true);
    jest.mocked(contracts.findActiveByLogicalContractId).mockReturnValue(contract());
    const created = service.resolveOrCreate(
      request({
        instrumentType: 'SHGT',
        movementType: 'ISSUE',
        naturalKey: { lcNumber: 'LC001', sgNumber: 'SG01' },
        parentLogicalContractId: 'logical-1',
        expiryDate: '2026-12-31',
      }),
    );

    expect(created).toMatchObject({
      instrumentType: 'SHGT',
      parentLogicalContractId: 'logical-1',
      expiryDate: null,
      mailFloatGraceDays: null,
    });
  });
});
