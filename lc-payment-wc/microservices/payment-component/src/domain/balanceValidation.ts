/**
 * §3 of Payment_Component_Calculation_Validation.docx — Step 1 of the
 * Confirm flow: Dr/Cr balance validation.
 *
 * Source behavior being ported:
 *   Debit_Chk_Total_Pct()  — SSSS_PaymentDebit.js:347-390
 *   CHK_Total_Pct()        — SSSS_PaymentCredit.js:164-210
 * Both independently check "Σ leg amounts ≤ a shared target total" per side
 * (CPYT_DR_TTL_AMT_TTLCCY / CPYT_CR_TTL_AMT_TTLCCY), with small tolerances for
 * RPFM (±0.01) and, credit-side only, CFNC (±0.02).
 *
 * IMPORTANT DEVIATION FROM SOURCE, DELIBERATE: PaymentInstructionConfirmRequest
 * (OAS v1.2.0) has no CPYT_DR_TTL_AMT_TTLCCY/CPYT_CR_TTL_AMT_TTLCCY-equivalent
 * field at all — the single-POST design carries only the two leg arrays, no
 * separate "target total". §12.1 and §8.3 of the Calculation & Validation doc
 * flag this explicitly and recommend implementing V8 instead: exact equality
 * between the two sides' totals (in the shared transaction currency), since
 * that is the only check the OAS's actual shape can express. §13.2 of the same
 * doc verified V8 against a real FSD scenario (§2.3.3: debit 800,020 == credit
 * 800,000 + 20) and found it consistent. This module therefore implements V8
 * as the primary rule, with an optional tolerance to accommodate the RPFM-style
 * rounding slack seen in source, rather than reproducing the two independent
 * ≤-target-total checks verbatim (there is no target-total field to check
 * against).
 */
import Decimal from 'decimal.js';
import type { PaymentLegInput } from '../types';
import { sumMonetaryAmounts } from '../money';
import { BusinessValidationError } from '../errors';

export interface BalanceValidationResult {
  debitTotal: Decimal;
  creditTotal: Decimal;
  difference: Decimal;
}

/**
 * V8 (Payment_Component_Calculation_Validation.docx §8.3/§9/§12.1):
 *   Σ debitLegs[].amountTxCcy == Σ creditLegs[].amountTxCcy  (within tolerance)
 *
 * @param toleranceAbs Absolute tolerance, matching the RPFM ±0.01 slack seen in
 *   Debit_Chk_Total_Pct()/CHK_Total_Pct(). Defaults to 0 (exact equality) —
 *   pass a non-zero value only for originModule cases known to need it.
 */
export function validateDrCrBalance(
  debitLegs: readonly PaymentLegInput[],
  creditLegs: readonly PaymentLegInput[],
  toleranceAbs: Decimal.Value = 0,
): BalanceValidationResult {
  const debitTotal = sumMonetaryAmounts(debitLegs.map((leg) => leg.amountTxCcy));
  const creditTotal = sumMonetaryAmounts(creditLegs.map((leg) => leg.amountTxCcy));
  const difference = debitTotal.minus(creditTotal);

  if (difference.abs().greaterThan(toleranceAbs)) {
    throw new BusinessValidationError(
      'LEGS_UNBALANCED',
      `Debit legs total (${debitTotal.toFixed()}) does not match credit legs total ` +
        `(${creditTotal.toFixed()}); difference ${difference.toFixed()} exceeds tolerance ` +
        `${new Decimal(toleranceAbs).toFixed()}.`,
    );
  }

  return { debitTotal, creditTotal, difference };
}

/** RPFM tolerance constant, per Debit_Chk_Total_Pct()/CHK_Total_Pct() (SSSS_Payment*.js). */
export const RPFM_BALANCE_TOLERANCE = new Decimal('0.01');
