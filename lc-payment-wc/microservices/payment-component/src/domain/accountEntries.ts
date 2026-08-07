/**
 * §6 of Payment_Component_Calculation_Validation.docx — Step 4 of the Confirm
 * flow: Account Entry generation across three parallel voucher streams
 * (SETTLEMENT / CHARGE / LIABILITY). Generated unconditionally per FSD §5.4
 * step 4 — independent of the §4 classification result.
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
  extra: Partial<AccountEntry> = {},
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

// ---------------------------------------------------------------------------
// §6.2 Charge Voucher stream — SYT_CHG_VOUCHER() (TrxSys.js:1810-1896)
// ---------------------------------------------------------------------------

/**
 * §6.2/§12.2: SYT_CHG_VOUCHER()'s amount formula depends on Chg.Screen.*
 * widget aggregations over an on-screen charge grid — not portable server-side
 * logic. This context must be supplied by the caller (who has already run its
 * own charge calculation before submitting to POST /payment-instructions);
 * charge generation is skipped entirely (returns null) if no context is given,
 * matching the FSD's position that charge computation itself stays outside
 * Payment Component scope (§8.2).
 */
export interface ChargeVoucherContext {
  /** SYS_ORG_FUNCTION_NAME.indexOf("_SettleCharges") > -1 in source. */
  isSettleCharges: boolean;
  /** Chg.Screen.getLocalChgCustPayTotalAmt() — MonetaryAmount string. */
  localChgCustPayTotalAmt: string;
  /** Chg.Screen.getForeignChgCustPayTotalAmt() — MonetaryAmount string. */
  foreignChgCustPayTotalAmt: string;
  /** Chg.Screen.getLocalPayVatTotalAmt() — MonetaryAmount string. Only used when !isSettleCharges. */
  localPayVatTotalAmt: string;
  /** sACNO — resolved charge debit account. Empty/undefined means chargeDebitAmount = 0 (source: sACNO.length > 0 check). */
  chargeAccountNo?: string;
  currency: string;
  custId?: string;
  bookingDate?: string;
}

export interface ChargeVoucherResult {
  entry: AccountEntry;
  /** The full charge amount before the "debit account present" gate — CHG_CUST_AMT in source. */
  chargeAmount: Decimal;
}

/**
 * Formula (§6.2):
 *   chargeAmount = isSettleCharges
 *     ? MAX(localChgCustPayTotalAmt, foreignChgCustPayTotalAmt)
 *     : localChgCustPayTotalAmt + localPayVatTotalAmt
 *   chargeDebitAmount = chargeAccountNo ? chargeAmount : 0
 */
export function buildChargeVoucherEntry(instructionId: string, ctx: ChargeVoucherContext): ChargeVoucherResult {
  const local = parseMonetaryAmount(ctx.localChgCustPayTotalAmt);
  const foreign = parseMonetaryAmount(ctx.foreignChgCustPayTotalAmt);
  const vat = parseMonetaryAmount(ctx.localPayVatTotalAmt);

  const chargeAmount = ctx.isSettleCharges ? Decimal.max(local, foreign) : local.plus(vat);
  const hasDebitAccount = Boolean(ctx.chargeAccountNo && ctx.chargeAccountNo.length > 0);
  const chargeDebitAmount = hasDebitAccount ? chargeAmount : new Decimal(0);

  const entry = makeEntry(
    instructionId,
    'CHARGE',
    'D',
    ctx.chargeAccountNo ?? '',
    chargeDebitAmount,
    ctx.currency,
    'Charge Voucher',
    { custId: ctx.custId, bookingDate: ctx.bookingDate },
  );

  return { entry, chargeAmount };
}

// ---------------------------------------------------------------------------
// §6.3 Liability Voucher stream — SYT_LIAB_VOUCHER() (TrxSys.js:5564-5677+)
// ---------------------------------------------------------------------------

