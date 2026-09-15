import {
  paymentFinMessageType,
  paymentSettlementProfile,
} from "./payment-settlement-profile";

describe("payment settlement profile selection", () => {
  it("uses MT103 for a Customer regardless of the requested compatibility view", () => {
    expect(paymentFinMessageType("CUSTOMER", "MT202")).toBe("MT103");
  });

  it("uses the exact supported Bank Message Index selection", () => {
    expect(paymentFinMessageType("BANK", "MT200")).toBe("MT200");
    expect(paymentFinMessageType("BANK", "MT205COV")).toBe("MT205COV");
  });

  it("keeps the legacy MT202 default outside the guarded CENTRAL_PAYMENT API path", () => {
    expect(paymentFinMessageType("BANK")).toBe("MT202");
    expect(paymentFinMessageType("BANK", "MT204")).toBe("MT202");
  });

  it("keeps Bank and Customer MX routing profiles separate", () => {
    expect(paymentSettlementProfile("BANK").mxMessageType).toBe(
      "pacs.009.001.08",
    );
    expect(paymentSettlementProfile("CUSTOMER").mxMessageType).toBe(
      "pacs.008.001.12",
    );
  });
});
