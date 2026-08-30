import { ContractLifecycleEligibilityService } from '../../../src/service/contractLifecycleEligibilityService';
import { LifecycleSweepService, type LifecycleCommandPort } from '../../../src/service/lifecycleSweepService';
import type { BalanceContractStore } from '../../../src/store/balanceContractStore';
import type { BalanceMovementStore } from '../../../src/store/balanceMovementStore';
import type { BalanceContract, BalanceMovement, InstrumentType } from '../../../src/types';

function contract(instrumentType: InstrumentType, overrides: Partial<BalanceContract> = {}): BalanceContract {
  return {
    balanceContractId: 'contract-1',
    logicalContractId: 'logical-1',
    instrumentType,
    naturalKey: { lcNumber: 'LC001' },
    status: 'ACTIVE',
    currency: 'USD',
    expiryDate: '2026-01-01',
    mailFloatGraceDays: 0,
    ...overrides,
  } as BalanceContract;
}

function movement(overrides: Partial<BalanceMovement> = {}): BalanceMovement {
  return {
    movementId: 'movement-1',
    balanceContractId: 'contract-1',
    eventSeq: 1,
    movementType: 'ISSUE',
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

describe('ContractLifecycleEligibilityService', () => {
  it('treats a pending or unconsumed released Present Docs child as an open Export event', () => {
    const contracts = {} as BalanceContractStore;
    const movements = {
      listByContract: jest.fn(() => []),
      listShgtMovementsForParent: jest.fn(() => []),
      listAcceptanceMovementsForParent: jest.fn(() => []),
      listExaminationMovementsForParent: jest.fn(() => [
        movement({ movementId: 'pending', status: 'PENDING', movementType: 'CREATE' }),
        movement({ movementId: 'released', status: 'RELEASED', movementType: 'CREATE', presentDocsConsumedAt: null }),
      ]),
    } as unknown as BalanceMovementStore;
    const service = new ContractLifecycleEligibilityService(contracts, movements);

    expect(service.gatherEventTree(contract('EPLC_CONFIRMATION')).hasOpenEvents).toBe(true);
  });

  it('rejects a non-root instrument for both Close and Reopen listings with action-specific messages', () => {
    const service = new ContractLifecycleEligibilityService({} as BalanceContractStore, {} as BalanceMovementStore);
    expect(() => service.listCloseEligible('SHGT')).toThrow(/^Close only applies/);
    expect(() => service.listReopenEligible('SHGT')).toThrow(/^Reopen only applies/);
  });
});

describe('LifecycleSweepService command-port isolation', () => {
  function stores(candidate: BalanceContract, history: BalanceMovement[] = [movement()]) {
    return {
      contracts: {
        listActiveExpirable: jest.fn(() => [candidate]),
        listExpiredContracts: jest.fn(() => []),
      } as unknown as BalanceContractStore,
      movements: { listByContract: jest.fn(() => history) } as unknown as BalanceMovementStore,
    };
  }

  it('reports an idempotency conflict returned by the command port without attempting Release', () => {
    const candidate = contract('IPLC_LC');
    const { contracts, movements } = stores(candidate);
    const commands = {
      createMovement: jest.fn(() => ({ created: false as const, existing: movement() })),
      release: jest.fn(),
    } as LifecycleCommandPort;
    const service = new LifecycleSweepService(contracts, movements, commands, () => 123);

    expect(service.runAutoExpiry(new Date('2026-01-10'))[0]).toMatchObject({ ok: false, error: expect.stringContaining('idempotency conflict') });
    expect(commands.release).not.toHaveBeenCalled();
  });

  it('isolates a non-Error command failure as a per-candidate string result', () => {
    const candidate = contract('EPLC_CONFIRMATION');
    const { contracts, movements } = stores(candidate);
    const commands = {
      createMovement: jest.fn(() => {
        throw 'command failed';
      }),
      release: jest.fn(),
    } as unknown as LifecycleCommandPort;
    const service = new LifecycleSweepService(contracts, movements, commands, () => 456);

    expect(service.runAutoExpiry(new Date('2026-01-10'))).toEqual([{ balanceContractId: 'contract-1', ok: false, error: 'command failed' }]);
  });
});
