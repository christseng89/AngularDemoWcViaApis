/**
 * TypeScript types mirroring microservices/payment-component/src/types.ts
 * (payment-instructions-post.yaml v1.3.0). Duplicated here rather than
 * imported cross-project — lc-payment-wc/backend doesn't import the
 * microservice either; these two Node projects stay independently deployable.
 */

export const ORIGIN_MODULES = [
  'IPLC', 'EPLC', 'IMCO', 'EXCO', 'PYMT', 'GTEE', 'RPFM', 'CFNC', 'SBLC', 'REIM', 'IWGT',
] as const;
export type OriginModule = (typeof ORIGIN_MODULES)[number];

/**
 * v1.3.0: RTGS is no longer a distinct value here — source-verified nothing
 * branches on it differently from NOSTRO for classification or SWIFT message
 * routing, so it's modeled as accountType='NOSTRO' + PaymentLegInput.
 * rtgsIndicator instead (scoped to originModule "RPFM" only).
 */
export const ACCOUNT_TYPES = ['CUSTOMER', 'NOSTRO', 'VOSTRO', 'SUSPENSE', 'INTERNAL'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_CATEGORIES = ['CUSTOMER', 'NOSTRO_FAMILY', 'INTERNAL_SUSPENSE'] as const;
export type AccountCategory = (typeof ACCOUNT_CATEGORIES)[number];

/** Decimal-string wire type — pattern ^-?\d{1,18}(\.\d{1,3})?$ */
export type MonetaryAmount = string;
/** Decimal-string wire type — pattern ^\d{1,12}(\.\d{1,10})?$ */
export type ExchangeRate = string;

export const PAY_INSTR_FLAGS = ['F', 'A'] as const;
export type PayInstrFlag = (typeof PAY_INSTR_FLAGS)[number];

export const PAY_ADVICE_MSG_TYPES = ['MT103', 'PACS008', 'None'] as const;
export type PayAdviceMsgType = (typeof PAY_ADVICE_MSG_TYPES)[number];

export const PAY_COVER_MSG_TYPES = ['MT202', 'MT202COV', 'PACS009COV', 'None'] as const;
export type PayCoverMsgType = (typeof PAY_COVER_MSG_TYPES)[number];

export const LEG_SIDES = ['DEBIT', 'CREDIT'] as const;
export type LegSide = (typeof LEG_SIDES)[number];

export const VOUCHER_TYPES = ['SETTLEMENT', 'CHARGE', 'LIABILITY'] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];

export const DR_CR_INDICATORS = ['D', 'C'] as const;
export type DrCrIndicator = (typeof DR_CR_INDICATORS)[number];

export const SWIFT_MESSAGE_TYPES = ['MT103', 'MT202', 'MT202COV', 'PACS008', 'PACS009', 'PACS009COV'] as const;
export type SwiftMessageType = (typeof SWIFT_MESSAGE_TYPES)[number];

export const SWIFT_MESSAGE_STATUSES = ['PENDING', 'GENERATED', 'TRANSMITTED', 'FAILED'] as const;
export type SwiftMessageStatus = (typeof SWIFT_MESSAGE_STATUSES)[number];

export interface PaymentLegInput {
  accountNo: string;
  accountType: AccountType;
  /** Only meaningful when accountType === 'NOSTRO'; RPFM-only (v1.3.0). */
  rtgsIndicator?: boolean;
  partyId?: string;
  partyName?: string;
  currency: string;
  amountAccountCcy?: MonetaryAmount;
  amountTxCcy: MonetaryAmount;
  drRate?: ExchangeRate;
  drBuyRate?: ExchangeRate;
  crBuyRate?: ExchangeRate;
  sellRate?: ExchangeRate;
  valueDate?: string;
  sdaFlag?: string;
  payAdviceMsgType?: PayAdviceMsgType;
  payCoverMsgType?: PayCoverMsgType;
}

export interface PaymentLeg extends PaymentLegInput {
  legId: string;
  legSide: LegSide;
  accountDesc: string;
  accountCategory: AccountCategory;
}

