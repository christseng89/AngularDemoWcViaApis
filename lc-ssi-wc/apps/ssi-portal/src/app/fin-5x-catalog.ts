import type { MessageFormat } from "./app-view.models";

export interface TagScenario {
  id: string;
  module: string;
  label: string;
  purpose: string;
  format: MessageFormat;
  content: string;
  descriptor: {
    standardsRelease: string;
    messageType: string;
    direction: "INCOMING" | "OUTGOING";
    businessFunction: string;
    sequence?: string;
    settlementLeg?: string;
  };
}
const TREASURY_DEFAULT_PROFILE: Readonly<
  Record<
    string,
    { businessFunction: string; sequence: string; settlementLeg: string }
  >
> = {
  MT300: {
    businessFunction: "FX_CONFIRMATION",
    sequence: "B1",
    settlementLeg: "Amount Bought",
  },
  MT304: {
    businessFunction: "THIRD_PARTY_DEAL_INSTRUCTION",
    sequence: "B1",
    settlementLeg: "Amount Bought",
  },
  MT305: {
    businessFunction: "FX_OPTION_CONFIRMATION",
    sequence: "A",
    settlementLeg: "General Information",
  },
  MT306: {
    businessFunction: "FX_OPTION_CONFIRMATION",
    sequence: "C",
    settlementLeg: "Settlement Instructions for Payment of Premium",
  },
  MT320: {
    businessFunction: "LOAN_DEPOSIT_CONFIRMATION",
    sequence: "C",
    settlementLeg: "Settlement Instructions for Amounts Payable by Party A",
  },
  MT330: {
    businessFunction: "CALL_NOTICE_LOAN_DEPOSIT_CONFIRMATION",
    sequence: "C",
    settlementLeg: "Settlement Instructions for Amounts Payable by Party A",
  },
  MT340: {
    businessFunction: "FRA_CONFIRMATION",
    sequence: "C",
    settlementLeg:
      "Settlement Instructions for Settlement Amount Payable by Party B",
  },
  MT341: {
    businessFunction: "FRA_SETTLEMENT_CONFIRMATION",
    sequence: "C",
    settlementLeg: "Settlement Instructions for the Settlement Amount",
  },
  MT350: {
    businessFunction: "LOAN_DEPOSIT_INTEREST_PAYMENT",
    sequence: "C",
    settlementLeg: "Settlement Instructions",
  },
  MT360: {
    businessFunction: "SINGLE_CURRENCY_IRD_CONFIRMATION",
    sequence: "D",
    settlementLeg: "Payment Instructions for Interest Payable by Party B",
  },
  MT361: {
    businessFunction: "CROSS_CURRENCY_IRS_CONFIRMATION",
    sequence: "D",
    settlementLeg: "Payment Instructions for Interest Payable by Party B",
  },
  MT362: {
    businessFunction: "IRD_PAYMENT_ADVICE",
    sequence: "C",
    settlementLeg: "(Net) Amount(s) Payable by Party B",
  },
  MT364: {
    businessFunction: "SINGLE_CURRENCY_IRD_TERMINATION",
    sequence: "L",
    settlementLeg: "Fee Payable by Party B",
  },
  MT365: {
    businessFunction: "CROSS_CURRENCY_IRS_TERMINATION",
    sequence: "J",
    settlementLeg: "Re-exchange of Principal Payable by Party B",
  },
};
const TRADE_FINANCE_DEFAULT_PROFILE: Readonly<
  Record<
    string,
    { businessFunction: string; sequence: string; settlementLeg?: string }
  >
