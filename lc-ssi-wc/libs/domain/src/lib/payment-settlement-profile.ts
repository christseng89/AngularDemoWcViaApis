export type PaymentCounterpartyType = "BANK" | "CUSTOMER";

export interface PaymentSettlementProfile {
  readonly counterpartyType: PaymentCounterpartyType;
  readonly consumer: "CENTRAL_PAYMENT";
  readonly product: "CENTRAL_PAYMENT";
  readonly businessFunction: "INTERBANK_TRANSFER" | "CUSTOMER_CREDIT_TRANSFER";
  readonly paymentLeg: "INTERBANK_SETTLEMENT" | "CUSTOMER_TRANSFER";
  readonly mxMessageType: "pacs.009.001.08" | "pacs.008.001.12";
  readonly mtMessageType: "MT202" | "MT103";
}

const PAYMENT_SETTLEMENT_PROFILES: Readonly<
  Record<PaymentCounterpartyType, PaymentSettlementProfile>
> = Object.freeze({
  BANK: Object.freeze({
    counterpartyType: "BANK",
    consumer: "CENTRAL_PAYMENT",
    product: "CENTRAL_PAYMENT",
    businessFunction: "INTERBANK_TRANSFER",
    paymentLeg: "INTERBANK_SETTLEMENT",
    mxMessageType: "pacs.009.001.08",
    mtMessageType: "MT202",
  }),
  CUSTOMER: Object.freeze({
    counterpartyType: "CUSTOMER",
    consumer: "CENTRAL_PAYMENT",
    product: "CENTRAL_PAYMENT",
    businessFunction: "CUSTOMER_CREDIT_TRANSFER",
    paymentLeg: "CUSTOMER_TRANSFER",
    mxMessageType: "pacs.008.001.12",
    mtMessageType: "MT103",
  }),
});

export function paymentSettlementProfile(
  counterpartyType: PaymentCounterpartyType,
): PaymentSettlementProfile {
  return PAYMENT_SETTLEMENT_PROFILES[counterpartyType];
}

export interface BeneficiaryCustomerInput {
  readonly customerId: string;
  readonly name: string;
  readonly accountReference: string;
  readonly address?: string;
}

export interface CanonicalPaymentSettlement {
  readonly finMessageType:
    | "MT103"
    | "MT200"
    | "MT201"
    | "MT202"
    | "MT202COV"
    | "MT203"
    | "MT205"
    | "MT205COV";
  readonly instructingAgentBic: string;
  readonly instructedAgentBic: string;
  readonly deliveryAgentBic: string;
  readonly intermediaryAgentBics: readonly string[];
  readonly creditorAgentBic: string;
  readonly beneficiaryInstitutionBic: string;
  readonly orderingInstitutionBic?: string;
  readonly beneficiaryCustomer?: BeneficiaryCustomerInput;
  readonly reimbursementAgentBics: readonly string[];
  readonly settlementAccountReference: string;
  readonly settlementCountry: string;
  readonly settlementMarket: string;
  readonly clearingSystem: string;
  readonly schemeType: string;
  readonly fieldProvenance: Readonly<
    Record<string, { readonly source: string; readonly evidenceId: string }>
  >;
}

function mtClearingIdentifier(settlement: CanonicalPaymentSettlement): string {
  if (settlement.clearingSystem === "FEDWIRE") return "//FW";
  if (settlement.clearingSystem === "T2") return "//RT";
  return "";
}

function applyClearingIdentifierOnce(
  fields: Readonly<Record<string, string>>,
  orderedTags: readonly string[],
  clearingIdentifier: string,
): Readonly<Record<string, unknown>> {
  if (!clearingIdentifier) return fields;
  const target = orderedTags.find((tag) => Boolean(fields[tag]));
  if (!target) return fields;
  return { ...fields, [target]: `${clearingIdentifier}\n${fields[target]}` };
}

function normalizedRouteFields(
  settlement: CanonicalPaymentSettlement,
  prefix = "",
): Readonly<Record<string, string>> {
  const intermediary = settlement.intermediaryAgentBics[0] ?? "";
  const deliveryAgent =
    settlement.deliveryAgentBic === settlement.instructedAgentBic
      ? ""
      : settlement.deliveryAgentBic;
  const creditorAgent =
    settlement.creditorAgentBic === settlement.instructedAgentBic &&
    !intermediary
      ? ""
      : settlement.creditorAgentBic;
  return {
    [`${prefix}53A`]: deliveryAgent,
    [`${prefix}56A`]: intermediary,
    [`${prefix}57A`]: creditorAgent,
  };
}

