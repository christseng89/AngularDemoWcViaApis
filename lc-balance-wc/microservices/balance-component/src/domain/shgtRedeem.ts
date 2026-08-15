/**
 * Design doc §5 (v0.6) — SHGT PARTIAL_REDEEM/FULL_REDEEM sufficiency check, reused for any other
 * "clear no more than what's currently outstanding" movement with the same shape (Acceptance
 * FULL_SETTLE/PARTIAL_SETTLE; 2026-08-15, Export Confirmation Gap Analysis §4.2: REIMBURSE and
 * RECLASSIFY_OUT on the new asset-side instruments — EPLC_DUE_FROM_ISSUING_BANK,
 * EPLC_ACCEPTANCE_REIMB_RECEIVABLE, EPLC_EXPORT_BILLS_DISCOUNTED).
 * A redemption/settlement may release less than the record's full outstanding balance
 * (business-confirmed 2026-08-14, Import LC Case 4: a Shipping Guarantee covering the whole LC may
 * be redeemed only against the portion whose original documents have actually been
 * returned/cancelled), but can never exceed what is currently outstanding.
 *
 * Deliberately NEVER auto-derived from a UTILIZE/Document-Arrival amount, even when they happen to
 * match (Design doc §5/§6.1) — the caller submits the amount explicitly, based on the actual
 * business event, not inferred from any other movement.
 *
 * Bug fixed 2026-08-15 (found live: LC S001's SG G01 ended up with pendingEarmarkTotal -12000 /
 * availableBalance -5000 — a 7,000 FULL_REDEEM left PENDING, then a 5,000 PARTIAL_REDEEM against the
 * SAME SG was wrongly ACCEPTED on top of it, totalling 12,000 redeemed against a 7,000 outstanding
 * balance): this used to check against the record's Confirmed Balance (the static, RELEASED-only
 * figure), the same commitment-control mistake as checking AMEND_DECREASE/UTILIZE against Confirmed
 * instead of Available — it ignored every OTHER still-PENDING redemption already reserved against
 * this same record. Now checks against Available Balance (Confirmed ± PENDING), matching
 * checkUtilizeSufficiency/checkAmendDecreaseSufficiency's existing convention (balanceService.ts
 * already computes and passes `available`).
 */
import Decimal from 'decimal.js';

export interface RedeemCheckResult {
  ok: boolean;
  error?: string;
}

export function checkRedeemSufficiency(params: { redeemAmount: Decimal; sgAvailableBalance: Decimal }): RedeemCheckResult {
  const { redeemAmount, sgAvailableBalance } = params;
  if (redeemAmount.greaterThan(sgAvailableBalance)) {
    return {
      ok: false,
      error: `Amount ${redeemAmount.toFixed()} exceeds this record's Available Balance ${sgAvailableBalance.toFixed()} (Confirmed Balance minus any other still-PENDING settlement already reserved against it).`,
    };
  }
  return { ok: true };
}
