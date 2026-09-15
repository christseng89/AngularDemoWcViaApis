import {
  paymentSettlementProfile,
  renderPaymentSettlement,
  type CanonicalPaymentSettlement,
} from "./payment-settlement-profile";

const canonical = (
  finMessageType: CanonicalPaymentSettlement["finMessageType"],
): CanonicalPaymentSettlement => ({
  finMessageType,
  instructingAgentBic: "DEMOHKHH",
  instructedAgentBic: "HSBCHKHH",
  deliveryAgentBic: "HSBCHKHH",
  intermediaryAgentBics: [],
  creditorAgentBic: "HSBCHKHH",
  beneficiaryInstitutionBic: finMessageType === "MT103" ? "" : "BARCGB22",
  ...(finMessageType === "MT103"
    ? {
        beneficiaryCustomer: {
          customerId: "CUST-00001",
          name: "Demo Global Trading Ltd.",
          accountReference: "BENEFICIARY-00001",
        },
      }
    : {}),
  reimbursementAgentBics: ["HSBCHKHH"],
  settlementAccountReference: "DEMO-NOSTRO-HKD",
  settlementCountry: "HK",
  settlementMarket: "HK_DOLLAR",
  clearingSystem: "HKD_CHATS",
  schemeType: "RTGS",
  fieldProvenance: {},
});

