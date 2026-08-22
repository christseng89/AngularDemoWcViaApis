/**
 * Design doc §6.2 — AMEND_DECREASE sufficiency check. Always compares the
 * already Tolerance-converted `ceilingAmount` (see domain/tolerance.ts)
 * against Tight Available Balance — never the raw, caller-typed face-level
 * `amount`. This single check subsumes "face amount cannot go negative" too
 * (proven algebraically in the design doc §6.2): as long as tolerancePct is
 * ≥ 0, ceilingAmount > Tight Available Balance is mathematically equivalent
 * to the resulting new face amount being less than what is already
 * utilized — which, since utilized amounts are never negative, also
 * catches a decrease that would drive the face amount below zero. No
 * separate floor check is needed; Tight Available Balance is always ≤ plain
 * Available Balance (it additionally excludes not-yet-Released increases
 * and nets out off-balance-sheet exposure), so this proof — originally
 * stated against plain Available Balance — carries over a fortiori.
 *
 * Basis changed 2026-08-20 ("A2 Decrease 輸入金額控制規則 B2, A3 & B3 都適用" — business
 * instruction confirming the same rule already applied to A3/B3's own `checkUtilizeSufficiency`/
 * `checkPresentDocsIssueSufficiency` must also govern A2/B2's own Decrease): previously compared
 * against plain Available Balance, which could let a Decrease shrink the LC's own ceiling BELOW its
 * outstanding off-balance-sheet exposure (e.g. a Shipping Guarantee's own outstanding amount) — the
 * exact over-commitment risk this whole component exists to prevent (Design doc §6.1). Live-reproduced
 * on U01 (Confirmed 100, offBalanceExposure 10 from an outstanding SG, plain Available 100, Tight
 * Available 90): a Decrease of 95 used to pass (95 ≤ 100) even though it would leave only 5 of real
 * capacity under an SG still outstanding for 10 — now correctly rejected (95 > 90).
 *
 * The error message deliberately echoes BOTH the caller's raw face-level
 * `amount` and the derived `ceilingAmount` side by side — a reviewer
 * working through this exact check confused the two ("is 120,000 a
 * face-level decrease, or a Ceiling/Maximum-Liability-level decrease?"),
 * which is exactly the ambiguity a bare "ceilingAmount exceeds Tight
 * Available Balance" message would leave unresolved for anyone hitting
 * this in production.
 */
import Decimal from 'decimal.js';

/** Discriminated union (2026-08-20, reviewer-directed) — see tenorRouting.ts's AcceptanceTenorCheckResult own doc comment for why. */
export type AmendDecreaseCheckResult = { ok: true } | { ok: false; error: string; reasonCode: 'AMEND_DECREASE_EXCEEDS_TIGHT_AVAILABLE_BALANCE' };

export function checkAmendDecreaseSufficiency(params: {
  /** The caller's raw, face-level decrease amount (never itself compared against tightAvailableBalance — shown in the error purely for disambiguation). */
  amount: Decimal;
  /** amount × (1 + tolerancePct/100) — see domain/tolerance.ts. This is what is actually compared against tightAvailableBalance. */
  ceilingAmount: Decimal;
  /** Confirmed Balance minus still-PENDING decrease(s) minus outstanding off-balance-sheet exposure — the exact same figure BalanceSnapshot.tightAvailableBalance persists for this contract's own instrumentType (SHGT exposure for IPLC_LC/EPLC_LC, Present Docs Earmark for EPLC_CONFIRMATION). */
  tightAvailableBalance: Decimal;
}): AmendDecreaseCheckResult {
  const { amount, ceilingAmount, tightAvailableBalance } = params;
  if (ceilingAmount.greaterThan(tightAvailableBalance)) {
    return {
      ok: false,
      error:
        `Amendment decrease rejected: face-level amount ${amount.toFixed()} converts to a ` +
        `Tolerance-adjusted Ceiling-level decrease of ${ceilingAmount.toFixed()} (never the raw ` +
        `${amount.toFixed()} itself — AMEND_DECREASE.amount is always face-level, per Design doc ` +
        `§6.2), which exceeds Tight Available Balance (${tightAvailableBalance.toFixed()} — only ` +
        `APPROVED amounts count as usable capacity, and outstanding off-balance-sheet exposure is ` +
        `netted out). This would drive the LC's face amount negative, below what is already ` +
        `utilized, or below its own outstanding off-balance-sheet exposure.`,
      reasonCode: 'AMEND_DECREASE_EXCEEDS_TIGHT_AVAILABLE_BALANCE',
    };
  }
  return { ok: true };
}