/**
 * Per-module liability contexts, one discriminant per §6.3.1-§6.3.6. Fields
 * are the source screen values (STL_AMT, ACPT_AMT, LIAB_ACNO, ASSET_ACNO,
 * etc.) the caller must supply — these are NOT part of PaymentLegInput and
 * are not carried by the official OAS request body today (same category of
 * gap as voucherDescription.ts's sourceFunctionCode; see §12.4 of the
 * Calculation & Validation doc for the IWGT methodOfIssuance case
 * specifically).
 */
export type LiabilityVoucherContext =
  | {
      module: 'IPLC';
      sourceFunctionCode: 'PayAccept' | 'PayAcceptWithDiscount';
      stlAmt: string;
      acptAmt?: string;
      sdaFlagIsSight?: boolean;
      assetAcno: string;
      liabAcno: string;
      tempAssetAcno?: string;
      tempLiabAcno?: string;
      currency: string;
    }
  | {
      module: 'IPLC';
      sourceFunctionCode: 'PaymentAtMaturity';
      stlAmt: string;
      assetAcno: string;
      liabAcno: string;
      currency: string;
    }
  | {
      module: 'EPLC';
      sourceFunctionCode: 'PayAccept' | 'PayAtMaturity' | 'SettlePartial';
      stlAmt: string;
      assetAcno: string;
      liabAcno: string;
      currency: string;
      /**
       * §11 anomaly A1: TrxSys.js:5908 has `TEMP_AC_VCH_DESC2.valuee = '...'`
       * (typo — assigns a stray property, not .value), so the credit leg's
       * voucher description is never actually set in current production.
       * Defaults to false (correct behavior: description IS set). Pass true
       * only if byte-for-byte legacy parity with the defect is required —
       * this must be an explicit, documented choice per §11, not a default.
       */
      replicateEplcVoucherDescDefect?: boolean;
    }
  | {
      module: 'IMCO';
      sourceFunctionCode: 'SettlementDA';
      billAmtFmDrwe: string;
      assetAcno: string;
      liabAcno: string;
      currency: string;
    }
  | {
      module: 'GTEE';
      sourceFunctionCode: 'OutwardClaimSettlement';
      clmTrxCcyAmt: string;
      assetAcno: string;
      liabAcno: string;
      currency: string;
    }
  | {
      module: 'IWGT';
      sourceFunctionCode: 'SettleInwardClaim';
      clmTrxCcyAmt: string;
      assetAcno: string;
      liabAcno: string;
      currency: string;
      /** MTHD_OF_ISS — liability entries produced only when 'Issue' (§6.3.5). */
      methodOfIssuance: 'Issue' | 'Advice';
    }
  /** EXCO never produces a Liability Voucher entry — §6.3.6, confirmed by absence in source. */
  | { module: 'EXCO' }
  /** No liability context supplied at all — e.g. IMCO Pre-Payment/Payment D/P, which correctly produce none. */
  | { module: 'NONE' };

function drCrPair(
  instructionId: string,
  drAcno: string,
  crAcno: string,
  amount: Decimal,
  currency: string,
  drDesc: string,
  crDesc: string,
): AccountEntry[] {
  return [
    makeEntry(instructionId, 'LIABILITY', 'D', drAcno, amount, currency, drDesc),
    makeEntry(instructionId, 'LIABILITY', 'C', crAcno, amount, currency, crDesc),
  ];
}

/**
 * Produces 0, 2, or 4 AccountEntry rows (0/1/2 Dr/Cr pairs) depending on
 * module and business condition, exactly mirroring §6.3.1-§6.3.6. Returns []
 * for EXCO (§6.3.6: no branch exists in source) and for 'NONE' (functions
 * like IMCO Pre-Payment/Payment D/P that are correctly liability-free).
 */