describe("payment settlement message profiles", () => {
  it("maps Customer payments to pacs.008 and MT103", () => {
    expect(paymentSettlementProfile("CUSTOMER")).toMatchObject({
      businessFunction: "CUSTOMER_CREDIT_TRANSFER",
      paymentLeg: "CUSTOMER_TRANSFER",
      mxMessageType: "pacs.008.001.12",
      mtMessageType: "MT103",
    });
  });

  it("maps Bank payments to pacs.009 and MT202", () => {
    expect(paymentSettlementProfile("BANK")).toMatchObject({
      businessFunction: "INTERBANK_TRANSFER",
      paymentLeg: "INTERBANK_SETTLEMENT",
      mxMessageType: "pacs.009.001.08",
      mtMessageType: "MT202",
    });
  });

  it("never renders 58A for MT103 and renders mandatory beneficiary customer 59", () => {
    const rendered = renderPaymentSettlement("MT", canonical("MT103"));
    expect(rendered).toHaveProperty("59");
    expect(rendered).not.toHaveProperty("58A");
  });

  it("renders 58A for MT202 and never renders customer field 59", () => {
    const rendered = renderPaymentSettlement("MT", canonical("MT202"));
    expect(rendered).toHaveProperty("58A", "BARCGB22");
    expect(rendered).not.toHaveProperty("59");
  });

  it("renders only mandatory 58A for a normalized direct MT202 route", () => {
    const rendered = renderPaymentSettlement("MT", {
      ...canonical("MT202"),
      deliveryAgentBic: "",
      creditorAgentBic: "",
      beneficiaryInstitutionBic: "CITIUS33",
    });
    expect(rendered).toEqual({ "58A": "CITIUS33" });
  });

  it("renders the MT200 MRG fixture with mandatory 57A and no illegal 53A or 58A", () => {
    const rendered = renderPaymentSettlement("MT", {
      ...canonical("MT200"),
      instructedAgentBic: "CITIUS33",
      creditorAgentBic: "CITIUS33",
      clearingSystem: "FEDWIRE",
    });
    expect(rendered).toEqual({ "57A": "//FW\nCITIUS33" });
    expect(rendered).not.toHaveProperty("53A");
    expect(rendered).not.toHaveProperty("58A");
  });

  it("uses the instructed agent for mandatory MT200 57A when no separate account-with institution exists", () => {
    expect(
      renderPaymentSettlement("MT", {
        ...canonical("MT200"),
        instructedAgentBic: "CITIUS33",
        creditorAgentBic: "",
      }),
    ).toEqual({ "57A": "CITIUS33" });
  });

  it("renders each split MT201 transaction without inventing a sequence letter", () => {
    expect(
      renderPaymentSettlement("MT", {
        ...canonical("MT201"),
        creditorAgentBic: "CITIUS33",
      }),
    ).toEqual({ "57A": "CITIUS33" });
  });

  it("uses the instructed agent for mandatory MT201 57A when the split item has no separate account-with institution", () => {
    expect(
      renderPaymentSettlement("MT", {
        ...canonical("MT201"),
        instructedAgentBic: "CITIUS33",
        creditorAgentBic: "",
      }),
    ).toEqual({ "57A": "CITIUS33" });
  });

  it("applies MT202 direct-route omission and emits //FW once in the first applicable field", () => {
    expect(
      renderPaymentSettlement("MT", {
        ...canonical("MT202"),
        instructedAgentBic: "CITIUS33",
        deliveryAgentBic: "CITIUS33",
        creditorAgentBic: "CITIUS33",
        clearingSystem: "FEDWIRE",
      }),
    ).toEqual({ "58A": "//FW\nBARCGB22" });
  });

  it("emits the MRG RTGS clearing identifier once for T2", () => {
    expect(
      renderPaymentSettlement("MT", {
        ...canonical("MT202"),
        deliveryAgentBic: "",
        creditorAgentBic: "",
        clearingSystem: "T2",
      }),
    ).toEqual({ "58A": "//RT\nBARCGB22" });
  });

  it("does not invent a clearing field when no MT agent field is derivable", () => {
    expect(
      renderPaymentSettlement("MT", {
        ...canonical("MT202"),
        deliveryAgentBic: "",
        creditorAgentBic: "",
        beneficiaryInstitutionBic: "",
        clearingSystem: "T2",
      }),
    ).toEqual({});
  });

  it("qualifies MT202 COV SSI fields as Sequence A and does not generate Sequence B parties", () => {
    const rendered = renderPaymentSettlement("MT", {
      ...canonical("MT202COV"),
      deliveryAgentBic: "",
      creditorAgentBic: "",
    });
    expect(rendered).toEqual({ "A.58A": "BARCGB22" });
    expect(Object.keys(rendered).some((key) => key.startsWith("B."))).toBe(
      false,
    );
  });

  it("renders each split MT203 transaction without inventing a sequence letter", () => {
    expect(
      renderPaymentSettlement("MT", {
        ...canonical("MT203"),
        deliveryAgentBic: "",
        creditorAgentBic: "",
      }),
    ).toEqual({ "58A": "BARCGB22" });
  });

  it("omits MT203 57A when the Receiver is the account-with institution", () => {
    expect(
      renderPaymentSettlement("MT", {
        ...canonical("MT203"),
        instructedAgentBic: "HSBCHKHH",
        creditorAgentBic: "HSBCHKHH",
      }),
    ).toEqual({ "58A": "BARCGB22" });
  });

  it.each(["MT205", "MT205COV"] as const)(
    "returns NOT_SUPPORTED for %s when mandatory 52A is not derivable",
    (messageType) => {
      expect(renderPaymentSettlement("MT", canonical(messageType))).toEqual({
        status: "NOT_SUPPORTED",
        reasonCode: "MANDATORY_52A_NOT_DERIVABLE",
      });
    },
  );

  it("renders MT205 mandatory 52A when supplied by upstream transaction context", () => {
    const rendered = renderPaymentSettlement("MT", {
      ...canonical("MT205"),
      deliveryAgentBic: "",
      creditorAgentBic: "",
      orderingInstitutionBic: "CHASUS33",
    });
    expect(rendered).toEqual({
      "52A": "CHASUS33",
      "58A": "BARCGB22",
    });
  });

  it("keeps MT205 COV SSI roles in Sequence A when mandatory upstream 52A exists", () => {
    expect(
      renderPaymentSettlement("MT", {
        ...canonical("MT205COV"),
        deliveryAgentBic: "",
        creditorAgentBic: "",
        orderingInstitutionBic: "CHASUS33",
      }),
    ).toEqual({
      "A.52A": "CHASUS33",
      "A.58A": "BARCGB22",
    });
  });

  it("renders an MX pacs payload without MT tags or empty elements", () => {
    const rendered = renderPaymentSettlement("MX", canonical("MT103"));
    expect(rendered).toMatchObject({
      "CdtTrfTxInf.CdtrAgt.FinInstnId.BICFI": "HSBCHKHH",
      "CdtTrfTxInf.Cdtr.Nm": "Demo Global Trading Ltd.",
      "CdtTrfTxInf.CdtrAcct.Id.Othr.Id": "BENEFICIARY-00001",
    });
    expect(rendered).not.toHaveProperty("53A");
    expect(Object.keys(rendered)).not.toContain(
      "CdtTrfTxInf.IntrmyAgt1.FinInstnId.BICFI",
    );
  });
});
