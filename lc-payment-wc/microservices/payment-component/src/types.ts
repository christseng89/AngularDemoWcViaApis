/**
 * TypeScript types mirroring every schema in payment-instructions-post.yaml v1.3.0
 * (Payment Component Service API — POST /payment-instructions).
 *
 * MonetaryAmount and ExchangeRate are OAS `type: string` with a decimal-string
 * pattern (never a binary float) — see src/money.ts for the Decimal-backed
 * parse/format helpers that enforce those patterns. They are aliased here as
 * `string` so the wire type matches the OAS exactly; convert via money.ts
 * before doing arithmetic.
 */

/** OAS: components.schemas.OriginModule */
export const ORIGIN_MODULES = [
  'IPLC', 'EPLC', 'IMCO', 'EXCO', 'PYMT', 'GTEE', 'RPFM', 'CFNC', 'SBLC', 'REIM', 'IWGT',
] as const;
export type OriginModule = (typeof ORIGIN_MODULES)[number];

/**
 * OAS: components.schemas.AccountType.
 *
 * v1.3.0 (design decision, 2026-08-07): RTGS is no longer a distinct
 * top-level value. v1.1.0/v1.2.0 modeled it as a peer of NOSTRO because
 * that's literally what source writes into CPYT_DR_AC_TYPE/CPYT_CR_AC_TYPE
 * (RPFM only). But RTGS never behaved like a separate settlement category —
 * source-verified: no legacy code branches on RTGS differently from NOSTRO
 * for Dr/Cr classification purposes (there is no XOR/classification logic in
 * legacy source at all; the §2.3 rule is a business recap, not a trace), and
 * no legacy code routes an RTGS leg to a different outbound message type
 * than a NOSTRO leg would get (message type is chosen purely by
 * payAdviceMsgType/payCoverMsgType — see swiftMessages.ts — never by
 * accountType). RTGS is now represented as `accountType: 'NOSTRO'` plus the
 * `rtgsIndicator` flag on PaymentLegInput, so it participates in the same
 * nostroXor classification term as any other Nostro leg by construction,
 * while remaining distinguishable (drives its own voucher-description
 * TypeChar 'R' — see voucherDescription.ts). This is this service's own
 * modeling decision, not a literal 1:1 mapping of the source field's string
 * value — a real integration re-deriving this from CPYT_*_AC_TYPE='RTGS'
 * should map it to accountType='NOSTRO', rtgsIndicator=true.
 */
export const ACCOUNT_TYPES = ['CUSTOMER', 'NOSTRO', 'VOSTRO', 'SUSPENSE', 'INTERNAL'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** OAS: components.schemas.AccountCategory (server-derived, readOnly) */
export const ACCOUNT_CATEGORIES = ['CUSTOMER', 'NOSTRO_FAMILY', 'INTERNAL_SUSPENSE'] as const;
export type AccountCategory = (typeof ACCOUNT_CATEGORIES)[number];

/** OAS: components.schemas.MonetaryAmount — pattern ^-?\d{1,18}(\.\d{1,3})?$ */
export type MonetaryAmount = string;

/** OAS: components.schemas.ExchangeRate — pattern ^\d{1,12}(\.\d{1,10})?$ */
export type ExchangeRate = string;

export const PAY_INSTR_FLAGS = ['F', 'A'] as const;
export type PayInstrFlag = (typeof PAY_INSTR_FLAGS)[number];

/** CPYT_PAY_ADV_MSG — credit legs only. Payment Component in-scope subset (FSD §4.2.3). */
export const PAY_ADVICE_MSG_TYPES = ['MT103', 'PACS008', 'None'] as const;
export type PayAdviceMsgType = (typeof PAY_ADVICE_MSG_TYPES)[number];

/** CPYT_PAY_COV_MSG — credit legs only. */
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

/** OAS: components.schemas.PaymentLegInput */
export interface PaymentLegInput {
  accountNo: string;
  accountType: AccountType;
  /**
   * Only meaningful when accountType === 'NOSTRO'; scoped to originModule
   * "RPFM" (v1.3.0 — see AccountType doc comment). Marks a Nostro-family
   * settlement leg as clearing via the domestic RTGS rail instead of SWIFT
   * correspondent messaging. Omit/false for a plain NOSTRO leg.
   */
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

/** OAS: components.schemas.PaymentLeg (PaymentLegInput + server-derived fields) */
export interface PaymentLeg extends PaymentLegInput {
  legId: string;
  legSide: LegSide;
  accountDesc: string;
  accountCategory: AccountCategory;
}

/** OAS: components.schemas.PaymentInstructionConfirmRequest */
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
}

/** OAS: components.schemas.ClassificationResult */
export interface ClassificationResult {
  instructionId: string;
  debitTypes: AccountType[];
  creditTypes: AccountType[];
  customerXor: boolean;
  nostroXor: boolean;
  vostroXor: boolean;
  paymentComponentRelated: boolean;
}

/** OAS: components.schemas.AccountEntry */
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

/** OAS: components.schemas.SwiftMessage */
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

/** OAS: components.schemas.PaymentInstruction (response body) */
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

/** OAS: components.schemas.Error */
export interface ApiErrorBody {
  code: string;
  message: string;
}
