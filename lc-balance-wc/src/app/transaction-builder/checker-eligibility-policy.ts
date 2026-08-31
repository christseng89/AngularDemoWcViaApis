import { BalanceMovement } from './balance-component-api.service';
import { TransactionFunction } from './balance-component.model';
import { deriveFunctionStrategy, movementTypeMatchesFunction } from './function-strategy';

/**
 * Pure application policy for the Checker queue. Keeping this outside the component makes candidate
 * discovery and queue rendering share exactly the same eligibility decision and gives other callers
 * (for example business-case verification) a reusable, side-effect-free contract.
 */
export function isCheckerActionableMovement(
  movement: BalanceMovement,
  selectedFunction: TransactionFunction | null,
): boolean {
  if (movement.status !== 'PENDING') return false;
  if (selectedFunction && !movementTypeMatchesFunction(selectedFunction, movement.movementType)) return false;

  const strategy = selectedFunction ? deriveFunctionStrategy(selectedFunction) : null;
  const deferredMovementType = strategy?.checkerRelease.deferSettlement
    ? (selectedFunction?.deferSettlementMovementType ?? 'UTILIZE')
    : null;

  // A3/A3S acknowledgment completes their Checker step; the movement is retained for A4/A6.
  if (deferredMovementType && movement.movementType === deferredMovementType && movement.acknowledgedAt) return false;

  // A4 can release the retained movement only after A3/A3S acknowledgment and A4 Maker submission.
  const releasesExistingMovement = !!strategy?.checkerRelease.releasesExistingMovementInPlace;
  if (
    releasesExistingMovement &&
    movement.movementType === 'UTILIZE' &&
    (!movement.acknowledgedAt || !movement.makerSubmittedAt)
  ) {
    return false;
  }

  return true;
}
