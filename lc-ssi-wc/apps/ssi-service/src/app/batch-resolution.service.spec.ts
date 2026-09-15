import { BadRequestException, HttpException } from "@nestjs/common";
import { BatchResolutionService } from "./batch-resolution.service";
import type { SsiApplicationService } from "./ssi-application.service";
import type { PaymentMessageIndexService } from "./payment-message-index.service";

const item = (position: number) => ({
  itemId: `ITEM-${position}`,
  consumer: "CENTRAL_PAYMENT",
  counterpartyId: "CITIUS33",
  counterpartyBankServiceId: "BANK-SVC-CITIUS33",
  counterpartyCountry: "US",
  currency: "USD",
  product: "CENTRAL_PAYMENT",
  businessFunction: "INTERBANK_TRANSFER",
  paymentLeg: "INTERBANK_SETTLEMENT",
  direction: "OUTBOUND",
  bookingEntity: "HK01",
  valueDate: "2026-09-09",
  amount: "100",
  messageType: "pacs.009.001.08",
  transactionReference: `TX-${position}`,
});

describe("BatchResolutionService", () => {
  const messageIndex = {
    getIndex: () => ({
      standardsRelease: "SR2026",
      maxBatchItems: 100,
      items: ["MT201", "MT203"].map((messageType, index) => ({
        order: index + 1,
        messageType,
        description: messageType,
        processingMode: "SPLIT" as const,
        profileStatus: "NO_DIRECT_1_TO_1_PROFILE",
        targetMessage: "pacs.009.001.08",
        businessService: "swift.cbprplus.04",
        selectable: true,
      })),
    }),
    findSelectable: (messageType: string) =>
      ["MT201", "MT203"].includes(messageType)
        ? {
            messageType,
            targetMessage: "pacs.009.001.08",
            selectable: true,
          }
        : undefined,
  } as PaymentMessageIndexService;

  it("processes all ten items and returns successes plus errors in input order", () => {
    const resolve = jest.fn((request: { transactionReference: string }) => {
      if (["TX-2", "TX-5"].includes(request.transactionReference))
        throw new BadRequestException("INVALID_TEST_ITEM");
      return {
        decision: "RESOLVED",
        recommendedRoute: { ssiId: `SSI-${request.transactionReference}` },
      };
    });
    const service = new BatchResolutionService(
      { resolve } as unknown as SsiApplicationService,
      messageIndex,
    );

    const response = service.resolve({
      batchReference: "BATCH-10",
      sourceMessageType: "MT203",
      items: Array.from({ length: 10 }, (_, index) => item(index + 1)),
    });

    expect(resolve).toHaveBeenCalledTimes(10);
    expect(response.status).toBe("PARTIAL_SUCCESS");
    expect(response.outcomes.map((outcome) => outcome.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(response.successfulItems.map((outcome) => outcome.position)).toEqual(
      [1, 3, 4, 6, 7, 8, 9, 10],
    );
    expect(response.failedItems.map((outcome) => outcome.position)).toEqual([
      2, 5,
    ]);
    expect(
      response.failedItems.every(
        (outcome) => outcome.errorCode === "INVALID_TEST_ITEM",
      ),
    ).toBe(true);
  });

  it("rejects duplicate item IDs before processing", () => {
    const resolve = jest.fn();
    const service = new BatchResolutionService(
      { resolve } as unknown as SsiApplicationService,
      messageIndex,
    );
    expect(() =>
      service.resolve({
        batchReference: "B",
        sourceMessageType: "MT201",
        items: [item(1), { ...item(2), itemId: "ITEM-1" }],
      }),
    ).toThrow("DUPLICATE_BATCH_ITEM_ID");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("reports SUCCESS when every item resolves", () => {
    const resolve = jest.fn(() => ({
      decision: "RESOLVED",
      recommendedRoute: { ssiId: "SSI-1" },
    }));
    const service = new BatchResolutionService(
      { resolve } as unknown as SsiApplicationService,
      messageIndex,
    );
    const response = service.resolve({
      batchReference: "ALL-GOOD",
      sourceMessageType: "MT201",
      items: [item(1), item(2)],
    });
    expect(response).toMatchObject({
      status: "SUCCESS",
      successCount: 2,
      errorCount: 0,
    });
  });

  it("reports FAILED and retains domain reason codes when no item has an eligible route", () => {
    const resolve = jest.fn(() => ({
      decision: "NO_ELIGIBLE_ROUTE",
      explanation: "Every route failed",
    }));
    const service = new BatchResolutionService(
      { resolve } as unknown as SsiApplicationService,
      messageIndex,
    );
    const response = service.resolve({
      batchReference: "ALL-BAD",
      sourceMessageType: "MT203",
      items: [item(1), item(2)],
    });
    expect(response).toMatchObject({
      status: "FAILED",
      successCount: 0,
      errorCount: 2,
    });
    expect(response.failedItems[0]).toMatchObject({
      errorCode: "NO_ELIGIBLE_ROUTE",
      message: "Every route failed",
    });
  });

  it("uses the default explanation for a no-route decision without details", () => {
    const service = new BatchResolutionService(
      {
        resolve: () => ({ decision: undefined }),
      } as unknown as SsiApplicationService,
      messageIndex,
    );
    expect(
      service.resolve({
        batchReference: "NO-DETAIL",
        sourceMessageType: "MT201",
        items: [item(1)],
      }).failedItems[0],
    ).toMatchObject({
      errorCode: "NO_ELIGIBLE_ROUTE",
      message: "No eligible SSI route",
    });
  });

  it.each([
    [new HttpException("STRING_CODE", 400), "STRING_CODE"],
    [new HttpException({ message: ["ARRAY_CODE"] }, 400), "ARRAY_CODE"],
    [new HttpException({ message: [] }, 400), "RESOLUTION_FAILED"],
    [new HttpException({ code: "CODE_ONLY" }, 400), "CODE_ONLY"],
    [new HttpException({}, 400), "RESOLUTION_FAILED"],
    [new Error("PLAIN_ERROR"), "PLAIN_ERROR"],
    [{ unexpected: true }, "RESOLUTION_FAILED"],
  ])(
    "normalizes per-item resolver errors without stopping the batch",
    (thrown, expectedCode) => {
      const service = new BatchResolutionService(
        {
          resolve: () => {
            throw thrown;
          },
        } as unknown as SsiApplicationService,
        messageIndex,
      );
      const response = service.resolve({
        batchReference: "ERROR-SHAPES",
        sourceMessageType: "MT203",
        items: [item(1)],
      });
      expect(response.failedItems[0]?.errorCode).toBe(expectedCode);
    },
  );

  it.each([
    [
      { batchReference: "", sourceMessageType: "MT201", items: [item(1)] },
      "BATCH_REFERENCE_REQUIRED",
    ],
    [
      { batchReference: "B", sourceMessageType: "MT202", items: [item(1)] },
      "MESSAGE_TYPE_NOT_SUPPORTED",
    ],
    [
      { batchReference: "B", sourceMessageType: "MT201", items: [] },
      "BATCH_ITEMS_REQUIRED",
    ],
    [
      {
        batchReference: "B",
        sourceMessageType: "MT201",
        items: [{ ...item(1), itemId: "" }],
      },
      "BATCH_ITEM_ID_REQUIRED",
    ],
  ])(
    "validates the batch envelope before calling the single resolver",
    (request, code) => {
      const resolve = jest.fn();
      const service = new BatchResolutionService(
        { resolve } as unknown as SsiApplicationService,
        messageIndex,
      );
      expect(() => service.resolve(request as never)).toThrow(code);
      expect(resolve).not.toHaveBeenCalled();
    },
  );

  it("uses the parameterized maximum batch size", () => {
    const limitedIndex = {
      getIndex: () => ({ ...messageIndex.getIndex(), maxBatchItems: 1 }),
    } as PaymentMessageIndexService;
    const resolve = jest.fn();
    const service = new BatchResolutionService(
      { resolve } as unknown as SsiApplicationService,
      limitedIndex,
    );
    expect(() =>
      service.resolve({
        batchReference: "TOO-LARGE",
        sourceMessageType: "MT201",
        items: [item(1), item(2)],
      }),
    ).toThrow("BATCH_SIZE_LIMIT_EXCEEDED");
    expect(resolve).not.toHaveBeenCalled();
  });
});