function withoutEmptyValues(
  fields: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) =>
      typeof value === "string" ? Boolean(value) : value !== undefined,
    ),
  );
}

export function renderPaymentSettlement(
  format: "MT" | "MX",
  settlement: CanonicalPaymentSettlement,
): Readonly<Record<string, unknown>> {
  return format === "MT"
    ? renderMtSettlement(settlement)
    : renderMxSettlement(settlement);
}

function renderedMtFields(
  settlement: CanonicalPaymentSettlement,
  fields: Readonly<Record<string, string>>,
  clearingTags: readonly string[],
): Readonly<Record<string, unknown>> {
  return withoutEmptyValues(
    applyClearingIdentifierOnce(
      fields,
      clearingTags,
      mtClearingIdentifier(settlement),
    ),
  );
}

function renderMtSettlement(
  settlement: CanonicalPaymentSettlement,
): Readonly<Record<string, unknown>> {
  switch (settlement.finMessageType) {
    case "MT103":
      return withoutEmptyValues({
        ...normalizedRouteFields(settlement),
        "59": settlement.beneficiaryCustomer,
      });
    case "MT200":
    case "MT201":
      return renderedMtFields(
        settlement,
        {
          "56A": settlement.intermediaryAgentBics[0] ?? "",
          "57A": settlement.creditorAgentBic || settlement.instructedAgentBic,
        },
        ["56A", "57A"],
      );
    case "MT202":
      return renderedMtFields(
        settlement,
        {
          ...normalizedRouteFields(settlement),
          "58A": settlement.beneficiaryInstitutionBic,
        },
        ["56A", "57A", "58A"],
      );
    case "MT202COV":
      return renderedMtFields(
        settlement,
        {
          ...normalizedRouteFields(settlement, "A."),
          "A.58A": settlement.beneficiaryInstitutionBic,
        },
        ["A.56A", "A.57A", "A.58A"],
      );
    case "MT203":
      return renderedMtFields(
        settlement,
        {
          "56A": settlement.intermediaryAgentBics[0] ?? "",
          "57A":
            settlement.creditorAgentBic === settlement.instructedAgentBic
              ? ""
              : settlement.creditorAgentBic,
          "58A": settlement.beneficiaryInstitutionBic,
        },
        ["56A", "57A", "58A"],
      );
    case "MT205":
    case "MT205COV":
      return renderMt205Settlement(settlement);
  }
}

function renderMt205Settlement(
  settlement: CanonicalPaymentSettlement,
): Readonly<Record<string, unknown>> {
  if (!settlement.orderingInstitutionBic) {
    return {
      status: "NOT_SUPPORTED",
      reasonCode: "MANDATORY_52A_NOT_DERIVABLE",
    };
  }
  const prefix = settlement.finMessageType === "MT205COV" ? "A." : "";
  return renderedMtFields(
    settlement,
    {
      [`${prefix}52A`]: settlement.orderingInstitutionBic,
      ...normalizedRouteFields(settlement, prefix),
      [`${prefix}58A`]: settlement.beneficiaryInstitutionBic,
    },
    [`${prefix}56A`, `${prefix}57A`, `${prefix}58A`],
  );
}

function renderMxSettlement(
  settlement: CanonicalPaymentSettlement,
): Readonly<Record<string, unknown>> {
  const base: Record<string, unknown> = {
    "GrpHdr.SttlmInf.ClrSys": settlement.clearingSystem,
    "GrpHdr.SttlmInf.SttlmAcct": settlement.settlementAccountReference,
    "CdtTrfTxInf.InstgAgt.FinInstnId.BICFI": settlement.instructingAgentBic,
    "CdtTrfTxInf.InstdAgt.FinInstnId.BICFI": settlement.instructedAgentBic,
    "CdtTrfTxInf.IntrmyAgt1.FinInstnId.BICFI":
      settlement.intermediaryAgentBics[0] ?? "",
    "CdtTrfTxInf.CdtrAgt.FinInstnId.BICFI": settlement.creditorAgentBic,
  };
  if (settlement.beneficiaryCustomer) {
    base["CdtTrfTxInf.Cdtr.Nm"] = settlement.beneficiaryCustomer.name;
    base["CdtTrfTxInf.CdtrAcct.Id.Othr.Id"] =
      settlement.beneficiaryCustomer.accountReference;
  }
  return withoutEmptyValues(base);
}
