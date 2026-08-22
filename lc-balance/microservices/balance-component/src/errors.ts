/**
 * Typed errors mapping 1:1 onto balance-component-api.yaml's response codes.
 * Mirrors payment-component/src/errors.ts's convention.
 */
import type { ApiErrorBody } from './types';

export abstract class ApiError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly code: string;

  /**
   * v1.17.0 — was previously accepted by nothing: every subclass relied on the implicit no-arg
   * constructor chain up to `Error(message)`, so `details` had no way to reach `toBody()` even though
   * `ApiErrorBody.details` had been declared in `types.ts` since v1.1.0. See OAS-GAP-06's own
   * `reasonCode` design (`Balance Contract Integration Proposal.md`) — undocumented-but-live vs.
   * documented-but-unreachable are both real bugs; this fixes the latter.
   */
  constructor(message: string, readonly details?: Record<string, unknown>) {
    super(message);
  }

  toBody(): ApiErrorBody {
    return this.details ? { code: this.code, message: this.message, details: this.details } : { code: this.code, message: this.message };
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

/** Design doc §8 — duplicate (logicalContractId, contractVersion). */
export class ContractVersionConflictError extends ApiError {
  readonly httpStatus = 409;
  readonly code = 'CONTRACT_VERSION_CONFLICT';
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