> = {
  MT400: {
    businessFunction: "COLLECTION_PAYMENT_DIRECT",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
  MT700: {
    businessFunction: "MT700_ISSUANCE",
    sequence: "MESSAGE",
    settlementLeg: "MESSAGE",
  },
  MT705: {
    businessFunction: "REFERENCE_ONLY",
    sequence: "MESSAGE",
    settlementLeg: "MESSAGE",
  },
  MT707: {
    businessFunction: "REFERENCE_ONLY",
    sequence: "MESSAGE",
    settlementLeg: "MESSAGE",
  },
  MT710: {
    businessFunction: "REFERENCE_ONLY",
    sequence: "MESSAGE",
    settlementLeg: "MESSAGE",
  },
  MT720: {
    businessFunction: "REFERENCE_ONLY",
    sequence: "MESSAGE",
    settlementLeg: "MESSAGE",
  },
  MT730: {
    businessFunction: "CHARGES_SETTLEMENT",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
  MT734: {
    businessFunction: "REFUND_CLAIM_SETTLEMENT",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
  MT740: {
    businessFunction: "REFERENCE_ONLY",
    sequence: "MESSAGE",
    settlementLeg: "MESSAGE",
  },
  MT742: {
    businessFunction: "REIMBURSEMENT_CLAIM",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
  MT750: {
    businessFunction: "AMOUNT_CLAIMED_SETTLEMENT",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
  MT752: {
    businessFunction: "PAYMENT_AUTHORIZATION_SETTLEMENT",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
  MT754: {
    businessFunction: "PAYMENT_ACCEPTANCE_NEGOTIATION",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
  MT756: {
    businessFunction: "REIMBURSEMENT_PAYMENT",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
  MT760: {
    businessFunction: "GUARANTEE_STANDBY_ISSUANCE",
    sequence: "B",
    settlementLeg: "B",
  },
  MT765: {
    businessFunction: "GUARANTEE_CLAIM",
    sequence: "MESSAGE",
  },
  MT768: {
    businessFunction: "CHARGES_SETTLEMENT",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
  MT769: {
    businessFunction: "CHARGES_SETTLEMENT",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
};
export const TAG_CATALOG_COLUMNS: readonly {
  key: keyof TagMessageCatalogItem;
  label: string;
}[] = [
  { key: "messageType", label: "MT Type" },
  { key: "description", label: "SWIFT Description" },
  { key: "applicableTags", label: "SR2026 5x Profile Slots" },
  { key: "verified", label: "Mapping Status" },
];
export interface TagMessageCatalogItem {
  messageType: string;
  description: string;
  applicableTags: string;
  verified: boolean;
}
export interface FinResolutionCatalogueItem {
  messageType: string;
  resolutionMode: "TREASURY" | "TRADE_FINANCE";
  profileSlots: readonly string[];
  ssiResolvableTags: readonly string[];
}
export interface FinResolutionCatalogueResponse {
  standardsRelease: string;
  catalogueVersion: string;
  items: readonly FinResolutionCatalogueItem[];
}
export type TagCatalogSortKey = keyof TagMessageCatalogItem;
export interface TagFieldExpectation {
  tag: string;
  semanticRole: string;
  expectedSource: string;
  officialFieldName?: string;
}
const tagField = (
  tag: string,
  semanticRole: string,
  expectedSource: string,
): TagFieldExpectation => ({ tag, semanticRole, expectedSource });

export const MT_MESSAGE_NAMES: Readonly<Record<string, string>> = {
  MT300: "Foreign Exchange Confirmation",
  MT304: "Advice / Instruction of a Third Party Deal",
  MT305: "Foreign Currency Option Confirmation",
  MT306: "Foreign Currency Option Confirmation",
  MT320: "Fixed Loan / Deposit Confirmation",
  MT330: "Call / Notice Loan / Deposit Confirmation",
  MT340: "Forward Rate Agreement Confirmation",
  MT341: "Forward Rate Agreement Settlement Confirmation",
  MT350: "Advice of Loan / Deposit Interest Payment",
  MT360: "Single Currency Interest Rate Derivative Confirmation",
  MT361: "Cross Currency Interest Rate Swap Confirmation",
  MT362: "Interest Rate Derivative Payment Advice",
  MT364: "Single Currency Interest Rate Derivative Termination / Recouponing",
  MT365: "Cross Currency Interest Rate Swap Termination / Recouponing",
  MT101: "Request for Transfer",
  MT103: "Single Customer Credit Transfer",
  MT200: "Financial Institution Transfer for its Own Account",
  MT202: "General Financial Institution Transfer",
  MT202COV: "General Financial Institution Transfer — Cover",
  MT203: "Multiple General Financial Institution Transfer",
  MT205: "Financial Institution Transfer Execution",
  MT205COV: "Financial Institution Transfer Execution — Cover",
  MT400: "Advice of Payment",
  MT410: "Acknowledgement",
  MT412: "Advice of Acceptance",
  MT416: "Advice of Non-Payment / Non-Acceptance",
  MT420: "Tracer",
  MT422: "Advice of Fate and Request for Instructions",
  MT430: "Amendment of Instructions",
  MT450: "Cash Letter Credit Advice",
  MT455: "Cash Letter Credit Adjustment Advice",
  MT456: "Advice of Dishonour",
  MT700: "Issue of a Documentary Credit",
  MT705: "Pre-Advice of a Documentary Credit",
  MT707: "Amendment to a Documentary Credit",
  MT710: "Advice of a Third Bank's Documentary Credit",
  MT720: "Transfer of a Documentary Credit",
  MT730: "Acknowledgement",
  MT734: "Advice of Refusal",
  MT740: "Authorisation to Reimburse",
  MT742: "Reimbursement Claim",
  MT750: "Advice of Discrepancy",
  MT752: "Authorisation to Pay, Accept or Negotiate",
  MT754: "Advice of Payment / Acceptance / Negotiation",
  MT756: "Advice of Reimbursement or Payment",
  MT760: "Issue of a Demand Guarantee / Standby Letter of Credit",
  MT765: "Guarantee / Standby Letter of Credit Demand",
  MT767: "Amendment to a Demand Guarantee / Standby Letter of Credit",
  MT768: "Acknowledgement of a Guarantee / Standby Message",
  MT769: "Advice of Reduction or Release",
};
export const TAG_FIELD_EXPECTATIONS: Readonly<
  Record<string, readonly TagFieldExpectation[]>
> = {
  MT400: [
    tagField("53A", "SENDERS_CORRESPONDENT", "SSI_ROUTE"),
    tagField("54A", "RECEIVERS_CORRESPONDENT", "SSI_ROUTE"),
    tagField("57A", "ACCOUNT_WITH_BANK", "SSI_ROUTE"),
    tagField("58A", "BENEFICIARY_BANK", "TRANSACTION_CONTEXT / PARTY_MASTER"),
  ],
  MT700: [
    tagField("53A", "REIMBURSING_BANK", "SSI_ROUTE"),
    tagField(
      "57A",
      "ADVISE_THROUGH_BANK",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
    tagField(
      "58A",
      "REQUESTED_CONFIRMATION_PARTY",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
  ],
  MT705: [
    tagField(
      "57A",
      "ADVISE_THROUGH_BANK",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
  ],
  MT707: [
    tagField("53A", "REIMBURSING_BANK", "SSI_ROUTE"),
    tagField(
      "57A",
      "ADVISE_THROUGH_BANK",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
    tagField(
      "58A",
      "REQUESTED_CONFIRMATION_PARTY",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
  ],
  MT710: [
    tagField("53A", "REIMBURSING_BANK", "SSI_ROUTE"),
    tagField(
      "57A",
      "ADVISE_THROUGH_BANK",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
    tagField(
      "58A",
      "REQUESTED_CONFIRMATION_PARTY",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
  ],
  MT720: [
    tagField(
      "57A",
      "ADVISE_THROUGH_BANK",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
    tagField(
      "58A",
      "REQUESTED_CONFIRMATION_PARTY",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
  ],
  MT730: [tagField("57A", "ACCOUNT_WITH_BANK", "CHARGE_ACCOUNT_INSTRUCTION")],
  MT734: [
    tagField("57A", "ACCOUNT_WITH_BANK", "SSI_ROUTE / TRANSACTION_CONTEXT"),
  ],
  MT740: [
    tagField("58A", "NEGOTIATING_BANK", "TRANSACTION_CONTEXT / PARTY_MASTER"),
  ],
  MT742: [
    tagField("57A", "ACCOUNT_WITH_BANK", "SSI_ROUTE"),
    tagField("58A", "BENEFICIARY_BANK", "TRANSACTION_CONTEXT / PARTY_MASTER"),
  ],
  MT750: [
    tagField("57A", "ACCOUNT_WITH_BANK", "SSI_ROUTE / TRANSACTION_CONTEXT"),
  ],
  MT752: [
    tagField("53A", "SENDERS_CORRESPONDENT", "SSI_ROUTE"),
    tagField("54A", "RECEIVERS_CORRESPONDENT", "SSI_ROUTE"),
  ],
  MT754: [
    tagField("53A", "REIMBURSING_BANK", "SSI_ROUTE"),
    tagField("57A", "ACCOUNT_WITH_BANK", "SSI_ROUTE"),
    tagField("58A", "BENEFICIARY_BANK", "TRANSACTION_CONTEXT / PARTY_MASTER"),
  ],
  MT756: [
    tagField("53A", "SENDERS_CORRESPONDENT", "SSI_ROUTE"),
    tagField("54A", "RECEIVERS_CORRESPONDENT", "SSI_ROUTE"),
  ],
  MT760: [
    tagField("56A", "ADVISING_BANK", "TRANSACTION_CONTEXT / PARTY_MASTER"),
    tagField(
      "57A",
      "ADVISE_THROUGH_BANK",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
    tagField(
      "58A",
      "REQUESTED_CONFIRMATION_PARTY",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
  ],
  MT765: [
    tagField("56A", "INTERMEDIARY", "SSI_ROUTE / TRANSACTION_CONTEXT"),
    tagField(
      "57A",
      "ACCOUNT_WITH_INSTITUTION",
      "SSI_ROUTE / TRANSACTION_CONTEXT",
    ),
  ],
  MT768: [tagField("57A", "ACCOUNT_WITH_BANK", "CHARGE_ACCOUNT_INSTRUCTION")],
  MT769: [tagField("57A", "ACCOUNT_WITH_BANK", "CHARGE_ACCOUNT_INSTRUCTION")],
};

export const BIC_PATTERN = "^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$";
export const COUNTERPARTY_ID_PATTERN = "^[A-Z0-9][A-Z0-9._-]{2,34}$";
const TAG_SCENARIOS: readonly TagScenario[] = [
  {
    id: "MT742_OUT",
    module: "REIMBURSEMENT",
    label: "MT742 · Outgoing reimbursement claim",
    purpose: "由 57A／58A 擷取付款銀行角色，只建立候選與證據。",
    format: "FIN_LIKE",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "MT742",
      direction: "OUTGOING",
      businessFunction: "REIMBURSEMENT_CLAIM",
    },
    content:
      "STANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=MT742\nDIRECTION=OUTGOING\nBUSINESS_FUNCTION=REIMBURSEMENT_CLAIM\n:57A:CITIUS33\n:58A:BOFAUS3N",
  },
  {
    id: "MT700_OUT",
    module: "DOCUMENTARY_CREDIT",
    label: "MT700 · Outgoing LC issuance",
    purpose:
      "依交易輸入與已核准 standing reference 建議 53a Reimbursing Bank、57a Advise Through Bank、58a Requested Confirmation Party。",
    format: "FIN_LIKE",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "MT700",
      direction: "OUTGOING",
      businessFunction: "MT700_ISSUANCE",
    },
    content:
      "STANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=MT700\nDIRECTION=OUTGOING\nBUSINESS_FUNCTION=MT700_ISSUANCE\n:53A:CHASUS33\n:57A:BARCGB22\n:58A:CITIUS33",
  },
  {
    id: "MT765_OUT",
    module: "STANDBY_GUARANTEE",
    label: "MT765 · Outgoing guarantee claim",
    purpose:
      "索賠帶入的 57A 只可作 Transaction-only 候選，不能自動覆寫 Active SSI。",
    format: "FIN_LIKE",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "MT765",
      direction: "OUTGOING",
      businessFunction: "GUARANTEE_CLAIM",
    },
    content:
      "STANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=MT765\nDIRECTION=OUTGOING\nBUSINESS_FUNCTION=GUARANTEE_CLAIM\n:57A:HSBCHKHH",
  },
  {
    id: "MT760_OUT",
    module: "STANDBY_GUARANTEE",
    label: "MT760 · Outgoing guarantee / standby issuance",
    purpose:
      "依核准 standing reference 與交易輸入建議 56a Advising Bank、57a Advise Through Bank、58a Requested Confirmation Party。",
    format: "FIN_LIKE",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "MT760",
      direction: "OUTGOING",
      businessFunction: "GUARANTEE_STANDBY_ISSUANCE",
    },
    content:
      "STANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=MT760\nDIRECTION=OUTGOING\nBUSINESS_FUNCTION=GUARANTEE_STANDBY_ISSUANCE\n:56A:BARCGB22\n:57A:DEUTDEFF\n:58A:CITIUS33",
  },
  {
    id: "MT400_OUT",
    module: "COLLECTION",
    label: "MT400 · Outgoing collection payment",
    purpose: "使用 Active SSI 生成 53A／54A 的託收直接結算欄位子集。",
    format: "FIN_LIKE",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "MT400",
      direction: "OUTGOING",
      businessFunction: "COLLECTION_PAYMENT_DIRECT",
    },
    content:
      "STANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=MT400\nDIRECTION=OUTGOING\nBUSINESS_FUNCTION=COLLECTION_PAYMENT_DIRECT\n:53A:CITIUS33\n:54A:DEUTDEFF",
  },
  {
    id: "MT300_OUT",
    module: "TREASURY_FX",
    label: "MT300 · Outgoing FX confirmation",
    purpose:
      "由 Active SSI 生成 sequence-qualified 53A／56A／57A／58A settlement roles。",
    format: "FIN_LIKE",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "MT300",
      direction: "OUTGOING",
      businessFunction: "FX_CONFIRMATION",
    },
    content:
      "STANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=MT300\nDIRECTION=OUTGOING\nBUSINESS_FUNCTION=FX_CONFIRMATION\n:B1.53A:CITIUS33\n:B1.56A:CHASUS33\n:B1.57A:DEUTDEFF\n:B1.58A:BNPAFRPP",
  },
  {
    id: "MT320_OUT",
    module: "TREASURY_MONEY_MARKET",
    label: "MT320 · Outgoing loan/deposit confirmation",
    purpose:
      "由 Active SSI 生成 53A／56A／57A／58A settlement roles；只處理 SSI 欄位子集。",
    format: "FIN_LIKE",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "MT320",
      direction: "OUTGOING",
      businessFunction: "LOAN_DEPOSIT_CONFIRMATION",
    },
    content:
      "STANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=MT320\nDIRECTION=OUTGOING\nBUSINESS_FUNCTION=LOAN_DEPOSIT_CONFIRMATION\n:53A:SCBLGB2L\n:56A:DEUTDEFF\n:57A:CITIUS33\n:58A:BNPAFRPP",
  },
  {
    id: "PACS008_OUT",
    module: "CENTRAL_PAYMENT",
    label: "pacs.008.001.12 · Customer transfer",
    purpose: "由 Active SSI 生成 CdtrAgt/FinInstnId/BICFI 付款代理元素。",
    format: "MX_JSON",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "pacs.008.001.12",
      direction: "OUTGOING",
      businessFunction: "CUSTOMER_CREDIT_TRANSFER",
    },
    content:
      '{\n  "standardsRelease": "SR2026",\n  "messageType": "pacs.008.001.12",\n  "direction": "OUTGOING",\n  "businessFunction": "CUSTOMER_CREDIT_TRANSFER",\n  "fields": { "CdtrAgt.FinInstnId.BICFI": "BOFAUS3N" }\n}',
  },
  {
    id: "PACS009_OUT",
    module: "CENTRAL_PAYMENT",
    label: "pacs.009.001.08 · FI transfer",
    purpose:
      "由 Active SSI 生成 CdtrAgt/FinInstnId/BICFI 金融機構付款代理元素。",
    format: "MX_JSON",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "pacs.009.001.08",
      direction: "OUTGOING",
      businessFunction: "FINANCIAL_INSTITUTION_TRANSFER",
    },
    content:
      '{\n  "standardsRelease": "SR2026",\n  "messageType": "pacs.009.001.08",\n  "direction": "OUTGOING",\n  "businessFunction": "FINANCIAL_INSTITUTION_TRANSFER",\n  "fields": { "CdtrAgt.FinInstnId.BICFI": "CITIUS33" }\n}',
  },
  {
    id: "PACS009_COV_OUT",
    module: "CENTRAL_PAYMENT",
    label: "pacs.009.001.08 COV · Cover transfer",
    purpose:
      "由 Active SSI 生成 IntrmyAgt1/FinInstnId/BICFI cover intermediary。",
    format: "MX_JSON",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "pacs.009.001.08",
      direction: "OUTGOING",
      businessFunction: "COVER_TRANSFER",
    },
    content:
      '{\n  "standardsRelease": "SR2026",\n  "messageType": "pacs.009.001.08",\n  "businessService": "swift.cbprplus.cov.04",\n  "direction": "OUTGOING",\n  "businessFunction": "COVER_TRANSFER",\n  "fields": { "IntrmyAgt1.FinInstnId.BICFI": "CHASUS33" }\n}',
  },
];

interface ModuleDefinition {
  id: string;
  label: string;
  messages: readonly string[];
}

const COLLECTION_MESSAGES = [
  "MT400",
  "MT410",
  "MT412",
  "MT416",
  "MT420",
  "MT422",
  "MT430",
  "MT450",
  "MT455",
  "MT456",
  "MT490",
  "MT491",
  "MT492",
  "MT495",
  "MT496",
  "MT498",
  "MT499",
] as const;

const GUARANTEE_MESSAGES = [
  "MT760",
  "MT761",
  "MT765",
  "MT767",
  "MT768",
  "MT769",
  "MT775",
  "MT785",
  "MT786",
  "MT787",
  "MT790",
  "MT791",
  "MT792",
  "MT795",
  "MT796",
  "MT798",
  "MT799",
] as const;

const PAYMENT_MESSAGES = [
  "MT101",
  "MT103",
  "MT200",
  "MT202",
  "MT202COV",
  "MT203",
  "MT205",
  "MT205COV",
  "pacs.008.001.12",
  "pacs.009.001.08",
] as const;

const MODULE_DEFINITIONS: readonly ModuleDefinition[] = [
  {
    id: "IMPORT_LC",
    label: "Import Documentary Credit",
    messages: [
      "MT700",
      "MT701",
      "MT705",
      "MT707",
      "MT708",
      "MT730",
      "MT732",
      "MT734",
      "MT740",
      "MT742",
      "MT744",
      "MT747",
      "MT750",
      "MT752",
      "MT754",
      "MT756",
      "MT759",
      "MT790",
      "MT791",
      "MT792",
      "MT795",
      "MT796",
      "MT798",
      "MT799",
    ],
  },
  {
    id: "EXPORT_LC",
    label: "Export Documentary Credit",
    messages: [
      "MT700",
      "MT701",
      "MT705",
      "MT707",
      "MT708",
      "MT710",
      "MT711",
      "MT720",
      "MT721",
      "MT730",
      "MT732",
      "MT734",
      "MT740",
      "MT742",
      "MT744",
      "MT747",
      "MT750",
      "MT752",
      "MT754",
      "MT756",
      "MT759",
      "MT790",
      "MT791",
      "MT792",
      "MT795",
      "MT796",
      "MT798",
      "MT799",
    ],
  },
  {
    id: "LC_REIMBURSEMENT",
    label: "LC Reimbursement",
    messages: ["MT740", "MT742", "MT744", "MT747", "MT756"],
  },
  {
    id: "IMPORT_COLLECTION",
    label: "Import Collection",
    messages: COLLECTION_MESSAGES,
  },
  {
    id: "EXPORT_COLLECTION",
    label: "Export Collection",
    messages: COLLECTION_MESSAGES,
  },
  {
    id: "STANDBY_LC",
    label: "Standby Letter of Credit",
    messages: GUARANTEE_MESSAGES,
  },
  {
    id: "DEMAND_GUARANTEE",
    label: "Demand Guarantee／LG",
    messages: GUARANTEE_MESSAGES,
  },
  {
    id: "SHIPPING_GUARANTEE",
    label: "Shipping Guarantee（no automatic MT760 assumption）",
    messages: ["MT759", "MT799"],
  },
  {
    id: "TREASURY_FX",
    label: "Treasury FX／Options",
    messages: ["MT300", "MT304", "MT305", "MT306", "MT380", "MT381"],
  },
  {
    id: "TREASURY_MONEY_MARKET",
    label: "Treasury Money Market／Loan／Deposit",
    messages: [
      "MT320",
      "MT321",
      "MT330",
      "MT350",
      "MT390",
      "MT391",
      "MT392",
      "MT395",
      "MT396",
      "MT398",
      "MT399",
    ],
  },
  {
    id: "TREASURY_DERIVATIVES",
    label: "Treasury FRA／Derivatives／Netting",
    messages: [
      "MT340",
      "MT341",
      "MT360",
      "MT361",
      "MT362",
      "MT364",
      "MT365",
      "MT370",
    ],
  },
  {
    id: "INWARD_PAYMENT",
    label: "Inward Payment",
    messages: PAYMENT_MESSAGES,
  },
  {
    id: "OUTWARD_PAYMENT",
    label: "Outward Payment",
    messages: PAYMENT_MESSAGES,
  },
  {
    id: "CENTRAL_PAYMENT",
    label: "Central Payment／CBPR+",
    messages: [
      "MT103",
      "MT202",
      "MT202COV",
      "MT205",
      "MT205COV",
      "pacs.008.001.12",
      "pacs.009.001.08",
    ],
  },
];
interface BusinessFunctionDefinition {
  code: string;
  consumer: "TRADE_FINANCE" | "TREASURY" | "CENTRAL_PAYMENT";
  nameZh: string;
  nameEn: string;
  categoryId: string;
  moduleId: string;
  messageType: string;
  paymentLeg: string;
}

type BusinessFunctionFields = [
  string,
  BusinessFunctionDefinition["consumer"],
  string,
  string,
  string,
  string,
  string,
  string,
];

const parseBusinessFunction = (row: string): BusinessFunctionDefinition => {
  const [
    code,
    consumer,
    nameZh,
    nameEn,
    categoryId,
    moduleId,
    messageType,
    paymentLeg,
  ] = row.split("|") as BusinessFunctionFields;
  return {
    code,
    consumer: consumer as BusinessFunctionDefinition["consumer"],
    nameZh,
    nameEn,
    categoryId,
    moduleId,
    messageType,
    paymentLeg,
  };
};

export const BUSINESS_FUNCTION_DEFINITIONS: readonly BusinessFunctionDefinition[] =
  `
IMPORT_LC_BANK_REIMBURSEMENT|TRADE_FINANCE|進口信用狀銀行償付|Import LC Bank Reimbursement|IMPORT|IMPORT_LC|pacs.009.001.08|BANK_REIMBURSEMENT
EXPORT_LC_PROCEEDS_SETTLEMENT|TRADE_FINANCE|出口信用狀款項交割|Export LC Proceeds Settlement|EXPORT|EXPORT_LC|pacs.008.001.12|PROCEEDS_SETTLEMENT
IMPORT_COLLECTION_PAYMENT|TRADE_FINANCE|進口託收付款|Import Collection Payment|IMPORT|IMPORT_COLLECTION|pacs.009.001.12|COLLECTION_SETTLEMENT
EXPORT_COLLECTION_PROCEEDS_SETTLEMENT|TRADE_FINANCE|出口託收款項交割|Export Collection Proceeds Settlement|EXPORT|EXPORT_COLLECTION|pacs.008.001.12|PROCEEDS_SETTLEMENT
LC_REIMBURSEMENT_SETTLEMENT|TRADE_FINANCE|信用狀償付交割|LC Reimbursement Settlement|REIMBURSEMENT|LC_REIMBURSEMENT|pacs.009.001.12|BANK_REIMBURSEMENT
STANDBY_LC_CLAIM_PAYMENT|TRADE_FINANCE|備用信用狀索賠付款|Standby LC Claim Payment|GUARANTEE|STANDBY_LC|pacs.009.001.12|CLAIM_PAYMENT
DEMAND_GUARANTEE_CLAIM_PAYMENT|TRADE_FINANCE|保函索賠付款|Demand Guarantee Claim Payment|GUARANTEE|DEMAND_GUARANTEE|pacs.009.001.12|CLAIM_PAYMENT
FX_SETTLEMENT|TREASURY|外匯交易交割|FX Settlement|TREASURY|TREASURY_FX|pacs.009.001.12|INTERBANK_SETTLEMENT
MONEY_MARKET_SETTLEMENT|TREASURY|貨幣市場交割|Money Market Settlement|TREASURY|TREASURY_MONEY_MARKET|pacs.009.001.12|INTERBANK_SETTLEMENT
INTERBANK_TRANSFER|CENTRAL_PAYMENT|銀行間匯款|Interbank Transfer|PAYMENT|CENTRAL_PAYMENT|pacs.009.001.12|INTERBANK_SETTLEMENT
CUSTOMER_CREDIT_TRANSFER|CENTRAL_PAYMENT|客戶匯款|Customer Credit Transfer|PAYMENT|CENTRAL_PAYMENT|pacs.008.001.12|CUSTOMER_TRANSFER
`
    .trim()
    .split("\n")
    .map(parseBusinessFunction);
const CURATED_SCENARIO_BY_KEY = new Map(
  TAG_SCENARIOS.map((scenario) => [
    scenario.descriptor.messageType + "|" + scenario.descriptor.direction,
    scenario,
  ]),
);
export const FULL_TAG_SCENARIOS: readonly (TagScenario & {
  executable: boolean;
})[] = [
  ...new Set(MODULE_DEFINITIONS.flatMap((module) => module.messages)),
].map((messageType) => {
  const direction = "OUTGOING" as const;
  const resolutionProfile =
    TREASURY_DEFAULT_PROFILE[messageType] ??
    TRADE_FINANCE_DEFAULT_PROFILE[messageType];
  const curated = CURATED_SCENARIO_BY_KEY.get(messageType + "|" + direction);
  if (curated)
    return {
      ...curated,
      descriptor: {
        ...curated.descriptor,
        ...resolutionProfile,
      },
      executable: true,
      purpose: curated.purpose,
    };

  const format: MessageFormat = messageType.startsWith("pacs.")
    ? "MX_JSON"
    : "FIN_LIKE";
  const businessFunction =
    resolutionProfile?.businessFunction ?? "REFERENCE_ONLY";
  const content =
    format === "MX_JSON"
      ? JSON.stringify(
          {
            standardsRelease: "SR2026",
            messageType,
            direction,
            businessFunction,
            fields: {},
          },
          null,
          2,
        )
      : "STANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=" +
        messageType +
        "\nDIRECTION=" +
        direction +
        "\nBUSINESS_FUNCTION=" +
        businessFunction;
  return {
    id: messageType.replaceAll(".", "_") + "_OUTGOING",
    module: "SWIFT_FIN",
    label: messageType,
    purpose:
      "目標 Standards Release 的欄位 profile 已驗證；只以明確標示的 Synthetic Demo SSI／transaction evidence 產生 reference-only 5x 建議。",
    format,
    content,
    executable: true,
    descriptor: {
      standardsRelease: "SR2026",
      messageType,
      direction,
      businessFunction,
      ...(resolutionProfile
        ? {
            sequence: resolutionProfile.sequence,
            settlementLeg: resolutionProfile.settlementLeg,
          }
        : {}),
    },
  };
});
