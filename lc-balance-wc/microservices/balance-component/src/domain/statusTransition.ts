/**
 * Design doc §4 (Maker/Checker state machine) + §8 (illegal transitions must
 * fail loudly, never be silently accepted as a no-op success).
 *
 * Maker and Checker being the same person is NOT enforced here — that is a
 * system-authorization/permission concern (a bank's own role/entitlement
 * policy), out of scope for this service's own state machine (business
 * instruction, 2026-08-14). `createdBy`/`actingUser` are still carried
 * through purely as audit metadata (who did what), not as an eligibility
 * check.
 *
 * Pure function: takes the movement's current status and the requested
 * action, returns the new status or throws. No I/O — the caller (store
 * layer) is responsible for loading the current row and persisting the
 * result inside its own transaction.
 */
import { IllegalStateTransitionError } from '../errors';
import type { MovementStatus } from '../types';

export type MovementAction = 'RELEASE' | 'REJECT' | 'CANCEL' | 'EDIT';

/** §4's state diagram, expressed as legal (fromStatus, action) -> toStatus pairs. */
const LEGAL_TRANSITIONS: Record<MovementStatus, Partial<Record<MovementAction, MovementStatus>>> = {
  PENDING: { RELEASE: 'RELEASED', REJECT: 'REJECTED', CANCEL: 'CANCELLED', EDIT: 'SUPERSEDED' },
  REJECTED: { CANCEL: 'CANCELLED', EDIT: 'SUPERSEDED' },
  RELEASED: {},
  CANCELLED: {},
  SUPERSEDED: {},
};

export interface ApplyTransitionInput {
  currentStatus: MovementStatus;
  action: MovementAction;
  /** Audit metadata only — see this file's top comment. */
  createdBy: string;
  /** Audit metadata only (who performed this action) — see this file's top comment. */
  actingUser: string;
}

/**
 * Returns the new MovementStatus for a legal transition, or throws
 * IllegalStateTransitionError when the current status has no legal path for
 * the requested action.
 */
export function applyStatusTransition(input: ApplyTransitionInput): MovementStatus {
  const { currentStatus, action } = input;

  const nextStatus = LEGAL_TRANSITIONS[currentStatus][action];
  if (nextStatus === undefined) {
    throw new IllegalStateTransitionError(
      `Cannot ${action} a movement currently in status ${currentStatus} — not a legal transition per Design doc §4.`,
    );
  }
  return nextStatus;
}
