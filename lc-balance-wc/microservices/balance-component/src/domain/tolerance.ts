/**
 * Design doc §6.2 — Tolerance conversion for movements that establish or
 * amend a Maximum-Exposure-Basis liability. ISSUE applies tolerance directly
 * to its face amount. Monetary amendments compare the full old/new upper
 * limits and apply only the resulting exposure delta.
 *
 *   ceilingAmount = amount × (1 + tolerancePct/100)
 *
 * Applies to:
 *   - IPLC_LC/EPLC_LC's own ISSUE/AMEND_INCREASE/AMEND_DECREASE (the LC's
 *     own face amount -> Ceiling/Maximum LC Liability).
 *   - EPLC_CONFIRMATION's own ISSUE/AMEND (business-confirmed 2026-08-14,
 *     Export LC design: CONF LIAB is itself a Maximum-Exposure-Basis figure
 *     — "Confirm LC 100,000 w Tolerance 10% -> CONF LIAB 110,000" — the
 *     Confirming Bank's liability, not the underlying LC's own balance,
 *     carries the Tolerance buffer here since EPLC_LC is reference-only,
 *     see Design doc §1/§2 Export LC boundary notes).
 *
 * Never applies to SHGT/IPLC_ACCEPTANCE/EPLC_ACCEPTANCE (business confirmed
 * 2026-08-14: "Tolerance只有開證與修證適用...SG或IB就是SG AMOUNT或BILLS
 * AMOUNT" — Shipping Guarantee and Acceptance/Bills amounts are always
 * their own face value). Gated on BOTH instrumentType AND movementType, not
 * movementType alone — SHGT's own `ISSUE` movementType is the same string
 * as an LC's `ISSUE`, so checking movementType alone would silently apply
 * Tolerance to a Shipping Guarantee if a caller ever mistakenly populated
 * tolerancePct on a non-applicable contract.
 */
import Decimal from 'decimal.js';
import { minorUnitsForCurrency, parseMonetaryAmount } from '../money';
import type { InstrumentType } from '../types';

const TOLERANCE_APPLICABLE_INSTRUMENT_TYPES: ReadonlySet<InstrumentType> = new Set(['IPLC_LC', 'EPLC_LC', 'EPLC_CONFIRMATION']);

const TOLERANCE_APPLICABLE_MOVEMENT_TYPES: ReadonlySet<string> = new Set([
  'ISSUE',
  'AMEND_INCREASE',
  'AMEND_DECREASE',
  'AMEND', // EPLC_CONFIRMATION's own amendment movementType
]);

/**
 * @param amount face-level MonetaryAmount wire string, as typed by the caller.
 * @param tolerancePct decimal string (e.g. "10"), or null/undefined if this
 *   contract carries no tolerance (ceilingAmount === amount).
 * @param movementType only ISSUE/AMEND_INCREASE/AMEND_DECREASE/AMEND are
 *   converted; any other value returns amount unchanged regardless of
 *   tolerancePct.
 * @param instrumentType only IPLC_LC/EPLC_LC/EPLC_CONFIRMATION are
 *   converted; SHGT/IPLC_ACCEPTANCE/EPLC_ACCEPTANCE always return amount
 *   unchanged, even if movementType happens to be "ISSUE"/"CREATE" and
 *   tolerancePct is non-null.
 */
export function computeCeilingAmount(
  amount: string,
  tolerancePct: string | null | undefined,
  movementType: string,
  instrumentType: InstrumentType,
  currency?: string,
): Decimal {
  const faceAmount = parseMonetaryAmount(amount);

  if (!TOLERANCE_APPLICABLE_INSTRUMENT_TYPES.has(instrumentType)) {
    return faceAmount;
  }
  if (!TOLERANCE_APPLICABLE_MOVEMENT_TYPES.has(movementType)) {
    return faceAmount;
  }
  const toleranceFactor = new Decimal(1).plus(new Decimal(tolerancePct ?? 0).dividedBy(100));
  return faceAmount.times(toleranceFactor).toDecimalPlaces(minorUnitsForCurrency(currency ?? ''), Decimal.ROUND_HALF_UP);
}

