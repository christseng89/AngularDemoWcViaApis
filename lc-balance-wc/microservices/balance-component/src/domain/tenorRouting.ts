/**
 * Design doc §7 Tenor Type Routing (business instruction 2026-08-14, "不然流程控制無法處理 這也是BALANCE
 * COMPONENT範圍之一") — a Sight LC never produces an Acceptance (must settle via UTILIZE/A4, never A5),
 * and an Acceptance's own tenorType must match its parent LC's own declared tenorType (set at ISSUE).
 *
 * Extracted from `BalanceService.createMovement()`'s own inline "creating a new contract" branch
 * (desiger-comments.md finding F-02, "createMovement()... a distinct per-instrument sufficiency check
 * (SHGT vs. parent Tight Available, Acceptance tenor consistency, Present-Docs earmark) all as
 * sequential inline `if` blocks") — pure code motion: every condition and error message is
 * byte-for-byte identical to what `createMovement()` threw directly before this extraction. The
 * service layer still owns resolving the parent contract and deciding which Error class to throw
 * (`RequestValidationError`) — this module stays anemic/pure, same convention as
 * `amendDecrease.ts`/`offBalanceExposure.ts`'s own sufficiency checks.
 */
import type { TenorType } from '../types';

export interface AcceptanceTenorCheckResult {
  ok: boolean;
  error?: string;
}

export function checkAcceptanceTenorConsistency(params: {
  /** The parent LC's own declared tenorType (set at ISSUE) — undefined/null when the parent wasn't found or never declared one (legacy). */
  parentTenorType: TenorType | null | undefined;
  /** Only used to compose the Sight-LC rejection message. */
  parentBalanceContractId: string | undefined;
  /** The Acceptance CREATE request's own tenorType, if the caller supplied one. */
  requestedTenorType: TenorType | null | undefined;
}): AcceptanceTenorCheckResult {
  const { parentTenorType, parentBalanceContractId, requestedTenorType } = params;

  if (parentTenorType === 'SIGHT') {
    return {
      ok: false,
      error:
        `Cannot Create Acceptance under a Sight LC (parent ${parentBalanceContractId} was Issued with tenorType=SIGHT) — ` +
        `a Sight presentation settles via UTILIZE alone (Design doc §7 Tenor Type Routing: Sight -> A4, never A5).`,
    };
  }

  if (parentTenorType && requestedTenorType && parentTenorType !== requestedTenorType) {
    return {
      ok: false,
      error:
        `Acceptance tenorType (${requestedTenorType}) does not match its parent LC's own declared tenorType ` +
        `(${parentTenorType}, set at Issue) — the two must agree.`,
    };
  }

  return { ok: true };
}
