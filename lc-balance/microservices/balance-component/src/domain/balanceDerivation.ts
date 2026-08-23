/**
 * Design doc §3.3 — the derived query-time balance numbers. All of these are
 * computed from a list of BalanceMovement rows, never stored directly.
 *
 * MOVEMENT_DIRECTION covers exactly the movementTypes this prototype's Case
 * 1-5 test vectors exercise (Cross-Reference/Design-doc §5). CANCEL/EXPIRE/
 * REVERSAL are deliberately NOT included yet — REVERSAL needs special
 * handling (its effect is the flipped sign of the ORIGINAL movement, per
 * §4.5, not a fixed direction of its own) and CANCEL/EXPIRE are not
 * exercised by any of the walked-through cases. Extend this table before
 * relying on it for those movementTypes.
 */
import Decimal from 'decimal.js';
import { parseMonetaryAmount, ZERO } from '../money';
import type { BalanceMovement } from '../types';

export const MOVEMENT_DIRECTION: Readonly<Record<string, 1 | -1>> = {
  // IPLC_LC / EPLC_LC
  ISSUE: 1,
  AMEND_INCREASE: 1,
  AMEND_DECREASE: -1,
  UTILIZE: -1,
  // IPLC_ACCEPTANCE / EPLC_ACCEPTANCE
  CREATE: 1,
  PARTIAL_SETTLE: -1,
  FULL_SETTLE: -1,
  // SHGT (v0.6 — REDEEM split into PARTIAL_REDEEM/FULL_REDEEM, see domain/shgtRedeem.ts)
  PARTIAL_REDEEM: -1,
  FULL_REDEEM: -1,
  // EPLC_CONFIRMATION (Export LC design, business-confirmed 2026-08-14: CONF_LIAB
  // is created via ISSUE, permanently reduced at Sight HONOUR or Usance ACCEPT —
  // ACCEPT also triggers a linked CREATE on EPLC_ACCEPTANCE, orchestrated by the
  // caller as a second call, same "one movement, one call" shape as IPLC_LC's own
  // UTILIZE+CREATE pattern, see §7.4)
  AMEND: 1,
  HONOUR: -1,
  ACCEPT: -1,
  // EPLC_DUE_FROM_ISSUING_BANK / EPLC_ACCEPTANCE_REIMB_RECEIVABLE / EPLC_EXPORT_BILLS_DISCOUNTED
  // (2026-08-15, Export Confirmation Gap Analysis §4.1) — CREATE books the asset when the caller's
  // second linked call fires alongside HONOUR/ACCEPT (same compound-movement shape as SHGT's own
  // ISSUE/FULL_REDEEM); REIMBURSE (CNF_REIMB) and RECLASSIFY_OUT (CNF_DISCOUNT's outgoing leg) both
  // clear it, same OUTSTANDING_CAPPED shape as PARTIAL_REDEEM/FULL_REDEEM above.
  REIMBURSE: -1,
  RECLASSIFY_OUT: -1,
  // IPLC_LC / EPLC_LC / EPLC_CONFIRMATION — A10/B6 Close (cs-tf-balance-knowhow §3.9/§7.7's "cancellation
  // before expiry" analog: writes off whatever Confirmed Balance remains, same direction as AMEND_DECREASE/
  // UTILIZE). domain/closeEligibility.ts's own doc comment covers the preconditions gating this movement.
  CLOSE: -1,
  // A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §2/§3 (2026-08-23) — A2/B2 Extend Expiry.
  // Numerically inert: amount is always exactly "0" for this movementType (see BalanceService's own
  // assertValidAmount() AMEND_EXPIRY branch), so ceilingAmount is always "0" and this direction sign
  // never actually moves any balance — present only so signedAmount() below doesn't throw for it.
  AMEND_EXPIRY: 1,
  // A6/B4 Calculated Maturity Date (2026-08-23) — A2/B2 Update Maturity Date Calendars. Same
  // numerically-inert reasoning as AMEND_EXPIRY immediately above — amount is always exactly "0" for
  // this movementType too (see BalanceService's own assertValidAmount() AMEND_MATURITY_CALENDARS
  // branch).
  AMEND_MATURITY_CALENDARS: 1,
};

/** movementTypes whose `amount` field represents a face-level delta needing §6.2 Tolerance conversion before it contributes to Confirmed Balance — see domain/tolerance.ts. Confirmed/Available Balance derivation always uses ceilingAmount (already converted), never amount, so this list is informational/for callers assembling movements. */
export const TOLERANCE_APPLICABLE_MOVEMENT_TYPES: ReadonlySet<string> = new Set(['ISSUE', 'AMEND_INCREASE', 'AMEND_DECREASE']);

