/**
 * Design doc §6.2 — Tolerance conversion for movements that establish or
 * amend a Maximum-Exposure-Basis liability. The caller types a face-level
 * amount (e.g. "increase by 10000"); this module derives the Ceiling-level
 * figure actually applied against Confirmed Balance.
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
import { parseMonetaryAmount } from '../money';
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
export function computeCeilingAmount(amount: string, tolerancePct: string | null | undefined, movementType: string, instrumentType: InstrumentType): Decimal {
  const faceAmount = parseMonetaryAmount(amount);

  if (!TOLERANCE_APPLICABLE_INSTRUMENT_TYPES.has(instrumentType)) {
    return faceAmount;
  }
  if (!TOLERANCE_APPLICABLE_MOVEMENT_TYPES.has(movementType)) {
    return faceAmount;
  }
  if (tolerancePct === null || tolerancePct === undefined) {
    return faceAmount;
  }

  const toleranceFactor = new Decimal(1).plus(new Decimal(tolerancePct).dividedBy(100));
  return faceAmount.times(toleranceFactor);
}
