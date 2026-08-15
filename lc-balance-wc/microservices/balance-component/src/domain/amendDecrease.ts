/**
 * Design doc §6.2 — AMEND_DECREASE sufficiency check. Always compares the
 * already Tolerance-converted `ceilingAmount` (see domain/tolerance.ts)
 * against Available Balance — never the raw, caller-typed face-level
 * `amount`. This single check subsumes "face amount cannot go negative" too
 * (proven algebraically in the design doc §6.2): as long as tolerancePct is
 * ≥ 0, ceilingAmount > Available Balance is mathematically equivalent to the
 * resulting new face amount being less than what is already utilized —
 * which, since utilized amounts are never negative, also catches a decrease
 * that would drive the face amount below zero. No separate floor check is
 * needed.
 *
 * The error message deliberately echoes BOTH the caller's raw face-level
 * `amount` and the derived `ceilingAmount` side by side — a reviewer
 * working through this exact check confused the two ("is 120,000 a
 * face-level decrease, or a Ceiling/Maximum-Liability-level decrease?"),
 * which is exactly the ambiguity a bare "ceilingAmount exceeds Available
 * Balance" message would leave unresolved for anyone hitting this in
 * production.
 */
import Decimal from 'decimal.js';

export interface AmendDecreaseCheckResult {
  ok: boolean;
  error?: string;
}

export function checkAmendDecreaseSufficiency(params: {
  /** The caller's raw, face-level decrease amount (never itself compared against availableBalance — shown in the error purely for disambiguation). */
  amount: Decimal;
  /** amount × (1 + tolerancePct/100) — see domain/tolerance.ts. This is what is actually compared against availableBalance. */
  ceilingAmount: Decimal;
  availableBalance: Decimal;
}): AmendDecreaseCheckResult {
  const { amount, ceilingAmount, availableBalance } = params;
  if (ceilingAmount.greaterThan(availableBalance)) {
    return {
      ok: false,
      error:
        `Amendment decrease rejected: face-level amount ${amount.toFixed()} converts to a ` +
        `Tolerance-adjusted Ceiling-level decrease of ${ceilingAmount.toFixed()} (never the raw ` +
        `${amount.toFixed()} itself — AMEND_DECREASE.amount is always face-level, per Design doc ` +
        `§6.2), which exceeds Available Balance (${availableBalance.toFixed()}). This would drive ` +
        `the LC's face amount negative or below what is already utilized.`,
    };
  }
  return { ok: true };
}
