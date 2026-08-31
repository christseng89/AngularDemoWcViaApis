import { NotFoundError } from '../../../src/errors';
import { BalanceQueryService } from '../../../src/service/balanceQueryService';
import type { BalanceSnapshotService } from '../../../src/service/balanceSnapshotService';
import type { BalanceContractStore } from '../../../src/store/balanceContractStore';
import type { BalanceMovementStore } from '../../../src/store/balanceMovementStore';
import type { DeletePendingAuditStore } from '../../../src/store/deletePendingAuditStore';
import type { FixPendingAuditStore } from '../../../src/store/fixPendingAuditStore';
import type { BalanceContract, BalanceMovement, BalanceSnapshot } from '../../../src/types';

function contract(overrides: Partial<BalanceContract> = {}): BalanceContract {
  return {
    balanceContractId: 'contract-1',
    logicalContractId: 'logical-1',
    instrumentType: 'IPLC_LC',
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
    status: 'RELEASED',
    exposureNature: 'CONTINGENT',
    createdBy: 'maker1',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as BalanceMovement;
}

function setup() {
  const owner = contract();
  const contracts = {
    findById: jest.fn(() => owner),
    findByNaturalKey: jest.fn(() => owner),
    findActiveByNaturalKey: jest.fn(() => owner),
    listCatalog: jest.fn(() => ({ items: [owner], total: 1, page: 1, pageSize: 10 })),
    listWithDeletePendingHistory: jest.fn(() => ({ items: [owner], total: 1, page: 1, pageSize: 10 })),
  } as unknown as BalanceContractStore;
  const movements = {
    listByContract: jest.fn(() => [movement()]),
    listShgtMovementsForParent: jest.fn(() => []),
    listExaminationMovementsForParent: jest.fn(() => []),
    findById: jest.fn(() => movement()),
    findByBusinessEventId: jest.fn(() => [movement()]),
    listByCreatedByAndStatus: jest.fn(() => ({ items: [movement()] })),
  } as unknown as BalanceMovementStore;
  const deletePendingAudit = { search: jest.fn(() => ({ items: [], total: 0, page: 1, pageSize: 10 })) } as unknown as DeletePendingAuditStore;
  const fixPendingAudit = { listByMovement: jest.fn(() => []) } as unknown as FixPendingAuditStore;
  const snapshots = {
    assemble: jest.fn(() => ({ confirmedBalance: '100' }) as BalanceSnapshot),
  } as unknown as BalanceSnapshotService;
  return {
    owner,
    contracts,
    movements,
    deletePendingAudit,
    fixPendingAudit,
    snapshots,
    service: new BalanceQueryService(contracts, movements, deletePendingAudit, fixPendingAudit, snapshots),
  };
}

describe('BalanceQueryService', () => {
  it('keeps active-only and any-status natural-key resolution explicit', () => {
    const { service, contracts } = setup();
    const key = { lcNumber: 'LC001' };

    service.resolveContract('IPLC_LC', key);
    service.resolveContract('IPLC_LC', key, true);

    expect(contracts.findActiveByNaturalKey).toHaveBeenCalledWith('IPLC_LC', key);
    expect(contracts.findByNaturalKey).toHaveBeenCalledWith('IPLC_LC', key);
  });

  it('projects an as-of snapshot with both own and sibling movements cut at the selected event time', () => {
    const { service, movements, snapshots, owner } = setup();
    const selected = movement({ movementId: 'selected', eventSeq: 2, createdAt: '2026-01-02T00:00:00.000Z' });
    const later = movement({ movementId: 'later', eventSeq: 3, createdAt: '2026-01-03T00:00:00.000Z' });
    const earlierSibling = movement({ movementId: 'earlier-sibling', createdAt: '2026-01-01T12:00:00.000Z' });
    const laterSibling = movement({ movementId: 'later-sibling', createdAt: '2026-01-03T12:00:00.000Z' });
    jest.mocked(movements.listByContract).mockReturnValue([movement(), selected, later]);
    jest.mocked(movements.listShgtMovementsForParent).mockReturnValue([earlierSibling, laterSibling]);
    jest.mocked(movements.listExaminationMovementsForParent).mockReturnValue([earlierSibling, laterSibling]);

    service.getBalanceSnapshot(owner.balanceContractId, 2);

    expect(snapshots.assemble).toHaveBeenCalledWith(owner, [movement(), selected], [earlierSibling], [earlierSibling]);
  });

  it('resolves movement-relative snapshots and rejects missing contracts or movements', () => {
    const { service, contracts, movements } = setup();
    expect(service.getBalanceSnapshotAsOfMovement('movement-1')).toEqual({ confirmedBalance: '100' });

    jest.mocked(movements.findById).mockReturnValue(undefined);
    expect(() => service.getBalanceSnapshotAsOfMovement('missing')).toThrow(NotFoundError);

    jest.mocked(contracts.findById).mockReturnValue(undefined);
    expect(() => service.getContractById('missing')).toThrow(NotFoundError);
    expect(() => service.listMovements('missing')).toThrow(NotFoundError);
  });

  it('defaults Maker Queue status filters and reports an orphaned movement clearly', () => {
    const { service, contracts, movements } = setup();
    expect(service.listMyMovements({ createdBy: 'maker1', q: 'LC' }).items).toHaveLength(1);
    expect(movements.listByCreatedByAndStatus).toHaveBeenCalledWith({
      createdBy: 'maker1',
      statuses: ['PENDING', 'REJECTED'],
      q: 'LC',
    });

    jest.mocked(contracts.findById).mockReturnValue(undefined);
    expect(() => service.listMyMovements({ createdBy: 'maker1', statuses: ['PENDING'] })).toThrow(/owner of movement movement-1/);
  });

  it('passes catalog, event and audit queries to their owning repositories without reshaping responses', () => {
    const { service, contracts, movements, deletePendingAudit, fixPendingAudit } = setup();
    const catalogFilter = { instrumentType: 'IPLC_LC' as const, page: 2 };
    const historyFilter = { instrumentType: 'IPLC_LC' as const, q: 'LC' };
    const auditFilter = { lcNumber: 'LC001', page: 1 };

    expect(service.catalog(catalogFilter)).toBe(jest.mocked(contracts.listCatalog).mock.results[0]?.value);
    service.catalogWithDeletePendingHistory(historyFilter);
    service.findByBusinessEventId('business-event-1');
    service.listDeletePendingAudit(auditFilter);
    service.listFixPendingAudit('movement-1');

    expect(contracts.listWithDeletePendingHistory).toHaveBeenCalledWith(historyFilter);
    expect(movements.findByBusinessEventId).toHaveBeenCalledWith('business-event-1');
    expect(deletePendingAudit.search).toHaveBeenCalledWith(auditFilter);
    expect(fixPendingAudit.listByMovement).toHaveBeenCalledWith('movement-1');
  });
});
