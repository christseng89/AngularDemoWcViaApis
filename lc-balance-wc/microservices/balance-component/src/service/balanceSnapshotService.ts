import { computeAvailableBalance, computeConfirmedBalance, computePendingDecreaseTotal } from '../domain/balanceDerivation';
import {
  computeOffBalanceExposure,
  computePresentDocsEarmark,
  computePresentDocsEarmarkApproved,
  computePresentDocsEarmarkPending,
  derivePresentDocsProvisionallyConsumedIds,
} from '../domain/offBalanceExposure';
import type { BalanceContract, BalanceMovement, BalanceSnapshot } from '../types';

/** Pure projection of one contract and its relevant event family into a BalanceSnapshot. */
export class BalanceSnapshotService {
  assemble(
    contract: BalanceContract,
    movements: readonly BalanceMovement[],
    shgtMovements: readonly BalanceMovement[],
    examinationMovements: readonly BalanceMovement[],
  ): BalanceSnapshot {
    const confirmed = computeConfirmedBalance(movements);
    const available = computeAvailableBalance(confirmed, movements);
    const pendingDecreaseTotal = computePendingDecreaseTotal(movements);

    let offBalanceExposure: string | null = null;
    let tightAvailableBalance: string | null = null;
    if (contract.instrumentType === 'IPLC_LC' || contract.instrumentType === 'EPLC_LC') {
      const matchedPendingUtilizeBusinessEventIds = new Set(
        movements
          .filter((movement) => movement.status === 'PENDING' && movement.movementType === 'UTILIZE' && movement.businessEventId)
          .map((movement) => movement.businessEventId as string),
      );
      const exposure = computeOffBalanceExposure(shgtMovements, matchedPendingUtilizeBusinessEventIds);
      offBalanceExposure = exposure.toFixed();
      tightAvailableBalance = confirmed.minus(pendingDecreaseTotal).minus(exposure).toFixed();
    }

    let presentDocsEarmarkPending: string | null = null;
    let presentDocsEarmarkApproved: string | null = null;
    if (contract.instrumentType === 'EPLC_CONFIRMATION') {
      const provisionallyConsumedIds = derivePresentDocsProvisionallyConsumedIds(movements);
      presentDocsEarmarkPending = computePresentDocsEarmarkPending(examinationMovements).toFixed();
      presentDocsEarmarkApproved = computePresentDocsEarmarkApproved(examinationMovements, provisionallyConsumedIds).toFixed();
      tightAvailableBalance = confirmed.minus(pendingDecreaseTotal).minus(computePresentDocsEarmark(examinationMovements, provisionallyConsumedIds)).toFixed();
    }

    return {
      balanceContractId: contract.balanceContractId,
      logicalContractId: contract.logicalContractId,
      currency: contract.currency,
      confirmedBalance: confirmed.toFixed(),
      availableBalance: available.toFixed(),
      pendingEarmarkTotal: available.minus(confirmed).toFixed(),
      offBalanceExposure,
      tightAvailableBalance,
      presentDocsEarmarkPending,
      presentDocsEarmarkApproved,
      asOf: null,
    };
  }
}
