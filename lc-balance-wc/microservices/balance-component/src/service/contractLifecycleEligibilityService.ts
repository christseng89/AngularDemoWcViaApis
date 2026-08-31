import { computeConfirmedBalance } from '../domain/balanceDerivation';
import { evaluateCloseEligibility, type CloseEligibilityResult } from '../domain/closeEligibility';
import { evaluateExpiryEligibility, type ExpiryEligibilityResult } from '../domain/expiryEligibility';
import { RequestValidationError } from '../errors';
import type { CatalogPage } from '../store/balanceContractStore';
import type { BalanceContractStore } from '../store/balanceContractStore';
import type { BalanceMovementStore } from '../store/balanceMovementStore';
import type { BalanceContract, BalanceMovement, InstrumentType } from '../types';
import { ROOT_INSTRUMENT_TYPES } from './movementRequestValidator';

export interface PrefetchedEventTree {
  ownMovements: BalanceMovement[];
  sgMovements: BalanceMovement[];
  acceptanceMovements: BalanceMovement[];
  examinationMovements: BalanceMovement[];
}

export interface ContractEventTree {
  ownMovements: BalanceMovement[];
  sgMovements: BalanceMovement[];
  acceptanceMovements: BalanceMovement[];
  hasOpenEvents: boolean;
}

/** Owns Close/Expiry/Reopen eligibility and their batched catalog projections. */
export class ContractLifecycleEligibilityService {
  constructor(
    private readonly contracts: BalanceContractStore,
    private readonly movements: BalanceMovementStore,
  ) {}

  gatherEventTree(contract: BalanceContract, excludeMovementId?: string, preFetched?: PrefetchedEventTree): ContractEventTree {
    const ownMovements = (preFetched?.ownMovements ?? this.movements.listByContract(contract.balanceContractId)).filter(
      (movement) => movement.movementId !== excludeMovementId,
    );
    let hasOpenEvents = ownMovements.some((movement) => movement.status === 'PENDING');

    const sgMovements =
      preFetched?.sgMovements ?? (contract.instrumentType === 'IPLC_LC' ? this.movements.listShgtMovementsForParent(contract.logicalContractId) : []);
    if (sgMovements.some((movement) => movement.status === 'PENDING')) hasOpenEvents = true;

    const acceptanceMovements = preFetched?.acceptanceMovements ?? this.movements.listAcceptanceMovementsForParent(contract.logicalContractId);
    if (acceptanceMovements.some((movement) => movement.status === 'PENDING')) hasOpenEvents = true;

    if (contract.instrumentType === 'EPLC_CONFIRMATION') {
      const examinationMovements = preFetched?.examinationMovements ?? this.movements.listExaminationMovementsForParent(contract.logicalContractId);
      for (const movement of examinationMovements) {
        if (movement.status === 'PENDING') hasOpenEvents = true;
        if (movement.status === 'RELEASED' && movement.movementType === 'CREATE' && !movement.presentDocsConsumedAt) hasOpenEvents = true;
      }
    }

    return { ownMovements, sgMovements, acceptanceMovements, hasOpenEvents };
  }

  evaluateClose(contract: BalanceContract, excludeMovementId?: string, preFetched?: PrefetchedEventTree): CloseEligibilityResult {
    const { ownMovements, sgMovements, acceptanceMovements, hasOpenEvents } = this.gatherEventTree(contract, excludeMovementId, preFetched);
    return evaluateCloseEligibility({
      alreadyClosed: contract.status === 'CLOSED',
      rootConfirmedBalance: computeConfirmedBalance(ownMovements),
      sgConfirmedBalance: computeConfirmedBalance(sgMovements),
      acceptanceConfirmedBalance: computeConfirmedBalance(acceptanceMovements),
      hasOpenEvents,
    });
  }

  evaluateExpiry(contract: BalanceContract, excludeMovementId?: string): ExpiryEligibilityResult {
    return evaluateExpiryEligibility({ contractStatus: contract.status, hasOpenEvents: this.gatherEventTree(contract, excludeMovementId).hasOpenEvents });
  }

  listCloseEligible(instrumentType: InstrumentType, opts: { lcNumber?: string; page?: number; pageSize?: number } = {}): CatalogPage {
    this.assertRootInstrument(instrumentType, 'Close');
    const rawBatch = this.contracts.listCatalog({ instrumentType, status: 'ACTIVE', lcNumber: opts.lcNumber, pageSize: 200 }).items;
    const prefetched = this.prefetch(rawBatch, instrumentType);
    const eligible = rawBatch.filter((contract) => this.evaluateClose(contract, undefined, this.forContract(contract, prefetched)).eligible);
    return this.paginate(eligible, opts);
  }

  listReopenEligible(instrumentType: InstrumentType, opts: { lcNumber?: string; page?: number; pageSize?: number } = {}): CatalogPage {
    this.assertRootInstrument(instrumentType, 'Reopen');
    const rawBatch = this.contracts.listCatalog({ instrumentType, status: 'CLOSED', lcNumber: opts.lcNumber, pageSize: 200 }).items;
    const prefetched = this.prefetch(rawBatch, instrumentType);
    const eligible = rawBatch.filter((contract) => !this.gatherEventTree(contract, undefined, this.forContract(contract, prefetched)).hasOpenEvents);
    return this.paginate(eligible, opts);
  }

  private assertRootInstrument(instrumentType: InstrumentType, action: 'Close' | 'Reopen'): void {
    if (!ROOT_INSTRUMENT_TYPES.has(instrumentType)) {
      throw new RequestValidationError(
        `${action} only applies to a root LC/Confirmation (IPLC_LC/EPLC_LC/EPLC_CONFIRMATION) — ${instrumentType} is not eligible.`,
      );
    }
  }

  private prefetch(rawBatch: BalanceContract[], instrumentType: InstrumentType) {
    const contractIds = rawBatch.map((contract) => contract.balanceContractId);
    const logicalIds = rawBatch.map((contract) => contract.logicalContractId);
    return {
      own: this.movements.listByContractIds(contractIds),
      sg: instrumentType === 'IPLC_LC' ? this.movements.listShgtMovementsForParents(logicalIds) : new Map<string, BalanceMovement[]>(),
      acceptance: this.movements.listAcceptanceMovementsForParents(logicalIds),
      examination:
        instrumentType === 'EPLC_CONFIRMATION' ? this.movements.listExaminationMovementsForParents(logicalIds) : new Map<string, BalanceMovement[]>(),
    };
  }

  private forContract(contract: BalanceContract, prefetched: ReturnType<ContractLifecycleEligibilityService['prefetch']>): PrefetchedEventTree {
    return {
      ownMovements: prefetched.own.get(contract.balanceContractId) ?? [],
      sgMovements: prefetched.sg.get(contract.logicalContractId) ?? [],
      acceptanceMovements: prefetched.acceptance.get(contract.logicalContractId) ?? [],
      examinationMovements: prefetched.examination.get(contract.logicalContractId) ?? [],
    };
  }

  private paginate(items: BalanceContract[], opts: { page?: number; pageSize?: number }): CatalogPage {
    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const pageSize = opts.pageSize && opts.pageSize > 0 ? opts.pageSize : 10;
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
  }
}