/** Face-amount-affecting movementTypes — see computeFaceAmount. */
const FACE_AMOUNT_MOVEMENT_TYPES: ReadonlySet<string> = new Set(['ISSUE', 'AMEND_INCREASE', 'AMEND_DECREASE']);

function signedAmount(m: Pick<BalanceMovement, 'movementType' | 'ceilingAmount'>): Decimal {
  const direction = MOVEMENT_DIRECTION[m.movementType];
  if (direction === undefined) {
    throw new Error(`MOVEMENT_DIRECTION has no entry for movementType "${m.movementType}" — extend balanceDerivation.ts before using it here.`);
  }
  return parseMonetaryAmount(m.ceilingAmount).times(direction);
}

/** Design doc §3.3 — Confirmed Balance = Σ RELEASED movements (Ceiling-level, i.e. ceilingAmount not amount). */
export function computeConfirmedBalance(movements: readonly Pick<BalanceMovement, 'movementType' | 'ceilingAmount' | 'status'>[]): Decimal {
  return movements.filter((m) => m.status === 'RELEASED').reduce((acc, m) => acc.plus(signedAmount(m)), ZERO);
}

/** Design doc §3.3 — Available Balance = Confirmed Balance ± Σ PENDING movements. */
export function computeAvailableBalance(
  confirmedBalance: Decimal,
  movements: readonly Pick<BalanceMovement, 'movementType' | 'ceilingAmount' | 'status'>[],
): Decimal {
  const pendingDelta = movements.filter((m) => m.status === 'PENDING').reduce((acc, m) => acc.plus(signedAmount(m)), ZERO);
  return confirmedBalance.plus(pendingDelta);
}

/**
 * Business instruction 2026-08-20 ("Tight Available Balance 應該用 Confirmed LC Balance 減其他金額,
 * 因為 APPROVED 才可以動用" / "A2 B2 Decrease Submit 後，對 Tight LC Balance 也是減項") — Tight Available
 * Balance is now based on Confirmed Balance (RELEASED-only), not Available Balance, since a still-PENDING
 * INCREASE isn't genuinely usable capacity yet. But a still-PENDING DECREASE (AMEND_DECREASE/UTILIZE/
 * HONOUR/ACCEPT/etc.) is a commitment already reducing what's really left, so it must still count
 * immediately, not only once Released — otherwise two overlapping pending decreases (or a decrease and a
 * fresh draw) could each pass sufficiency in isolation. Σ the NEGATIVE-signed contribution only (never
 * netted against any PENDING increase on the same contract) of every currently-PENDING movement, as a
 * positive magnitude ready to subtract. See `service/balanceService.ts`'s own assembleSnapshot() and
 * `domain/offBalanceExposure.ts`'s three sufficiency checks for where this feeds into Tight Available
 * Balance.
 */
export function computePendingDecreaseTotal(movements: readonly Pick<BalanceMovement, 'movementType' | 'ceilingAmount' | 'status'>[]): Decimal {
  return movements
    .filter((m) => m.status === 'PENDING')
    .reduce((acc, m) => {
      const signed = signedAmount(m);
      return signed.isNegative() ? acc.plus(signed.abs()) : acc;
    }, ZERO);
}

/**
 * Design doc §3.3/§6.2 — LC 面額 faceAmount, tracked independently of
 * Confirmed Balance because UTILIZE reduces Confirmed Balance without ever
 * touching the face amount. Sums RELEASED ISSUE/AMEND_INCREASE/AMEND_DECREASE
 * movements' own `amount` (face-level, NOT ceilingAmount).
 */
export function computeFaceAmount(movements: readonly Pick<BalanceMovement, 'movementType' | 'amount' | 'status'>[]): Decimal {
  return movements
    .filter((m) => m.status === 'RELEASED' && FACE_AMOUNT_MOVEMENT_TYPES.has(m.movementType))
    .reduce((acc, m) => {
      const direction = MOVEMENT_DIRECTION[m.movementType];
      if (direction === undefined) {
        throw new Error(`MOVEMENT_DIRECTION has no entry for movementType "${m.movementType}".`);
      }
      return acc.plus(parseMonetaryAmount(m.amount).times(direction));
    }, ZERO);
}
