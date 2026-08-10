/**
 * TypeScript types mirroring microservices/payment-component/src/types.ts
 * (payment-instructions-post.yaml v1.6.0). Duplicated here rather than
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

/** Wire shape for SuspenseBridgeEntry.sourceComponent — added v1.5.0. Pure provenance/audit metadata, see SuspenseBridgeEntry's own doc comment. */
export const SUSPENSE_SOURCE_COMPONENTS = ['BALANCE', 'CHARGE'] as const;
export type SourceComponent = (typeof SUSPENSE_SOURCE_COMPONENTS)[number];

/** Wire shape for SuspenseBridgeEntry.balanceModule — added v1.5.0. Only meaningful when sourceComponent is 'BALANCE'. */
export const BALANCE_MODULES = ['IBL', 'EBL'] as const;
export type BalanceModule = (typeof BALANCE_MODULES)[number];

/**
 * Wire shape for one raw suspense-bridge amount (v1.4.0) — see
 * SuspenseBridge below. Distinct from suspense-entries.component.ts's own
 * `SuspenseEntry` (amount + currency only, no crossRate): that one is the
 * UI-editable row shape; this one is what actually goes on the wire, with
 * the crossRate business-case-runner.component.ts resolves before sending.
 */
export interface SuspenseBridgeEntry {
  amount: MonetaryAmount;
  currency: string;
  /** Required when currency differs from the request's transaction currency (debitLegs[0].currency); ignored otherwise. */
  crossRate?: ExchangeRate;
  /**
   * Added v1.5.0. Which upstream component already booked the OTHER leg of
   * this entry on its own books — pure provenance/audit metadata. The
   * server never generates a Charge/Liability Voucher entry at all (§6.2/
   * §6.3 generation was removed entirely v1.6.0 — see
   * microservices/payment-component/src/domain/confirmPaymentInstruction.ts's
   * doc comment for the full architecture decision), so this field has no
   * server-side validation or processing consequence; it exists purely for
   * the caller's own audit trail.
   */
  sourceComponent?: SourceComponent;
  /** Added v1.5.0. Only meaningful when sourceComponent is 'BALANCE'. */
  balanceModule?: BalanceModule;
}

/**
 * Balance/Charge Component <-> Payment Component accounting bridge — added
 * v1.4.0 (Charge Component), extended v1.5.0 (Balance Component). See
 * microservices/payment-component/src/domain/suspenseBridge.ts and
 * payment-instructions-post.yaml's SuspenseBridge schema for the full
 * contract, including what the server does and does NOT adjust on the
 * caller's behalf (this project's own debitLegs/creditLegs above still need
 * the matching pre-adjustment — see business-case-runner.component.ts's
 * sideDefaults()).
 */
export interface SuspenseBridge {
  debitEntries?: SuspenseBridgeEntry[];
  creditEntries?: SuspenseBridgeEntry[];
}

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
  /** Added v1.4.0 — see SuspenseBridge's doc comment above. */
  suspenseBridge?: SuspenseBridge;
  // Extension fields (see microservices/payment-component/src/routes/paymentInstructions.ts RequestExtensions).
  // chargeContext/liabilityContext existed here through v1.5.0; removed v1.6.0 along with §6.2/§6.3
  // Account Entry generation itself — see SuspenseBridge's doc comment above.
  sourceFunctionCode?: string;
  voucherCodePrefixOverride?: string;
  dryRun?: boolean;
  /**
   * Debit Legs Component Bridge Flag (2026-08-09; renamed from chargeComponentBridge
   * 2026-08-10 — see lc-payment-wc/CLAUDE.md's dated entry) — unlike the three extension
   * fields above, this one is NOT read out of a loose RequestExtensions sidecar server-side;
   * it's a real field on the microservice's own zod schema (validation/requestSchema.ts)
   * because it participates in a cross-field rule there: creditLegs may be empty only when
   * this is true AND suspenseBridge.creditEntries has at least 1 entry. Not charge-specific —
   * this request shape (Payment Component posts only debitLegs, the entire credit side is
   * bridged out via suspenseBridge.creditEntries) equally fits a Customer IBL Payment (Import
   * Bill Loan under a Buyer's Usance LC, distinct from the existing balanceModule:'IBL'
   * "Import Bill Liability" tag), or both sources in one request. Set to true iff
   * BusinessCaseConfig.debitLegsBridge is true for the selected case (business-case-request.ts)
   * — see that field's own doc comment (business-case.model.ts) for the full contract.
   */
  debitLegsComponentBridge?: boolean;
  /**
   * Credit Legs Component Bridge Flag (2026-08-12) — the mirror image of
   * debitLegsComponentBridge above: when true AND suspenseBridge.debitEntries has at least
   * 1 entry, debitLegs may be empty — this request only ever carries creditLegs (the real
   * outgoing settlement/payment legs, e.g. Cr Nostro); the entire debit side is provided by
   * the Suspense Debit bridge to a separate upstream component (e.g. a Loan Component
   * generating Dr IBL / Cr Suspense - IBL on its own books for a Buyer's Usance LC — see
   * lc-payment-wc/CLAUDE.md's dated entry for the full worked example). Mutually exclusive
   * with debitLegsComponentBridge (the microservice's zod schema rejects both true at once
   * with a 400). Set to true iff BusinessCaseConfig.creditLegsBridge is true for the selected
   * case (business-case-request.ts) — see that field's own doc comment (business-case.model.ts)
   * for the full contract.
   */
  creditLegsComponentBridge?: boolean;
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
