/**
 * Design doc §4 (Maker/Checker state machine) + §8 (illegal transitions must
 * fail loudly, never be silently accepted as a no-op success).
 *
 * Maker and Checker being the same person IS enforced here for RELEASE/REJECT
 * (business-confirmed 2026-08-24, genuine 4-eyes separation) — supersedes the
 * original 2026-08-14 posture of leaving this to a bank's own role/entitlement
 * policy, out of scope for this service. `createdBy`/`actingUser` are no
 * longer purely audit metadata for those two actions; see
 * `assertMakerCheckerSeparation()` below. CANCEL is untouched — it is a
 * Maker's own Error Correction on their OWN still-PENDING entry (distinct
 * from REJECT, a Checker's decline), so `createdBy === actingUser` there is
 * the expected, correct case, not a conflict.
 *
 * Pure function: takes the movement's current status and the requested
 * action, returns the new status or throws. No I/O — the caller (store
 * layer) is responsible for loading the current row and persisting the
 * result inside its own transaction.
 */
import { IllegalStateTransitionError, MakerCheckerConflictError } from '../errors';
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
  /** For RELEASE/REJECT, checked against `actingUser` — see this file's top comment. Audit metadata only for CANCEL/EDIT. */
  createdBy: string;
  /** Who performed this action. For RELEASE/REJECT, checked against `createdBy` — see this file's top comment. */
  actingUser: string;
}

/**
 * Business-confirmed 2026-08-24 — genuine 4-eyes separation: the same user who created a movement
 * cannot also Release or Reject it. Exported separately (not folded silently into
 * `applyStatusTransition()`'s own body) so `acknowledgeArrival()` in `service/balanceService.ts` —
 * a genuine Checker action that does NOT go through `applyStatusTransition()` at all, since it
 * deliberately never changes `status` — can apply the exact same rule.
 */
export function assertMakerCheckerSeparation(createdBy: string, actingUser: string, action: 'RELEASE' | 'REJECT' | 'ACKNOWLEDGE'): void {
  if (createdBy === actingUser) {
    throw new MakerCheckerConflictError(
      `Cannot ${action.toLowerCase()} — the Maker (${createdBy}) and Checker cannot be the same user (genuine 4-eyes separation required).`,
    );
  }
}

/**
 * Returns the new MovementStatus for a legal transition, or throws
 * IllegalStateTransitionError when the current status has no legal path for
 * the requested action. For RELEASE/REJECT, also enforces
 * `assertMakerCheckerSeparation()` above — CANCEL/EDIT are untouched, see
 * this file's own top doc comment for why.
 */
export function applyStatusTransition(input: ApplyTransitionInput): MovementStatus {
  const { currentStatus, action, createdBy, actingUser } = input;

  if (action === 'RELEASE' || action === 'REJECT') {
    assertMakerCheckerSeparation(createdBy, actingUser, action);
  }

  const nextStatus = LEGAL_TRANSITIONS[currentStatus][action];
  if (nextStatus === undefined) {
    throw new IllegalStateTransitionError(`Cannot ${action} a movement currently in status ${currentStatus} — not a legal transition per Design doc §4.`);
  }
  return nextStatus;
}
