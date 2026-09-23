import { formatMonetaryAmount, parseMonetaryAmount } from '../money';
import type { ExcessWorkflowStatus } from '../types';

export type CheckerExcessDecisionPoint = 'OWN_CHECKER_RELEASE' | 'ACKNOWLEDGE' | 'DOWNSTREAM_FINAL_RELEASE';

export interface CheckerExcessLifecycleInput {
  functionCode: 'A3' | 'A3S' | 'B3';
  decisionPoint: CheckerExcessDecisionPoint;
}

export interface CheckerExcessLifecyclePlan {
  reservationAction: 'RETAIN_PENDING' | 'CONVERT_TO_APPROVED';
  movementAction: 'RELEASE_SELF' | 'KEEP_SOURCE_PENDING' | 'FINALISE_REFERENCED_SOURCE';
  applyA3SOnceOnlyEffects: boolean;
}

/** BD-09 decision table. Persistence is applied atomically by the release orchestration layer. */
export function planCheckerExcessLifecycle(input: CheckerExcessLifecycleInput): CheckerExcessLifecyclePlan {
  if (input.functionCode === 'B3' && input.decisionPoint === 'OWN_CHECKER_RELEASE') {
    return {
      reservationAction: 'CONVERT_TO_APPROVED',
      movementAction: 'RELEASE_SELF',
      applyA3SOnceOnlyEffects: false,
    };
  }
  if ((input.functionCode === 'A3' || input.functionCode === 'A3S') && input.decisionPoint === 'ACKNOWLEDGE') {
    return {
      reservationAction: 'RETAIN_PENDING',
      movementAction: 'KEEP_SOURCE_PENDING',
      applyA3SOnceOnlyEffects: input.functionCode === 'A3S',
    };
  }
  if ((input.functionCode === 'A3' || input.functionCode === 'A3S') && input.decisionPoint === 'DOWNSTREAM_FINAL_RELEASE') {
    return {
      reservationAction: 'CONVERT_TO_APPROVED',
      movementAction: 'FINALISE_REFERENCED_SOURCE',
      applyA3SOnceOnlyEffects: false,
    };
  }
  throw new Error(`${input.functionCode}/${input.decisionPoint} is not a valid Checker Excess lifecycle combination.`);
}

export interface WholeDeletePendingInput {
  workflowStatus: ExcessWorkflowStatus;
  pendingReservationOwner: string;
}

export interface WholeDeletePendingPlan {
  nextWorkflowStatus: 'DELETED';
  reservationReleaseOwner: string;
  approvedExcessDeltaOwner: '0';
}

const ALLOWED_INPUT_KEYS = new Set<keyof WholeDeletePendingInput>(['workflowStatus', 'pendingReservationOwner']);

/**
 * BD-07 pure policy. Delete Pending is a whole-movement withdrawal, never a
 * partial return and never an Approved Excess reversal. Persistence and audit
 * atomicity are applied by the Task 3.8 orchestration layer.
 */
export function planWholeDeletePending(input: WholeDeletePendingInput): WholeDeletePendingPlan {
  const unexpectedKeys = Object.keys(input).filter((key) => !ALLOWED_INPUT_KEYS.has(key as keyof WholeDeletePendingInput));
  if (unexpectedKeys.length > 0) throw new Error('Delete Pending does not accept amount or partial indicators; it applies to the whole movement.');
  if (input.workflowStatus !== 'PENDING' && input.workflowStatus !== 'REJECTED') {
    throw new Error(`${input.workflowStatus} Excess facts cannot be deleted.`);
  }

  const retainedReservation = parseMonetaryAmount(input.pendingReservationOwner);
  if (retainedReservation.isNegative()) throw new Error('Pending Excess Reservation must be non-negative.');

  return {
    nextWorkflowStatus: 'DELETED',
    reservationReleaseOwner: formatMonetaryAmount(retainedReservation),
    approvedExcessDeltaOwner: '0',
  };
}
