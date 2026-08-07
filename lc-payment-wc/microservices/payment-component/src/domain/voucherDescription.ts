/**
 * §5 of Payment_Component_Calculation_Validation.docx — Step 3 of the Confirm
 * flow: voucher description code assembly.
 *
 * Source: SYF_EXCO_CAL_PAYMENT_AC_DESC() — X/CALJS/FUNCLEVEL/SYF_EXCO_EXCO_Payment.js:302-334
 *   ntype = DR_TYPE.substring(0, 1)
 *   dr_desc = "EXCO01NULLNULLNULL" + ntype
 * i.e. per leg, independently:
 *   leg.accountDesc = "{MODULE}{FuncCode}NULLNULLNULL" + leg.accountType.charAt(0)
 *
 * KNOWN GAP, FLAGGED NOT GUESSED: the "{MODULE}{FuncCode}" prefix is a
 * per-*function* value (e.g. "IPLC03" for IPLC Pay/Accept, "IPLC06" for IPLC
 * Payment at Maturity — two different prefixes for the same originModule),
 * catalogued in Payment_Mapping_Functions.docx §6 / FSD §3.3. But
 * PaymentInstructionConfirmRequest (OAS v1.2.0) carries only originModule, not
 * a function/screen identifier — so the prefix cannot be resolved from the
 * official request body alone today. This module resolves it from an explicit
 * `sourceFunctionCode` parameter that the HTTP layer does NOT currently accept
 * as a formal OAS field; callers of confirmPaymentInstruction() must supply it
 * out-of-band (e.g. a caller-side constant per integration) until the OAS is
 * extended with a proper field. This is the same gap already recorded in
 * Payment_Mapping_Functions.docx §10 (open items) — not a new one invented
 * here.
 */
import type { AccountCategory, AccountType, OriginModule, PaymentLeg, PaymentLegInput, LegSide } from '../types';
import { RequestValidationError } from '../errors';

/**
 * Voucher code prefix table, copied verbatim from
 * PaymentComponent-Microservice-FSD-zh.docx §3.3 / Payment_Mapping_Functions.docx §6.
 * Two FSD rows (EPLC Pay/Accept: "EPLC07 / EPLC03...", EXCO Settlement at
 * Maturity: "EXCO06 / EXCO01...") record TWO possible prefixes without stating
 * the selecting condition, and are deliberately omitted here — callers for
 * those two functions must pass an explicit prefix override rather than rely
 * on a guessed default.
 */
export const VOUCHER_CODE_PREFIXES: Readonly<Record<string, string>> = {
  'IPLC:PayAccept': 'IPLC03NULLNULLNULL',
  'IPLC:PayAcceptWithDiscount': 'IPLC03NULLNULLNULL',
  'IPLC:PaymentAtMaturity': 'IPLC06NULLNULLNULL',
  'EPLC:PayAtMaturity': 'EPLC06NULLNULLNULL',
  'EPLC:Discount': 'EPLC07NULLNULLNULL',
  'EXCO:Payment': 'EXCO01NULLNULLNULL',
  'EXCO:Discount': 'EXCO04NULLNULLNULL',
  'EXCO:Process400': 'EXCO01NULLNULLNULL',
  'IMCO:PrePayment': 'IMCO03NULLNULLNULL',
  'IMCO:PaymentDP': 'IMCO03NULLNULLNULL',
  'IMCO:SettlementDA': 'IMCO03NULLNULLNULL',
  'GTEE:OutwardClaimSettlement': 'GTEE04NULLNULLNULL',
  'IWGT:SettleInwardClaim': 'IWGT04NULLNULLNULL',
};

export function resolveVoucherCodePrefix(originModule: OriginModule, sourceFunctionCode: string): string {
  const key = `${originModule}:${sourceFunctionCode}`;
  const prefix = VOUCHER_CODE_PREFIXES[key];
  if (!prefix) {
    throw new RequestValidationError(
      `No voucher code prefix registered for ${key}. Either this function is not one of the ` +
        '15 confirmed Payment Component consumers (see Payment_Mapping_Functions.docx §6/§8), ' +
        'or it is one of the two FSD rows with an unresolved dual prefix (EPLC PayAccept, ' +
        'EXCO SettlementAtMaturity) — supply an explicit prefix override for those.',
    );
  }
  return prefix;
}

/** §5.1 TypeChar table — accountType.charAt(0), tabulated for documentation/tests. */
export const TYPE_CHARS: Readonly<Record<AccountType, string>> = {
  CUSTOMER: 'C',
  NOSTRO: 'N',
  VOSTRO: 'V',
  SUSPENSE: 'S',
  INTERNAL: 'I',
};

/**
 * §5.1 TypeChar mapping. RTGS legs (accountType='NOSTRO' + rtgsIndicator —
 * see types.ts v1.3.0 note) still get their own char 'R', matching source's
 * distinct RTGS voucher-description treatment (confirmed: RTGS selects a
 * different GL account than NOSTRO in the same currency-driven branch,
 * SSSS_PaymentCredit.js:1391-1400 and callers) — collapsing accountType to
 * NOSTRO for classification purposes doesn't mean collapsing it for voucher
 * description too, so the flag is threaded through here independently.
 */
export function accountDescFor(accountType: AccountType, voucherCodePrefix: string, rtgsIndicator?: boolean): string {
  const typeChar = accountType === 'NOSTRO' && rtgsIndicator ? 'R' : TYPE_CHARS[accountType];
  return voucherCodePrefix + typeChar;
}

/**
 * AccountCategory grouping (OAS readOnly field on PaymentLeg) — UI-behavior
 * bucket only, per FSD: never used in classification (§4), never gates
 * Account Entry generation (§6). An RTGS-flagged NOSTRO leg categorizes the
 * same as any other NOSTRO leg (NOSTRO_FAMILY) — that's the point of v1.3.0's
 * "RTGS = NOSTRO + flag" modeling (see types.ts), so no special-casing is
 * needed here (this used to require a judgment call before that change).
 */
export function accountCategoryFor(accountType: AccountType): AccountCategory {
  switch (accountType) {
    case 'CUSTOMER':
      return 'CUSTOMER';
    case 'NOSTRO':
    case 'VOSTRO':
      return 'NOSTRO_FAMILY';
    case 'SUSPENSE':
    case 'INTERNAL':
      return 'INTERNAL_SUSPENSE';
  }
}

let legIdCounter = 0;
function nextLegId(): string {
  legIdCounter += 1;
  return `leg-${Date.now()}-${legIdCounter}`;
}

/**
 * Applies §5's per-leg formula to every submitted leg, producing the
 * server-derived PaymentLeg fields (legId, legSide, accountDesc,
 * accountCategory) required by the OAS response.
 */
export function enrichLegs(
  legs: readonly PaymentLegInput[],
  legSide: LegSide,
  voucherCodePrefix: string,
): PaymentLeg[] {
  return legs.map((leg) => ({
    ...leg,
    legId: nextLegId(),
    legSide,
    accountDesc: accountDescFor(leg.accountType, voucherCodePrefix, leg.rtgsIndicator),
    accountCategory: accountCategoryFor(leg.accountType),
  }));
}
