import { NotFoundError } from '../errors';
import type { CatalogFilter, CatalogPage, BalanceContractStore } from '../store/balanceContractStore';
import type { BalanceMovementStore } from '../store/balanceMovementStore';
import type { DeletePendingAuditStore } from '../store/deletePendingAuditStore';
import type { FixPendingAuditStore } from '../store/fixPendingAuditStore';
import type {
  BalanceContract,
  BalanceMovement,
  BalanceSnapshot,
  DeletePendingAuditWithContract,
  FixPendingAuditRecord,
  InstrumentType,
  MovementStatus,
  NaturalKey,
} from '../types';
import { BalanceSnapshotService } from './balanceSnapshotService';

export interface MakerMovementQuery {
  createdBy: string;
  statuses?: MovementStatus[];
  q?: string;
}

export interface DeletePendingAuditQuery {
  lcNumber?: string;
  deletedBy?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Read-only application service for Balance Component queries.
 *
 * Keeping projections and lookup error semantics here lets BalanceService remain a compatibility
 * facade while command orchestration evolves independently. This service never writes to a store.
 */
export class BalanceQueryService {
  constructor(
    private readonly contracts: BalanceContractStore,
    private readonly movements: BalanceMovementStore,
    private readonly deletePendingAudit: DeletePendingAuditStore,
    private readonly fixPendingAudit: FixPendingAuditStore,
    private readonly snapshots: BalanceSnapshotService,
  ) {}

  resolveContract(instrumentType: InstrumentType, naturalKey: NaturalKey, includeAnyStatus = false): BalanceContract | undefined {
    return includeAnyStatus ? this.contracts.findByNaturalKey(instrumentType, naturalKey) : this.contracts.findActiveByNaturalKey(instrumentType, naturalKey);
  }

  catalog(filter: CatalogFilter): CatalogPage {
    return this.contracts.listCatalog(filter);
  }

  catalogWithDeletePendingHistory(filter: { instrumentType: InstrumentType; q?: string; page?: number; pageSize?: number }): CatalogPage {
    return this.contracts.listWithDeletePendingHistory(filter);
  }

  getBalanceSnapshot(balanceContractId: string, asOfEventSeq?: number): BalanceSnapshot {
    const contract = this.getContractById(balanceContractId);
    const allMovements = this.movements.listByContract(balanceContractId);
    const movements = asOfEventSeq === undefined ? allMovements : allMovements.filter((movement) => movement.eventSeq <= asOfEventSeq);
    const cutoffMovement = asOfEventSeq === undefined ? undefined : movements[movements.length - 1];

    const shgtMovements = this.cutAtMovementTime(this.movements.listShgtMovementsForParent(contract.logicalContractId), cutoffMovement);
    const examinationMovements = this.cutAtMovementTime(this.movements.listExaminationMovementsForParent(contract.logicalContractId), cutoffMovement);

    return this.snapshots.assemble(contract, movements, shgtMovements, examinationMovements);
  }

  listMovements(balanceContractId: string): BalanceMovement[] {
    this.getContractById(balanceContractId);
    return this.movements.listByContract(balanceContractId);
  }

  getContractById(balanceContractId: string): BalanceContract {
    const contract = this.contracts.findById(balanceContractId);
    if (!contract) throw new NotFoundError(`No BalanceContract ${balanceContractId}`);
    return contract;
  }

  getBalanceSnapshotAsOfMovement(movementId: string): BalanceSnapshot {
    const movement = this.movements.findById(movementId);
    if (!movement) throw new NotFoundError(`No BalanceMovement ${movementId}`);
    return this.getBalanceSnapshot(movement.balanceContractId, movement.eventSeq);
  }

  findByBusinessEventId(businessEventId: string): BalanceMovement[] {
    return this.movements.findByBusinessEventId(businessEventId);
  }

  listMyMovements(params: MakerMovementQuery): { items: Array<{ movement: BalanceMovement; contract: BalanceContract }> } {
    const statuses = params.statuses ?? (['PENDING', 'REJECTED'] as MovementStatus[]);
    const { items } = this.movements.listByCreatedByAndStatus({ createdBy: params.createdBy, statuses, q: params.q });
    return {
      items: items.map((movement) => {
        const contract = this.contracts.findById(movement.balanceContractId);
        if (!contract) {
          throw new NotFoundError(`No BalanceContract ${movement.balanceContractId} (owner of movement ${movement.movementId})`);
        }
        return { movement, contract };
      }),
    };
  }

  listDeletePendingAudit(filter: DeletePendingAuditQuery): {
    items: DeletePendingAuditWithContract[];
    total: number;
    page: number;
    pageSize: number;
  } {
    return this.deletePendingAudit.search(filter);
  }

  listFixPendingAudit(movementId: string): FixPendingAuditRecord[] {
    return this.fixPendingAudit.listByMovement(movementId);
  }

  private cutAtMovementTime(candidates: BalanceMovement[], cutoffMovement: BalanceMovement | undefined): BalanceMovement[] {
    return cutoffMovement === undefined ? candidates : candidates.filter((movement) => movement.createdAt <= cutoffMovement.createdAt);
  }
}
