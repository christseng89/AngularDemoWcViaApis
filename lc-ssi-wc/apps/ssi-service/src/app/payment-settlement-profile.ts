export type PaymentCounterpartyType = "BANK" | "CUSTOMER";

interface ServicePaymentSettlementProfile {
  readonly consumer: "CENTRAL_PAYMENT";
  readonly product: "CENTRAL_PAYMENT";
  readonly businessFunction: "INTERBANK_TRANSFER" | "CUSTOMER_CREDIT_TRANSFER";
  readonly paymentLeg: "INTERBANK_SETTLEMENT" | "CUSTOMER_TRANSFER";
  readonly mxMessageType: "pacs.009.001.08" | "pacs.008.001.12";
  readonly mtMessageType: "MT202" | "MT103";
}

export type PaymentFinMessageType =
  | "MT103"
  | "MT200"
  | "MT201"
  | "MT202"
  | "MT202COV"
  | "MT203"
  | "MT205"
  | "MT205COV";

const BANK_FIN_MESSAGES = new Set<PaymentFinMessageType>([
  "MT200",
  "MT201",
  "MT202",
  "MT202COV",
  "MT203",
  "MT205",
  "MT205COV",
]);

export function paymentFinMessageType(
  counterpartyType: PaymentCounterpartyType,
  sourceMessageType?: string,
): PaymentFinMessageType {
  if (counterpartyType === "CUSTOMER") return "MT103";
  if (
    sourceMessageType &&
    BANK_FIN_MESSAGES.has(sourceMessageType as PaymentFinMessageType)
  )
    return sourceMessageType as PaymentFinMessageType;
  return "MT202";
}

const PROFILES: Readonly<
  Record<PaymentCounterpartyType, ServicePaymentSettlementProfile>
> = {
  BANK: {
    consumer: "CENTRAL_PAYMENT",
    product: "CENTRAL_PAYMENT",
    businessFunction: "INTERBANK_TRANSFER",
    paymentLeg: "INTERBANK_SETTLEMENT",
    mxMessageType: "pacs.009.001.08",
    mtMessageType: "MT202",
  },
  CUSTOMER: {
    consumer: "CENTRAL_PAYMENT",
    product: "CENTRAL_PAYMENT",
    businessFunction: "CUSTOMER_CREDIT_TRANSFER",
    paymentLeg: "CUSTOMER_TRANSFER",
    mxMessageType: "pacs.008.001.12",
    mtMessageType: "MT103",
  },
};

export function paymentSettlementProfile(
  counterpartyType: PaymentCounterpartyType,
): ServicePaymentSettlementProfile {
  return PROFILES[counterpartyType];
}
