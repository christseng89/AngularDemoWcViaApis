import { BadRequestException } from "@nestjs/common";
import type { RouteResolutionRequest } from "./route-resolution.policy";
import type { PaymentMessageIndexService } from "./payment-message-index.service";
import { toMt2BankResolutionRequest } from "./mt2-settlement-request.policy";

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
});
