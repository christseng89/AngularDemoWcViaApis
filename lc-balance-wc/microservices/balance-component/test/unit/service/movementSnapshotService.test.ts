import { MovementSnapshotService } from '../../../src/service/movementSnapshotService';
import type { BalanceSnapshotService } from '../../../src/service/balanceSnapshotService';
import type { BalanceContractStore } from '../../../src/store/balanceContractStore';
import type { BalanceMovementStore } from '../../../src/store/balanceMovementStore';
import type { BalanceContract, BalanceMovement, BalanceSnapshot, InstrumentType } from '../../../src/types';

function contract(instrumentType: InstrumentType, overrides: Partial<BalanceContract> = {}): BalanceContract {
  return {
    balanceContractId: `${instrumentType}-contract`,
    logicalContractId: `${instrumentType}-logical`,
    instrumentType,
    naturalKey: { lcNumber: 'LC001' },
    status: 'ACTIVE',
    currency: 'USD',
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
    status: 'PENDING',
    exposureNature: 'CONTINGENT',
    createdBy: 'maker1',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as BalanceMovement;
}

function setup() {
  const contracts = {
    findActiveByLogicalContractId: jest.fn(),
    listCatalog: jest.fn(() => ({ items: [], total: 0, page: 1, pageSize: 10 })),
  } as unknown as BalanceContractStore;
  const movements = {
    listByContract: jest.fn(() => []),
    listShgtMovementsForParent: jest.fn(() => []),
    listExaminationMovementsForParent: jest.fn(() => []),
  } as unknown as BalanceMovementStore;
  const snapshots = {
    assemble: jest.fn((_contract: BalanceContract) => ({ confirmedBalance: _contract.balanceContractId }) as BalanceSnapshot),
  } as unknown as BalanceSnapshotService;
  const snapshotReader = {
    getBalanceSnapshot: jest.fn((id: string) => ({ confirmedBalance: id }) as BalanceSnapshot),
  };
  return {
    contracts,
    movements,
    snapshots,
    snapshotReader,
    service: new MovementSnapshotService(contracts, movements, snapshots, snapshotReader),
  };
}

describe('MovementSnapshotService', () => {
  it('captures root Import LC state plus its one unambiguous Acceptance and SG sibling', () => {
    const { service, contracts, movements, snapshots, snapshotReader } = setup();
    const root = contract('IPLC_LC');
    const own = movement({ balanceContractId: root.balanceContractId });
    const shgt = movement({ movementId: 'sg-movement' });
    const acceptance = contract('IPLC_ACCEPTANCE');
    const sg = contract('SHGT');
    jest.mocked(movements.listShgtMovementsForParent).mockReturnValue([shgt]);
    jest.mocked(contracts.listCatalog).mockImplementation((filter) => ({
      items: filter.instrumentType === 'IPLC_ACCEPTANCE' ? [acceptance] : [sg],
      total: 1,
      page: 1,
      pageSize: 10,
    }));

    const result = service.captureBundle(root, [own], own);

    expect(snapshots.assemble).toHaveBeenCalledWith(root, [own], [shgt], []);
    expect(snapshotReader.getBalanceSnapshot).toHaveBeenCalledWith(acceptance.balanceContractId);
    expect(snapshotReader.getBalanceSnapshot).toHaveBeenCalledWith(sg.balanceContractId);
    expect(result).toMatchObject({
      rootEventSnapshot: null,
      acceptanceEventSnapshot: { confirmedBalance: acceptance.balanceContractId },
      sgEventSnapshot: { confirmedBalance: sg.balanceContractId },
    });
  });

  it('replaces a persisted SHGT child with its command-time shape when capturing the Import parent', () => {
    const { service, contracts, movements, snapshots } = setup();
    const parent = contract('IPLC_LC');
    const child = contract('SHGT', { parentLogicalContractId: parent.logicalContractId });
    const persistedOldShape = movement({ movementId: 'child', status: 'PENDING' });
    const commandShape = movement({ movementId: 'child', status: 'RELEASED' });
    const unrelated = movement({ movementId: 'other' });
    jest.mocked(contracts.findActiveByLogicalContractId).mockReturnValue(parent);
    jest.mocked(movements.listByContract).mockReturnValue([movement({ movementId: 'parent-own' })]);
    jest.mocked(movements.listShgtMovementsForParent).mockReturnValue([persistedOldShape, unrelated]);

    const result = service.captureBundle(child, [commandShape], commandShape);

    expect(snapshots.assemble).toHaveBeenNthCalledWith(2, parent, [expect.objectContaining({ movementId: 'parent-own' })], [unrelated, commandShape], []);
    expect(result.rootEventSnapshot).toEqual({ confirmedBalance: parent.balanceContractId });
    expect(result.sgEventSnapshot).toBeNull();
  });

  it('replaces an Export examination child when capturing its Confirmation parent', () => {
    const { service, contracts, movements, snapshots } = setup();
    const parent = contract('EPLC_CONFIRMATION');
    const child = contract('EPLC_EXAMINATION', { parentLogicalContractId: parent.logicalContractId });
    const commandShape = movement({ movementId: 'exam', status: 'RELEASED' });
    jest.mocked(contracts.findActiveByLogicalContractId).mockReturnValue(parent);
    jest
      .mocked(movements.listExaminationMovementsForParent)
      .mockReturnValue([movement({ movementId: 'exam', status: 'PENDING' }), movement({ movementId: 'other-exam' })]);

    service.captureBundle(child, [commandShape], commandShape);

    expect(snapshots.assemble).toHaveBeenNthCalledWith(2, parent, [], [], [expect.objectContaining({ movementId: 'other-exam' }), commandShape]);
  });

  it('returns null siblings for ambiguous catalogs, self-Acceptance and child records without a resolvable parent', () => {
    const { service, contracts } = setup();
    const acceptance = contract('IPLC_ACCEPTANCE', { parentLogicalContractId: 'missing-parent' });
    jest.mocked(contracts.listCatalog).mockReturnValue({
      items: [contract('SHGT', { balanceContractId: 'sg-1' }), contract('SHGT', { balanceContractId: 'sg-2' })],
      total: 2,
      page: 1,
      pageSize: 10,
    });

    const ambiguous = service.captureBundle(contract('IPLC_LC'), [], movement());
    const result = service.captureBundle(acceptance, [], movement());

    expect(ambiguous.acceptanceEventSnapshot).toBeNull();
    expect(ambiguous.sgEventSnapshot).toBeNull();
    expect(result.rootEventSnapshot).toBeNull();
    expect(result.acceptanceEventSnapshot).toBeNull();
    expect(result.sgEventSnapshot).toBeNull();
  });

  it('routes normal and A4/A6 finalize snapshots to distinct persisted columns', () => {
    const { service } = setup();
    expect(service.resolveWriteTarget(false)).toEqual({
      eventSnapshotField: 'eventSnapshot',
      acceptanceSnapshotField: 'acceptanceEventSnapshot',
      sgSnapshotField: 'sgEventSnapshot',
    });
    expect(service.resolveWriteTarget(true)).toEqual({
      eventSnapshotField: 'finalizeEventSnapshot',
      acceptanceSnapshotField: 'finalizeAcceptanceEventSnapshot',
      sgSnapshotField: 'finalizeSgEventSnapshot',
    });
  });
});