/** Charge/Liability voucher context extensions — see business-case.model.ts for per-function shapes. */
export interface ChargeVoucherContext {
  isSettleCharges: boolean;
  localChgCustPayTotalAmt: string;
  foreignChgCustPayTotalAmt: string;
  localPayVatTotalAmt: string;
  chargeAccountNo?: string;
  currency: string;
  custId?: string;
  bookingDate?: string;
}

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
      methodOfIssuance: 'Issue' | 'Advice';
    }
  | { module: 'EXCO' }
  | { module: 'NONE' };

export interface PaymentInstructionConfirmRequest {
  originModule: OriginModule;
  mainRef: string;
  sequence: number;
  unitCode: string;
  tenorType?: string;
  tenorStartDate?: string;
  maturityDate?: string;
  payInstrFlag?: PayInstrFlag;
  debitLegs: PaymentLegInput[];
  creditLegs: PaymentLegInput[];
  // Extension fields (see microservices/payment-component/src/routes/paymentInstructions.ts RequestExtensions)
  sourceFunctionCode?: string;
  voucherCodePrefixOverride?: string;
  chargeContext?: ChargeVoucherContext;
  liabilityContext?: LiabilityVoucherContext;
  dryRun?: boolean;
}

export interface ClassificationResult {
  instructionId: string;
  debitTypes: AccountType[];
  creditTypes: AccountType[];
  customerXor: boolean;
  nostroXor: boolean;
  vostroXor: boolean;
  paymentComponentRelated: boolean;
}

export interface AccountEntry {
  entryId: string;
  instructionId: string;
  voucherType: VoucherType;
  custId?: string;
  description?: string;
  drCrIndicator: DrCrIndicator;
  glAccount: string;
  subLedger?: string;
  currency: string;
  amount: MonetaryAmount;
  bookingDate?: string;
  valueDate?: string;
  transactionCode?: string;
  exchangeRate1?: ExchangeRate;
  exchangeRate2?: ExchangeRate;
  referenceNumber?: string;
}

export interface SwiftMessage {
  messageId: string;
  instructionId: string;
  legId: string;
  messageType: SwiftMessageType;
  status: SwiftMessageStatus;
  correspondentBic?: string;
  settlementCurrency?: string;
  settlementAmount?: MonetaryAmount;
  instructedAmount?: MonetaryAmount;
  valueDate?: string;
  uetr?: string;
  serviceTypeId?: string;
  isGpiMember?: boolean;
}

export interface PaymentInstruction {
  instructionId: string;
  sequence: number;
  originModule: OriginModule;
  mainRef: string;
  tenorType?: string;
  tenorDays?: number;
  maturityDate?: string;
  payInstrFlag?: PayInstrFlag;
  unpaidAmountTxCcy?: MonetaryAmount;
  unpaidFlag?: boolean;
  debitLegs: PaymentLeg[];
  creditLegs: PaymentLeg[];
  classification: ClassificationResult;
  accountEntries: AccountEntry[];
  swiftMessages: SwiftMessage[];
}

export interface ApiErrorBody {
  code: string;
  message: string;
}

/**
 * POST /payment-instructions/classify response — RPFM GAP-case preview only.
 * accountEntries carries only the §6.1 Settlement stream (one entry per
 * submitted leg, derived straight from the leg's own accountNo/amount/
 * currency) — the one Account Entry stream that doesn't need the missing
 * RPFM voucher-code prefix. No Charge/Liability entries (need caller-supplied
 * context this preview doesn't collect) and no swiftMessages (need enriched
 * legs from the Step 3 this preview deliberately skips) — see the
 * microservice's classifyPreview.ts doc comment.
 */
export interface ClassifyPreviewResult {
  classification: ClassificationResult;
  balance: {
    debitTotal: string;
    creditTotal: string;
    difference: string;
    balanced: boolean;
  };
  accountEntries: AccountEntry[];
}