export const MONETARY_AMENDMENT_TYPES: ReadonlySet<string> = new Set(['AMEND_INCREASE', 'AMEND_DECREASE', 'AMEND']);

export type ToleranceChangeDirection = 'INCREASE' | 'DECREASE';

/** Exact protected tolerance result derived from the current contract term and this amendment's magnitude. */
export function computeResultingTolerancePct(
  currentTolerancePct: string | null | undefined,
  toleranceChangePct: string,
  direction: ToleranceChangeDirection,
): string {
  const current = new Decimal(currentTolerancePct ?? 0);
  const change = new Decimal(toleranceChangePct);
  if (change.isNegative()) throw new Error(`toleranceChangePct "${toleranceChangePct}" must not be negative.`);
  const result = direction === 'DECREASE' ? current.minus(change) : current.plus(change);
  if (result.isNegative()) {
    throw new Error(`Decrease Tolerance cannot exceed the current Tolerance of ${current.toFixed()}%.`);
  }
  return result.toFixed();
}

/**
 * UCP 600 article 10 / ICC amendment practice: an amendment becomes the new
 * operative basis only when it is accepted/effective.  Accordingly, a monetary
 * amendment is calculated from the currently RELEASED face amount and current
 * tolerance, then produces one balance delta to the amended upper limit. Each
 * old/new limit is rounded with ROUND_HALF_UP to the currency's ISO decimal
 * places before the delta is taken. The
 * tolerance is never applied independently to the typed amendment amount.
 *
 * `movementCeilingAmount` preserves this codebase's A2 storage convention:
 * AMEND_DECREASE has a fixed -1 direction, so its stored amount is the inverse
 * of the signed upper-limit delta.  AMEND_INCREASE and B2 AMEND use +1 and store
 * the signed delta directly.  `balanceDelta` is always the actual exposure
 * change, regardless of that transport convention.
 */
export function computeMonetaryAmendment(params: {
  currentFaceAmount: Decimal;
  currentTolerancePct: string | null | undefined;
  amendmentAmount: string;
  movementType: string;
  newTolerancePct: string | null | undefined;
  instrumentType: InstrumentType;
  currency?: string;
}): {
  newFaceAmount: Decimal;
  oldUpperLimit: Decimal;
  newUpperLimit: Decimal;
  newLowerLimit: Decimal;
  balanceDelta: Decimal;
  movementCeilingAmount: Decimal;
} {
  if (!MONETARY_AMENDMENT_TYPES.has(params.movementType)) {
    throw new Error(`Movement type "${params.movementType}" is not a monetary amendment.`);
  }

  const typedAmount = parseMonetaryAmount(params.amendmentAmount);
  const faceDelta = params.movementType === 'AMEND_DECREASE' ? typedAmount.abs().negated() : typedAmount;
  const newFaceAmount = params.currentFaceAmount.plus(faceDelta);
  if (newFaceAmount.isNegative()) {
    throw new Error(
      `Amendment would make the Current LC Amount negative (${params.currentFaceAmount.toFixed()} + ${faceDelta.toFixed()} = ${newFaceAmount.toFixed()}).`,
    );
  }

  const oldUpperLimit = computeCeilingAmount(
    params.currentFaceAmount.toFixed(),
    params.currentTolerancePct,
    'ISSUE',
    params.instrumentType,
    params.currency,
  );
  const newUpperLimit = computeCeilingAmount(
    newFaceAmount.toFixed(),
    params.newTolerancePct,
    'ISSUE',
    params.instrumentType,
    params.currency,
  );
  const tolerance = new Decimal(params.newTolerancePct ?? 0).dividedBy(100);
  const newLowerLimit = newFaceAmount
    .times(new Decimal(1).minus(tolerance))
    .toDecimalPlaces(minorUnitsForCurrency(params.currency ?? ''), Decimal.ROUND_HALF_UP);
  const balanceDelta = newUpperLimit.minus(oldUpperLimit);
  const movementCeilingAmount = params.movementType === 'AMEND_DECREASE' ? balanceDelta.negated() : balanceDelta;

  return { newFaceAmount, oldUpperLimit, newUpperLimit, newLowerLimit, balanceDelta, movementCeilingAmount };
}
