/**
 * Design doc §3.3 — the derived query-time balance numbers. All of these are
 * computed from a list of BalanceMovement rows, never stored directly.
 *
 * MOVEMENT_DIRECTION covers every movementType with a FIXED direction of its own. CANCEL is still not
 * included (not exercised by any walked-through case — extend before relying on it). `REVERSAL` is
 * deliberately NOT in this table — per §4.5 its effect is the FLIPPED sign of the movement it reverses,
 * not a fixed direction of its own; `signedAmount()` below special-cases it, resolving the pointed-to
 * original movement's own direction (via `reversalOfMovementId`) from the SAME movements list every
 * caller here already passes in, and flips it. F1 (external BA review, 2026-08-25) added `EXPIRE`
 * (fixed, like CLOSE) and this REVERSAL dynamic-direction handling.
 */
import Decimal from 'decimal.js';
import { parseMonetaryAmount, ZERO } from '../money';
import type { BalanceMovement } from '../types';

export const MOVEMENT_DIRECTION: Readonly<Record<string, 1 | -1 | 0>> = {
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
  // F1 (external BA review, 2026-08-25) — AUTO EXPIRY. Same write-off direction as CLOSE (the date-
  // triggered analog of it) — see domain/expiryEligibility.ts's own doc comment for the preconditions.
  EXPIRE: -1,
  // A11/B7 Reopen — redesigned 2026-08-25 after live UAT (see domain/reopenRestoration.ts's own top doc
  // comment for the full rationale): REOPEN now carries its OWN real, positive restoration amount
  // (computed by computeReopenRestoreAmount(), never typed by the Maker) directly, same "establish/
  // increase" direction as ISSUE/AMEND_INCREASE — no longer a 0-effect movement paired with a separate
  // linked REVERSAL leg.
  REOPEN: 1,
  // AMEND_EXPIRY_DATE is 0 for a plain ACTIVE amendment. An EXPIRED extension carries
  // reversalOfMovementId and is dynamically treated as the inverse of that EXPIRE by signedAmount().
  AMEND_EXPIRY_DATE: 0,
};

/** movementTypes whose `amount` field represents a face-level delta needing §6.2 Tolerance conversion before it contributes to Confirmed Balance — see domain/tolerance.ts. Confirmed/Available Balance derivation always uses ceilingAmount (already converted), never amount, so this list is informational/for callers assembling movements. */
export const TOLERANCE_APPLICABLE_MOVEMENT_TYPES: ReadonlySet<string> = new Set(['ISSUE', 'AMEND_INCREASE', 'AMEND_DECREASE', 'AMEND']);

/** Face-amount-affecting movementTypes — see computeFaceAmount. */
const FACE_AMOUNT_MOVEMENT_TYPES: ReadonlySet<string> = new Set(['ISSUE', 'AMEND_INCREASE', 'AMEND_DECREASE', 'AMEND']);

type ReversibleMovement = Pick<BalanceMovement, 'movementId' | 'movementType' | 'ceilingAmount' | 'reversalOfMovementId'>;

/**
 * F1 (external BA review) §11.2 — `REVERSAL`'s direction is dynamic: the flipped sign of the movement
 * it reverses (found via `reversalOfMovementId` within the SAME movements list `byId` was built from —
 * a REVERSAL always lives on the same contract's own movement history as the movement it reverses).
 * Resolving through `signedAmount` itself (not a fixed lookup) means a REVERSAL-of-a-REVERSAL would
 * also resolve correctly if one were ever created, though nothing in this codebase does that today.
 */
function signedAmount(m: ReversibleMovement, byId: ReadonlyMap<string, ReversibleMovement>): Decimal {
  if (m.movementType === 'REVERSAL' || (m.movementType === 'AMEND_EXPIRY_DATE' && m.reversalOfMovementId)) {
    const original = m.reversalOfMovementId ? byId.get(m.reversalOfMovementId) : undefined;
    if (!original) {
      throw new Error(`REVERSAL movement "${m.movementId}" has no resolvable reversalOfMovementId within the supplied movements list.`);
    }
    return signedAmount(original, byId).negated();
  }
  const direction = MOVEMENT_DIRECTION[m.movementType];
  if (direction === undefined) {
    throw new Error(`MOVEMENT_DIRECTION has no entry for movementType "${m.movementType}" — extend balanceDerivation.ts before using it here.`);
  }
  return parseMonetaryAmount(m.ceilingAmount).times(direction);
}

function byMovementId(movements: readonly ReversibleMovement[]): ReadonlyMap<string, ReversibleMovement> {
  return new Map(movements.map((m) => [m.movementId, m]));
}

/** Design doc §3.3 — Confirmed Balance = Σ RELEASED movements (Ceiling-level, i.e. ceilingAmount not amount). */
export function computeConfirmedBalance(movements: readonly (ReversibleMovement & Pick<BalanceMovement, 'status'>)[]): Decimal {
  const byId = byMovementId(movements);
  return movements.filter((m) => m.status === 'RELEASED').reduce((acc, m) => acc.plus(signedAmount(m, byId)), ZERO);
}

/** Design doc §3.3 — Available Balance = Confirmed Balance ± Σ PENDING movements. */
export function computeAvailableBalance(
  confirmedBalance: Decimal,
  movements: readonly (ReversibleMovement & Pick<BalanceMovement, 'status'>)[],
): Decimal {
  const byId = byMovementId(movements);
  // An Expiry Extension exposes its restoration voucher while PENDING for Checker review, but does not
  // restore usable balance until Release. Other PENDING movements retain their normal reservation logic.
  const pendingDelta = movements
    .filter((m) => m.status === 'PENDING' && m.movementType !== 'AMEND_EXPIRY_DATE')
    .reduce((acc, m) => acc.plus(signedAmount(m, byId)), ZERO);
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
export function computePendingDecreaseTotal(movements: readonly (ReversibleMovement & Pick<BalanceMovement, 'status'>)[]): Decimal {
  const byId = byMovementId(movements);
  return movements
    .filter((m) => m.status === 'PENDING')
    .reduce((acc, m) => {
      const signed = signedAmount(m, byId);
      return signed.isNegative() ? acc.plus(signed.abs()) : acc;
    }, ZERO);
}

/**
 * Design doc §3.3/§6.2 — LC 面額 faceAmount, tracked independently of
 * Confirmed Balance because UTILIZE reduces Confirmed Balance without ever
 * touching the face amount. Sums RELEASED ISSUE/AMEND_INCREASE/AMEND_DECREASE
 * movements' own `amount` (face-level, NOT ceilingAmount). EPLC_CONFIRMATION
 * uses signed `AMEND` amounts, while IPLC_LC uses the split increase/decrease
 * movement types.
 */
export function computeFaceAmount(movements: readonly Pick<BalanceMovement, 'movementType' | 'amount' | 'status'>[]): Decimal {
  return movements
    .filter((m) => m.status === 'RELEASED' && FACE_AMOUNT_MOVEMENT_TYPES.has(m.movementType))
    .reduce((acc, m) => {
      // FACE_AMOUNT_MOVEMENT_TYPES contains only values registered in MOVEMENT_DIRECTION.
      const direction = MOVEMENT_DIRECTION[m.movementType] as 1 | -1;
      return acc.plus(parseMonetaryAmount(m.amount).times(direction));
    }, ZERO);
}
