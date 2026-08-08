/**
 * §6.1 of Payment_Component_Calculation_Validation.docx — Step 4 of the Confirm
 * flow: Settlement Voucher Account Entry generation, one entry per submitted
 * leg. Generated unconditionally per FSD §5.4 step 4 — independent of the §4
 * classification result.
 *
 * v1.6.0 (NOT legacy-traced — see confirmPaymentInstruction.ts's doc comment):
 * the §6.2 Charge Voucher and §6.3 Liability Voucher streams (chargeContext/
 * liabilityContext, buildChargeVoucherEntry()/buildLiabilityVoucherEntries())
 * were removed from this service entirely. A Balance Component or Charge
 * Component that bridges through Suspense now books its own Liability/Charge
 * leg on its own books; this service only ever produces SETTLEMENT entries,
 * regardless of a Suspense entry's sourceComponent tag (which remains pure
 * provenance/audit metadata — see types.ts's SuspenseEntry). Any caller that
 * still genuinely needs a §6.2/§6.3 posting independent of a Suspense bridge
 * must be handled outside this service.
 */
import Decimal from 'decimal.js';
import type { AccountEntry, DrCrIndicator, PaymentLegInput } from '../types';
import { formatMonetaryAmount, parseMonetaryAmount } from '../money';

const NO_VOUCHER_PREFIX_DESC = '(no Payment Component voucher code prefix exists in source for this module/function — description omitted, not fabricated)';

let entryIdCounter = 0;
function nextEntryId(): string {
  entryIdCounter += 1;
  return `entry-${Date.now()}-${entryIdCounter}`;
}

function makeEntry(
  instructionId: string,
  voucherType: AccountEntry['voucherType'],
  drCrIndicator: DrCrIndicator,
  glAccount: string,
  amount: Decimal,
  currency: string,
  description: string,
  extra: Partial<AccountEntry>,
): AccountEntry {
  return {
    entryId: nextEntryId(),
    instructionId,
    voucherType,
    drCrIndicator,
    glAccount,
    currency,
    amount: formatMonetaryAmount(amount),
    description,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// §6.1 Settlement stream — no separate calculation; one entry per leg.
// ---------------------------------------------------------------------------

/**
 * Each submitted leg posts as one AccountEntry (voucherType: SETTLEMENT),
 * using that leg's own accountNo, amount, and currency (§6.1). Uses
 * amountAccountCcy when present (the actual amount moved in the account's own
 * currency), falling back to amountTxCcy otherwise.
 *
 * Accepts a raw PaymentLegInput (accountDesc not required) as well as a fully
 * enriched PaymentLeg, so it can be reused for RPFM's classify-only preview
 * (classifyPreview.ts) — those legs never go through Step 3 (voucher
 * description assembly, domain/voucherDescription.ts), which needs a
 * {MODULE}{FuncCode} prefix that doesn't exist in source for RPFM (see that
 * module's doc comment). The raw settlement postings (glAccount/amount/
 * currency/Dr-Cr) don't depend on that prefix at all — only the description
 * string does — so when accountDesc is absent this substitutes a placeholder
 * that says so explicitly, rather than fabricating a voucher code.
 */
export function buildSettlementEntries(
  instructionId: string,
  legs: readonly (PaymentLegInput & { accountDesc?: string })[],
  side: 'DEBIT' | 'CREDIT',
): AccountEntry[] {
  const drCr: DrCrIndicator = side === 'DEBIT' ? 'D' : 'C';
  return legs.map((leg) => {
    const amountStr = leg.amountAccountCcy ?? leg.amountTxCcy;
    return makeEntry(
      instructionId,
      'SETTLEMENT',
      drCr,
      leg.accountNo,
      parseMonetaryAmount(amountStr),
      leg.currency,
      leg.accountDesc ?? NO_VOUCHER_PREFIX_DESC,
      { custId: leg.partyId, referenceNumber: leg.accountNo },
    );
  });
}
