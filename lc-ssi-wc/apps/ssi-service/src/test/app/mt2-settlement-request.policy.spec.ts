import { BadRequestException } from "@nestjs/common";
import type { RouteResolutionRequest } from "../../app/route-resolution.policy";
import type { PaymentMessageIndexService } from "../../app/payment-message-index.service";
import { toMt2BankResolutionRequest } from "../../app/mt2-settlement-request.policy";

const request = {
  consumer: "CENTRAL_PAYMENT",
  counterpartyId: "BARCGB22",
  counterpartyBankServiceId: "BANK-SVC-BARCGB22",
  counterpartyCountry: "GB",
  currency: "USD",
  product: "CENTRAL_PAYMENT",
  businessFunction: "INTERBANK_TRANSFER",
  paymentLeg: "INTERBANK_SETTLEMENT",
  direction: "OUTBOUND",
  bookingEntity: "HK01",
  valueDate: "2026-09-10",
  amount: "1000000",
  messageType: "pacs.009.001.08",
  sourceMessageType: "MT202",
  transactionReference: "MT202-2026-000001",
};

const messageIndex = {
  findSelectable: jest.fn((messageType: string) =>
    messageType === "MT202"
      ? {
          messageType: "MT202",
          targetMessage: "pacs.009.001.08",
          businessService: "swift.cbprplus.04",
          selectable: true,
        }
      : undefined,
  ),
} as unknown as PaymentMessageIndexService;

describe("MT2 settlement request policy", () => {
  it("derives BANK from the selected MT2 message profile", () => {
    expect(toMt2BankResolutionRequest(request, messageIndex)).toEqual({
      ...request,
      profileId: "MT2-MT202-PLAIN-SR2026",
      pairedEvidenceProfileId: "PACS009-PLAIN-SR2026",
      paymentDirection: "OUTWARD",
      localBankRole: "INSTRUCTING_AGENT",
      businessService: "swift.cbprplus.04",
      counterpartyBic: "BARCGB22",
      counterpartyType: "BANK",
    });
  });

  it("rejects a client-supplied counterparty type", () => {
    expect(() =>
      toMt2BankResolutionRequest(
        { ...request, counterpartyType: "BANK" } as RouteResolutionRequest,
        messageIndex,
      ),
    ).toThrow(new BadRequestException("MT2_COUNTERPARTY_TYPE_NOT_ACCEPTED"));
  });

  it.each([
    [{ ...request, currency: "" }, "INVALID_ISO_4217_CURRENCY"],
    [
      { ...request, counterpartyBankServiceId: undefined },
      "BANK_SERVICE_ID_REQUIRED",
    ],
    [
      { ...request, counterpartyBic: "CITIUS33" },
      "MT2_COUNTERPARTY_BIC_NOT_ACCEPTED",
    ],
    [{ ...request, accountWithBic: "CITIUS33" }, "MT2_MANUAL_BIC_NOT_ACCEPTED"],
  ])("rejects a Bank Service identity bypass", (invalid, code) => {
    expect(() =>
      toMt2BankResolutionRequest(
        invalid as RouteResolutionRequest,
        messageIndex,
      ),
    ).toThrow(code);
  });

  it.each([
    [
      { ...request, sourceMessageType: undefined },
      "PAYMENT_SOURCE_MESSAGE_TYPE_REQUIRED",
    ],
    [{ ...request, sourceMessageType: "MT204" }, "MESSAGE_TYPE_NOT_SUPPORTED"],
    [
      { ...request, messageType: "pacs.008.001.12" },
      "PAYMENT_SOURCE_TARGET_MISMATCH",
    ],
  ])("rejects an invalid Message Index context", (invalid, code) => {
    expect(() => toMt2BankResolutionRequest(invalid, messageIndex)).toThrow(
      code,
    );
  });

  it("uses the batch-level MT2 message type", () => {
    const item = { ...request, sourceMessageType: undefined };
    expect(
      toMt2BankResolutionRequest(item, messageIndex, "MT202").counterpartyType,
    ).toBe("BANK");
  });

  it.each([
    [
      "MT202",
      "MT2-MT202-PLAIN-SR2026",
      "PACS009-PLAIN-SR2026",
      "swift.cbprplus.04",
    ],
    [
      "MT202COV",
      "MT2-MT202COV-COV-SR2026",
      "PACS009-COV-SR2026",
      "swift.cbprplus.cov.04",
    ],
    [
      "MT205",
      "MT2-MT205-PLAIN-SR2026",
      "PACS009-PLAIN-SR2026",
      "swift.cbprplus.04",
    ],
    [
      "MT205COV",
      "MT2-MT205COV-COV-SR2026",
      "PACS009-COV-SR2026",
      "swift.cbprplus.cov.04",
    ],
  ])(
    "binds %s to its exact outward SSI profile",
    (
      sourceMessageType,
      profileId,
      pairedEvidenceProfileId,
      businessService,
    ) => {
      const index = {
        findSelectable: jest.fn(() => ({
          messageType: sourceMessageType,
          targetMessage: "pacs.009.001.08",
          businessService,
          selectable: true,
        })),
      } as unknown as PaymentMessageIndexService;

      expect(
        toMt2BankResolutionRequest({ ...request, sourceMessageType }, index),
      ).toMatchObject({
        profileId,
        pairedEvidenceProfileId,
        paymentDirection: "OUTWARD",
        localBankRole: "INSTRUCTING_AGENT",
        businessService,
      });
    },
  );
});