export function buildLiabilityVoucherEntries(instructionId: string, ctx: LiabilityVoucherContext): AccountEntry[] {
  switch (ctx.module) {
    case 'EXCO':
    case 'NONE':
      return [];

    case 'IPLC': {
      if (ctx.sourceFunctionCode === 'PaymentAtMaturity') {
        // §6.3.1: Dr ASSET_ACNO = STL_AMT / Cr LIAB_ACNO = STL_AMT, desc "IPLC06FIRMNULLNULLI"
        const amt = parseMonetaryAmount(ctx.stlAmt);
        return drCrPair(instructionId, ctx.assetAcno, ctx.liabAcno, amt, ctx.currency, 'IPLC06FIRMNULLNULLI', 'IPLC06FIRMNULLNULLI');
      }

      // PayAccept / PayAcceptWithDiscount
      const stlAmt = parseMonetaryAmount(ctx.stlAmt);
      if (stlAmt.greaterThan(0)) {
        // desc "IPLC03CONTNULLNULLI"
        return drCrPair(instructionId, ctx.assetAcno, ctx.liabAcno, stlAmt, ctx.currency, 'IPLC03CONTNULLNULLI', 'IPLC03CONTNULLNULLI');
      }
      const acptAmt = ctx.acptAmt ? parseMonetaryAmount(ctx.acptAmt) : new Decimal(0);
      if (acptAmt.greaterThan(0) && ctx.sdaFlagIsSight) {
        if (!ctx.tempAssetAcno || !ctx.tempLiabAcno) {
          throw new Error('IPLC PayAccept liability entry requires tempAssetAcno/tempLiabAcno when ACPT_AMT branch applies');
        }
        // Source quirk, replicated exactly (TrxSys.js:5644-5647): the first pair
        // uses STL_AMT (not ACPT_AMT) despite being inside the ACPT_AMT>0 branch.
        const pair1 = drCrPair(instructionId, ctx.tempAssetAcno, ctx.tempLiabAcno, stlAmt, ctx.currency, 'IPLC04CONTNULLNULLI', 'IPLC04CONTNULLNULLI');
        const pair2 = drCrPair(instructionId, ctx.liabAcno, ctx.assetAcno, acptAmt, ctx.currency, 'IPLC04FIRMNULLNULLI', 'IPLC04FIRMNULLNULLI');
        return [...pair1, ...pair2];
      }
      return [];
    }

    case 'EPLC': {
      // §6.3.2 — Pay/Accept, Pay at Maturity, SettlePartial. Discount is NOT
      // in this set (FSD arr_Func_Manag3 excludes it) — callers must not
      // reach this branch for EPLC Discount.
      const amt = parseMonetaryAmount(ctx.stlAmt);
      const crDesc = ctx.replicateEplcVoucherDescDefect ? '' : 'EPLC03CONTNULLNULLI';
      return drCrPair(instructionId, ctx.assetAcno, ctx.liabAcno, amt, ctx.currency, 'EPLC03CONTNULLNULLI', crDesc);
    }

    case 'IMCO': {
      // §6.3.3 — SettlementDA only. Pre-Payment/Payment D/P correctly never reach this ('NONE').
      const amt = parseMonetaryAmount(ctx.billAmtFmDrwe);
      return drCrPair(instructionId, ctx.assetAcno, ctx.liabAcno, amt, ctx.currency, 'IMCO03CONTNULLNULLI', 'IMCO03CONTNULLNULLI');
    }

    case 'GTEE': {
      // §6.3.4
      const amt = parseMonetaryAmount(ctx.clmTrxCcyAmt);
      return drCrPair(instructionId, ctx.assetAcno, ctx.liabAcno, amt, ctx.currency, 'GTEE04CONTNULLNULLI', 'GTEE04CONTNULLNULLI');
    }

    case 'IWGT': {
      // §6.3.5 — conditional on MTHD_OF_ISS == 'Issue'.
      if (ctx.methodOfIssuance !== 'Issue') {
        return [];
      }
      const amt = parseMonetaryAmount(ctx.clmTrxCcyAmt);
      return drCrPair(instructionId, ctx.assetAcno, ctx.liabAcno, amt, ctx.currency, 'IWGT04CONTNULLNULLC', 'IWGT04CONTNULLNULLI');
    }
  }
}
