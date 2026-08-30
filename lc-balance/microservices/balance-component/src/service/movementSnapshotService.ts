import type { BalanceContractStore } from '../store/balanceContractStore';
import type { BalanceMovementStore } from '../store/balanceMovementStore';
import type { BalanceContract, BalanceMovement, BalanceSnapshot, InstrumentType } from '../types';
import { BalanceSnapshotService } from './balanceSnapshotService';

const ACCEPTANCE_TYPE_BY_ROOT: Readonly<Partial<Record<InstrumentType, InstrumentType>>> = {
  IPLC_LC: 'IPLC_ACCEPTANCE',
  EPLC_CONFIRMATION: 'EPLC_ACCEPTANCE',
};

export interface MovementSnapshotBundle {
  eventSnapshot: BalanceSnapshot;
  rootEventSnapshot: BalanceSnapshot | null;
  acceptanceEventSnapshot: BalanceSnapshot | null;
  sgEventSnapshot: BalanceSnapshot | null;
}

export interface SnapshotWriteTarget {
  eventSnapshotField: 'eventSnapshot' | 'finalizeEventSnapshot';
  acceptanceSnapshotField: 'acceptanceEventSnapshot' | 'finalizeAcceptanceEventSnapshot';
  sgSnapshotField: 'sgEventSnapshot' | 'finalizeSgEventSnapshot';
}

export interface BalanceSnapshotReader {
  getBalanceSnapshot(balanceContractId: string): BalanceSnapshot;
}

/**
 * Builds the immutable snapshot bundle persisted by movement Create and Release commands.
 *
 * It owns family navigation and snapshot-column routing only. It deliberately performs no writes and
 * makes no workflow decisions, keeping command transaction boundaries in BalanceService.
 */
export class MovementSnapshotService {
  constructor(
    private readonly contracts: BalanceContractStore,
    private readonly movements: BalanceMovementStore,
    private readonly snapshots: BalanceSnapshotService,
    private readonly snapshotReader: BalanceSnapshotReader,
  ) {}

  captureBundle(contract: BalanceContract, ownMovements: readonly BalanceMovement[], childMovementForRootCapture: BalanceMovement): MovementSnapshotBundle {
    const ownShgtMovements =
      contract.instrumentType === 'IPLC_LC' || contract.instrumentType === 'EPLC_LC'
        ? this.movements.listShgtMovementsForParent(contract.logicalContractId)
        : [];
    const ownExaminationMovements =
      contract.instrumentType === 'EPLC_CONFIRMATION' ? this.movements.listExaminationMovementsForParent(contract.logicalContractId) : [];
    const eventSnapshot = this.snapshots.assemble(contract, ownMovements, ownShgtMovements, ownExaminationMovements);

    const parent = this.resolveParentContract(contract);
    const rootEventSnapshot = parent ? this.captureRootEventSnapshot(parent, contract.instrumentType, childMovementForRootCapture) : null;
    const rootInstrumentType = parent?.instrumentType ?? contract.instrumentType;

    return {
      eventSnapshot,
      rootEventSnapshot,
      acceptanceEventSnapshot: this.resolveAcceptanceSibling(contract, rootInstrumentType),
      sgEventSnapshot: this.resolveSgSibling(contract, rootInstrumentType),
    };
  }

  resolveWriteTarget(isUtilizeFinalize: boolean): SnapshotWriteTarget {
    return isUtilizeFinalize
      ? {
          eventSnapshotField: 'finalizeEventSnapshot',
          acceptanceSnapshotField: 'finalizeAcceptanceEventSnapshot',
          sgSnapshotField: 'finalizeSgEventSnapshot',
        }
      : {
          eventSnapshotField: 'eventSnapshot',
          acceptanceSnapshotField: 'acceptanceEventSnapshot',
          sgSnapshotField: 'sgEventSnapshot',
        };
  }

  private resolveParentContract(contract: BalanceContract): BalanceContract | null {
    const isChildLedger =
      contract.instrumentType === 'SHGT' ||
      contract.instrumentType === 'IPLC_ACCEPTANCE' ||
      contract.instrumentType === 'EPLC_ACCEPTANCE' ||
      contract.instrumentType === 'EPLC_EXAMINATION';
    if (!isChildLedger || !contract.parentLogicalContractId) return null;
    return this.contracts.findActiveByLogicalContractId(contract.parentLogicalContractId) ?? null;
  }

  private captureRootEventSnapshot(parent: BalanceContract, childInstrumentType: InstrumentType, childMovement: BalanceMovement): BalanceSnapshot {
    const parentMovements = this.movements.listByContract(parent.balanceContractId);
    let shgtMovements: BalanceMovement[] = [];
    let examinationMovements: BalanceMovement[] = [];
    if (parent.instrumentType === 'IPLC_LC' || parent.instrumentType === 'EPLC_LC') {
      shgtMovements = this.movements
        .listShgtMovementsForParent(parent.logicalContractId)
        .filter((movement) => movement.movementId !== childMovement.movementId);
      if (childInstrumentType === 'SHGT') shgtMovements = [...shgtMovements, childMovement];
    }
    if (parent.instrumentType === 'EPLC_CONFIRMATION') {
      examinationMovements = this.movements
        .listExaminationMovementsForParent(parent.logicalContractId)
        .filter((movement) => movement.movementId !== childMovement.movementId);
      if (childInstrumentType === 'EPLC_EXAMINATION') examinationMovements = [...examinationMovements, childMovement];
    }
    return this.snapshots.assemble(parent, parentMovements, shgtMovements, examinationMovements);
  }

  private resolveAcceptanceSibling(contract: BalanceContract, rootInstrumentType: InstrumentType): BalanceSnapshot | null {
    if (contract.instrumentType === 'IPLC_ACCEPTANCE' || contract.instrumentType === 'EPLC_ACCEPTANCE') return null;
    const acceptanceType = ACCEPTANCE_TYPE_BY_ROOT[rootInstrumentType];
    if (!acceptanceType) return null;
    return this.resolveOnlySibling(acceptanceType, contract.naturalKey.lcNumber);
  }

  private resolveSgSibling(contract: BalanceContract, rootInstrumentType: InstrumentType): BalanceSnapshot | null {
    if (contract.instrumentType === 'SHGT' || rootInstrumentType !== 'IPLC_LC') return null;
    return this.resolveOnlySibling('SHGT', contract.naturalKey.lcNumber);
  }

  private resolveOnlySibling(instrumentType: InstrumentType, lcNumber: string): BalanceSnapshot | null {
    const candidates = this.contracts.listCatalog({ instrumentType, lcNumber }).items;
    return candidates.length === 1 ? this.snapshotReader.getBalanceSnapshot(candidates[0]!.balanceContractId) : null;
  }
}
