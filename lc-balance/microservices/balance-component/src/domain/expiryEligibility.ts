/**
 * F1 (external BA review, 2026-08-25) — AUTO EXPIRY (`movementType: 'EXPIRE'`) eligibility, and the
 * Extension Amendment / Reopen concurrency guard that reuses the same `hasOpenEvents` shape.
 *
 * Deliberately NOT `domain/closeEligibility.ts`'s `evaluateCloseEligibility()` — that function's SG/
 * Acceptance-balance-must-be-zero conditions are designed for the opposite semantics ("business already
 * fully wound down, a human just hasn't clicked Close yet"). Applying them to EXPIRE would make it
 * unable to trigger in exactly the cases it matters most (an LC past its expiry date that still has an
 * outstanding SG or Acceptance) — see this repo's `analysis/Balance-Component-F1-Expire-Proposal-zh.md`
 * §7.2 for the reviewed rationale. EXPIRE only needs: the contract hasn't already left ACTIVE, and
 * nothing else is mid-flight against its own event tree (`hasOpenEvents`, the SAME concurrency-safety
 * concept `evaluateCloseEligibility()` uses, computed the same way — see
 * `service/balanceService.ts`'s own shared tree-walk helper).
 */

export interface ExpiryEligibilityInputs {
  /** Only an ACTIVE contract may EXPIRE — already EXPIRED/CLOSED/CANCELLED/SUPERSEDED are all terminal or already-transitioned. */
  contractStatus: string;
  /** Same concept as CloseEligibilityInputs.hasOpenEvents — see that type's own doc comment for the exact rule (whole event tree, not just this contract's own history). */
  hasOpenEvents: boolean;
}

export interface ExpiryEligibilityResult {
  eligible: boolean;
  reasons: string[];
}

export function evaluateExpiryEligibility(inputs: ExpiryEligibilityInputs): ExpiryEligibilityResult {
  const reasons: string[] = [];

  if (inputs.contractStatus !== 'ACTIVE') {
    reasons.push(`This LC/Confirmation is not ACTIVE (current status: ${inputs.contractStatus}) — only an ACTIVE contract can EXPIRE.`);
  }
  if (inputs.hasOpenEvents) {
    reasons.push('One or more Events under this LC (including child ledgers) are not yet fully resolved.');
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * `expiryDate + mailFloatGraceDays` gate, kept as a pure date-math function separate from eligibility
 * above (same "one concern per function" convention as `domain/closeEligibility.ts`'s own split between
 * eligibility and amount checks). Deliberately NOT UCP 600 Art. 14(c)'s 21-day presentation period — a
 * different rule for a different event, never conflated (see `config.ts`'s own doc comment).
 *
 * Both `expiryDate` and `asOf` are YYYY-MM-DD (or a full ISO datetime — only the date portion is
 * compared) date strings; `mailFloatGraceDays` is whole days. Returns `false` (not past grace) when
 * `expiryDate` is null/undefined — a contract with no recorded expiry date can never AUTO EXPIRE.
 */
export function isPastExpiryGrace(expiryDate: string | null | undefined, mailFloatGraceDays: number, asOf: Date): boolean {
  if (!expiryDate) return false;
  const expiry = new Date(expiryDate);
  const graceEnd = new Date(expiry.getTime() + mailFloatGraceDays * 86_400_000);
  return asOf.getTime() > graceEnd.getTime();
}
