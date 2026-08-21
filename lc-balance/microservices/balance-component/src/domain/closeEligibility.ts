/**
 * A10 (Import LC Close) / B6 (Export Confirmed LC Close) — eligibility for writing off a root LC/
 * Confirmation's remaining Confirmed Balance and retiring it (`ContractStatus.CLOSED`, reserved in
 * types.ts since the original design but never previously set anywhere). Modelled on
 * cs-tf-balance-knowhow's rationale §3.9/§7.7 "cancellation before expiry" — same write-off entry as a
 * natural expiry, but Maker/Checker-triggered rather than date-triggered.
 *
 * One shared function, called from THREE places (service/balanceService.ts): the Step-1 catalog-picker
 * hint list, createMovement()'s own sufficiency check at Maker Submit, and release()'s own re-check at
 * Checker Approve — so a candidate that stops qualifying between Submit and Approve is caught, not just
 * one that never qualified. "No open Events" is evaluated across the WHOLE event tree (the root's own
 * movements plus every SG/Acceptance/Examination child's own movements), not just the root contract's
 * own history — a still-PENDING event anywhere under this LC, or (Export only) a RELEASED-but-not-yet-
 * `presentDocsConsumedAt` Present Docs presentation (B3 approved but B4 hasn't Honoured/Accepted it yet —
 * `status === 'RELEASED'` alone doesn't mean this exposure is actually resolved, see
 * domain/offBalanceExposure.ts's own computePresentDocsEarmark doc comment for the same distinction),
 * both block Close.
 */
import Decimal from 'decimal.js';

export interface CloseEligibilityInputs {
  /** Already CLOSED — most callers never reach this (an already-CLOSED contract stops resolving via
   * findActiveByNaturalKey/findActiveByLogicalContractId), but release()'s own re-check reads the
   * contract by balanceContractId directly, which still resolves regardless of status. */
  alreadyClosed: boolean;
  /** Σ RELEASED movements on the root LC/Confirmation itself — the figure Close writes off. Always >= 0
   * by construction (every decrease-shaped movement already passes its own sufficiency check), so this
   * is never itself a blocking condition — kept here for the caller to also verify the submitted Close
   * amount equals it exactly, not decided inside this function. */
  rootConfirmedBalance: Decimal;
  /** Σ RELEASED movements across every SHGT child (0 for a non-IPLC_LC root, or an IPLC_LC with no SG). */
  sgConfirmedBalance: Decimal;
  /** Σ RELEASED movements across every IPLC_ACCEPTANCE/EPLC_ACCEPTANCE child. */
  acceptanceConfirmedBalance: Decimal;
  /** True when the root's own movements, or any SG/Acceptance/Examination child's own movements, contain
   * an event that is not yet fully resolved — see this module's own top doc comment for the exact rule. */
  hasOpenEvents: boolean;
}

export interface CloseEligibilityResult {
  eligible: boolean;
  /** Empty when eligible. One entry per failed condition — a Checker-facing message should join all of
   * them, never just the first, so a genuinely separate second problem isn't hidden behind the first. */
  reasons: string[];
}

export function evaluateCloseEligibility(inputs: CloseEligibilityInputs): CloseEligibilityResult {
  const reasons: string[] = [];

  if (inputs.alreadyClosed) {
    reasons.push('This LC/Confirmation has already been Closed.');
  }
  if (!inputs.sgConfirmedBalance.isZero()) {
    reasons.push(`Shipping Guarantee Balance must be 0 (currently ${inputs.sgConfirmedBalance.toFixed()}) — redeem the Shipping Guarantee first (A9).`);
  }
  if (!inputs.acceptanceConfirmedBalance.isZero()) {
    reasons.push(`Acceptance Balance must be 0 (currently ${inputs.acceptanceConfirmedBalance.toFixed()}) — settle the Acceptance first (A7/B5).`);
  }
  if (inputs.hasOpenEvents) {
    reasons.push('One or more Events under this LC (including child ledgers) are not yet fully resolved.');
  }

  return { eligible: reasons.length === 0, reasons };
}
