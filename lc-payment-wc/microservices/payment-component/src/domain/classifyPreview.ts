/**
 * Classify-only preview — powers the Business Case Simulator's RPFM (GAP
 * verdict) cases in lc-payment-wc. RPFM's 4 Confirm functions populate typed
 * Dr/Cr PaymentDebit/PaymentCredit legs (including the RPFM-only RTGS
 * settlement type — modeled here as accountType='NOSTRO' + rtgsIndicator,
 * see types.ts) at screen-lifecycle time, but source-verified: none of them
 * call a Payment Component voucher-assembly routine at Confirm (no
 * `RPFM##NULLNULLNULL` pattern exists anywhere in the codebase — see
 * voucherDescription.ts). Running RPFM through the full confirmPaymentInstruction
 * flow would therefore have to fabricate a voucher prefix that doesn't exist in
 * source. This module runs only what IS traceable — §3 balance totals, §4
 * classification, and the §6.1 Settlement stream (the one Account Entry stream
 * that doesn't actually depend on the missing voucher prefix — see
 * accountEntries.ts's doc comment on buildSettlementEntries) — and nothing past
 * that: no Charge/Liability streams (need caller-supplied context this preview
 * doesn't collect) and no SWIFT messages (§7 needs enriched legs from Step 3,
 * which this preview deliberately skips).
 *
 * Unlike validateDrCrBalance (used by the real Confirm flow), this never
 * throws on imbalance: it's driven by live onChange input from a Formly form,
 * where "not balanced yet" is a normal, expected in-progress state to display,
 * not an error.
 */
import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';
import type { AccountEntry, ClassificationResult, PaymentLegInput } from '../types';
import { sumMonetaryAmounts } from '../money';
import { classify } from './classification';
import { buildSettlementEntries } from './accountEntries';

export interface BalancePreview {
  debitTotal: string;
  creditTotal: string;
  difference: string;
  balanced: boolean;
}

export interface ClassifyPreviewResult {
  classification: ClassificationResult;
  balance: BalancePreview;
  accountEntries: AccountEntry[];
}

export function previewClassification(
  debitLegs: readonly PaymentLegInput[],
  creditLegs: readonly PaymentLegInput[],
  toleranceAbs: Decimal.Value = 0,
): ClassifyPreviewResult {
  const debitTotal = sumMonetaryAmounts(debitLegs.map((leg) => leg.amountTxCcy));
  const creditTotal = sumMonetaryAmounts(creditLegs.map((leg) => leg.amountTxCcy));
  const difference = debitTotal.minus(creditTotal);

  // Not persisted — clearly namespaced so it's never mistaken for a real instructionId.
  const previewId = `preview-${randomUUID()}`;
  const classification = classify(previewId, debitLegs, creditLegs);
  const accountEntries = [
    ...buildSettlementEntries(previewId, debitLegs, 'DEBIT'),
    ...buildSettlementEntries(previewId, creditLegs, 'CREDIT'),
  ];

  return {
    classification,
    balance: {
      debitTotal: debitTotal.toFixed(),
      creditTotal: creditTotal.toFixed(),
      difference: difference.toFixed(),
      balanced: difference.abs().lessThanOrEqualTo(toleranceAbs),
    },
    accountEntries,
  };
}
