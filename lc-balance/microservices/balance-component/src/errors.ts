/**
 * Typed errors mapping 1:1 onto balance-component-api.yaml's response codes.
 * Mirrors payment-component/src/errors.ts's convention.
 */
import type { ApiErrorBody } from './types';

export abstract class ApiError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly code: string;

  toBody(): ApiErrorBody {
    return { code: this.code, message: this.message };
  }
}

export class RequestValidationError extends ApiError {
  readonly httpStatus = 400;
  readonly code = 'REQUEST_VALIDATION_FAILED';
}

/** Design doc §6 ERROR — insufficient Available Balance. */
export class InsufficientBalanceError extends ApiError {
  readonly httpStatus = 409;
  readonly code = 'INSUFFICIENT_AVAILABLE_BALANCE';
}

/**
 * Design doc §8 — an illegal MovementStatus transition (e.g. RELEASE on an
 * already-RELEASED/REJECTED record) must fail loudly, never be silently
 * accepted as a no-op success. This is the Maker-Checker integrity guard.
 */
export class IllegalStateTransitionError extends ApiError {
  readonly httpStatus = 409;
  readonly code = 'ILLEGAL_STATE_TRANSITION';
}

export class NotFoundError extends ApiError {
  readonly httpStatus = 404;
  readonly code = 'NOT_FOUND';
}

/**
 * Design doc §3.3 "呼叫端的實際使用方式" — a creating movementType
 * (ISSUE/CREATE) submitted against a natural key that ALREADY resolves to
 * an ACTIVE Logical Contract must be rejected, not silently treated as an
 * ordinary movement against the existing one (business-reported gap
 * 2026-08-14: re-Issuing the same LC Number was silently adding a second
 * ISSUE movement on top of the existing Confirmed Balance instead of being
 * rejected). Use AMEND_INCREASE/AMEND_DECREASE/AMEND to change an existing
 * contract's amount instead.
 */
export class NaturalKeyAlreadyExistsError extends ApiError {
  readonly httpStatus = 409;
  readonly code = 'NATURAL_KEY_ALREADY_EXISTS';
}

/**
 * A logical contract's currency is fixed at ISSUE and never changes for the life of that
 * contract or anything created under it — a caller-supplied `currency` that disagrees with
 * the resolved contract's (or, for a new child contract, its parent's) own stored currency is
 * rejected rather than silently recorded on the movement. `currency` itself stays a required
 * request field (unlike the OAS-GAP-16 "derive/omit" design that was proposed and reverted) —
 * this only adds the missing consistency check on the value the caller must still supply.
 */
export class CurrencyMismatchError extends ApiError {
  readonly httpStatus = 409;
  readonly code = 'CURRENCY_MISMATCH';
}

/**
 * Business-confirmed 2026-08-24 (genuine 4-eyes Maker/Checker separation) — supersedes
 * `domain/statusTransition.ts`'s own earlier 2026-08-14 posture of leaving this to a bank's own
 * role/entitlement policy. The same user who created a movement (`createdBy`) can no longer also
 * Release/Reject/acknowledge it — see `applyStatusTransition()`'s own doc comment for where this
 * is actually checked.
 */
export class MakerCheckerConflictError extends ApiError {
  readonly httpStatus = 409;
  readonly code = 'MAKER_CHECKER_CONFLICT';
}
